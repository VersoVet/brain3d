"""Gestionnaire de connexions WebSocket"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Set, Optional, Any
from dataclasses import dataclass, field

from fastapi import WebSocket, WebSocketDisconnect

from .config import WS_MAX_UPDATES_PER_SECOND, WS_HEARTBEAT_INTERVAL
from .models import WSMessage

logger = logging.getLogger(__name__)


@dataclass
class ConnectedClient:
    """Client WebSocket connecte"""
    websocket: WebSocket
    client_id: str
    connected_at: datetime = field(default_factory=datetime.now)
    view_mode: str = "network"  # network, internal
    focused_machine: Optional[str] = None
    focused_area: Optional[str] = None
    subscriptions: Set[str] = field(default_factory=set)  # Types d'events souhaites


class WebSocketManager:
    """Gestionnaire des connexions WebSocket"""

    def __init__(self):
        self._connections: Dict[str, ConnectedClient] = {}
        self._lock = asyncio.Lock()
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._running = False
        self._broadcast_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None

        # Rate limiting
        self._last_broadcast = datetime.now()
        self._min_interval = 1.0 / WS_MAX_UPDATES_PER_SECOND

    async def connect(self, websocket: WebSocket, client_id: str) -> ConnectedClient:
        """Accepte une nouvelle connexion WebSocket"""
        await websocket.accept()

        client = ConnectedClient(
            websocket=websocket,
            client_id=client_id,
        )

        async with self._lock:
            self._connections[client_id] = client

        logger.info(f"Client connecte: {client_id} (total: {len(self._connections)})")
        return client

    async def disconnect(self, client_id: str) -> None:
        """Deconnecte un client"""
        async with self._lock:
            if client_id in self._connections:
                del self._connections[client_id]

        logger.info(f"Client deconnecte: {client_id} (total: {len(self._connections)})")

    async def send_to_client(self, client_id: str, message: dict) -> bool:
        """Envoie un message a un client specifique"""
        async with self._lock:
            client = self._connections.get(client_id)

        if not client:
            return False

        try:
            await client.websocket.send_json(message)
            return True
        except Exception as e:
            logger.error(f"Erreur envoi a {client_id}: {e}")
            await self.disconnect(client_id)
            return False

    async def broadcast(self, message: dict, exclude: Optional[Set[str]] = None) -> int:
        """Broadcast un message a tous les clients"""
        exclude = exclude or set()
        sent = 0

        async with self._lock:
            clients = list(self._connections.items())

        for client_id, client in clients:
            if client_id in exclude:
                continue

            try:
                await client.websocket.send_json(message)
                sent += 1
            except Exception as e:
                logger.error(f"Erreur broadcast a {client_id}: {e}")
                await self.disconnect(client_id)

        return sent

    async def broadcast_status_update(
        self,
        target_type: str,  # skill, area, machine
        target_id: str,
        status: str,
        data: Optional[dict] = None
    ) -> int:
        """Broadcast une mise a jour de statut"""
        message = {
            "type": "status_update",
            "target": target_type,
            "id": target_id,
            "status": status,
            "data": data or {},
            "timestamp": datetime.now().isoformat(),
        }
        return await self.broadcast(message)

    async def broadcast_metrics_update(
        self,
        node_id: str,
        metrics: dict
    ) -> int:
        """Broadcast une mise a jour de metriques"""
        message = {
            "type": "metrics_update",
            "node_id": node_id,
            "metrics": metrics,
            "timestamp": datetime.now().isoformat(),
        }
        return await self.broadcast(message)

    async def broadcast_topology_change(
        self,
        action: str,  # add, remove, update
        entity_type: str,  # machine, skill, area
        entity: dict
    ) -> int:
        """Broadcast un changement de topologie"""
        message = {
            "type": "topology_change",
            "action": action,
            "entity_type": entity_type,
            "entity": entity,
            "timestamp": datetime.now().isoformat(),
        }
        return await self.broadcast(message)

    async def set_client_focus(
        self,
        client_id: str,
        view_mode: str,
        machine_id: Optional[str] = None,
        area_id: Optional[str] = None
    ) -> bool:
        """Met a jour le focus d'un client"""
        async with self._lock:
            client = self._connections.get(client_id)
            if not client:
                return False

            client.view_mode = view_mode
            client.focused_machine = machine_id
            client.focused_area = area_id

        return True

    async def handle_client_message(self, client_id: str, data: dict) -> dict:
        """Traite un message recu d'un client"""
        msg_type = data.get("type", "")

        if msg_type == "ping":
            return {"type": "pong", "timestamp": datetime.now().isoformat()}

        elif msg_type == "set_focus":
            await self.set_client_focus(
                client_id,
                view_mode=data.get("view_mode", "network"),
                machine_id=data.get("machine_id"),
                area_id=data.get("area_id"),
            )
            return {"type": "focus_updated", "success": True}

        elif msg_type == "subscribe":
            # Ajouter des subscriptions
            async with self._lock:
                client = self._connections.get(client_id)
                if client:
                    events = data.get("events", [])
                    client.subscriptions.update(events)
            return {"type": "subscribed", "events": list(data.get("events", []))}

        elif msg_type == "unsubscribe":
            # Retirer des subscriptions
            async with self._lock:
                client = self._connections.get(client_id)
                if client:
                    events = data.get("events", [])
                    client.subscriptions.difference_update(events)
            return {"type": "unsubscribed", "events": list(data.get("events", []))}

        elif msg_type == "refresh":
            # Demande de refresh - sera traite par le state manager
            return {"type": "refresh_requested"}

        else:
            return {"type": "error", "message": f"Unknown message type: {msg_type}"}

    async def _heartbeat_loop(self) -> None:
        """Envoie des heartbeats periodiques aux clients"""
        while self._running:
            try:
                await asyncio.sleep(WS_HEARTBEAT_INTERVAL)
                message = {
                    "type": "heartbeat",
                    "timestamp": datetime.now().isoformat(),
                    "clients": len(self._connections),
                }
                await self.broadcast(message)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Erreur heartbeat: {e}")

    async def start(self) -> None:
        """Demarre les taches en arriere-plan"""
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        logger.info("WebSocket manager demarre")

    async def stop(self) -> None:
        """Arrete les taches en arriere-plan"""
        self._running = False

        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        # Fermer toutes les connexions
        async with self._lock:
            for client_id, client in list(self._connections.items()):
                try:
                    await client.websocket.close()
                except:
                    pass
            self._connections.clear()

        logger.info("WebSocket manager arrete")

    @property
    def connection_count(self) -> int:
        """Nombre de connexions actives"""
        return len(self._connections)

    def get_stats(self) -> dict:
        """Statistiques des connexions"""
        return {
            "total_connections": len(self._connections),
            "clients": [
                {
                    "id": c.client_id,
                    "connected_at": c.connected_at.isoformat(),
                    "view_mode": c.view_mode,
                    "focused_machine": c.focused_machine,
                }
                for c in self._connections.values()
            ],
        }
