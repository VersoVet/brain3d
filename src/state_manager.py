"""
Brain3D - Gestionnaire d'état simplifié
Cache + broadcast WebSocket - la logique métier est dans DataClient
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .config import (
    Status, CACHE_TTL,
    STATUS_COLORS, STATUS_ANIMATIONS, MACHINE_SHAPES, MACHINE_BASE_COLORS
)
from .models import Machine, Skill, Area, NetworkState, RedisEvent, Metrics
from .data_client import DataClient
from .websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


class StateManager:
    """
    Gestionnaire d'état simplifié pour Brain3D.
    - Utilise DataClient pour récupérer les données
    - Gère le cache et les updates temps réel
    - Broadcast les changements via WebSocket
    """

    def __init__(self, data_client: DataClient, ws_manager: WebSocketManager):
        self.data_client = data_client
        self.ws_manager = ws_manager

        # Cache simple
        self._state: Optional[NetworkState] = None
        self._last_refresh = datetime.min
        self._cache_ttl = timedelta(seconds=CACHE_TTL)

        # Index pour accès rapide
        self._machines: Dict[str, Machine] = {}
        self._skills: Dict[str, Skill] = {}
        self._areas: Dict[str, Area] = {}

        # Lock pour accès concurrent
        self._lock = asyncio.Lock()

    # =========================================================================
    # Refresh depuis les sources
    # =========================================================================

    async def refresh_all(self) -> NetworkState:
        """Rafraîchit tout l'état depuis Core + network-inventory"""
        async with self._lock:
            # Récupérer l'état complet via DataClient
            self._state = await self.data_client.get_full_state()

            # Mettre à jour les index
            self._machines = {m.node_id: m for m in self._state.machines}
            self._skills = {s.name: s for s in self._state.skills}
            self._areas = {a.id: a for a in self._state.areas}

            self._last_refresh = datetime.now()

            logger.info(
                f"State refreshed: {len(self._machines)} machines, "
                f"{len(self._skills)} skills, {len(self._areas)} areas"
            )

            return self._state

    async def refresh_if_stale(self) -> Optional[NetworkState]:
        """Rafraîchit seulement si le cache est expiré"""
        if datetime.now() - self._last_refresh > self._cache_ttl:
            return await self.refresh_all()
        return None

    # =========================================================================
    # Traitement événements Redis
    # =========================================================================

    async def handle_redis_event(self, event: RedisEvent) -> None:
        """Traite un événement Redis et propage les updates"""
        event_type = event.type.lower()

        if event_type == "heartbeat":
            await self._handle_heartbeat(event)

        elif event_type in ("status_change", "skill_status"):
            await self._handle_status_change(event)

        elif event_type == "skill_started":
            await self._handle_skill_event(event, started=True)

        elif event_type == "skill_stopped":
            await self._handle_skill_event(event, started=False)

        elif event_type in ("sync_complete", "infrastructure_change"):
            # Refresh complet pour ces événements
            await self._handle_full_refresh(event_type)

        elif event_type in ("new_device_discovered", "device_offline", "device_online"):
            # Événements network-inventory → refresh complet
            await self._handle_full_refresh(event_type)

        else:
            logger.debug(f"Event Redis ignoré: {event_type}")

    async def _handle_heartbeat(self, event: RedisEvent) -> None:
        """Traite un heartbeat - met à jour les métriques"""
        node_id = event.node
        data = event.data

        async with self._lock:
            machine = self._machines.get(node_id)
            if machine:
                # Mettre à jour les métriques
                machine.metrics = Metrics(
                    cpu_percent=data.get("cpu_percent", data.get("cpu", 0)),
                    ram_percent=data.get("memory_percent", data.get("ram_percent", 0)),
                    disk_percent=data.get("disk_percent", 0),
                    temp_celsius=data.get("temp", data.get("temp_celsius")),
                )
                machine.last_heartbeat = datetime.now()
                machine.uptime_seconds = data.get("uptime_seconds", 0)

        # Broadcast aux clients
        await self.ws_manager.broadcast_metrics_update(node_id, data)

    async def _handle_status_change(self, event: RedisEvent) -> None:
        """Traite un changement de statut de skill"""
        data = event.data
        skill_name = data.get("skill_name") or data.get("skill")
        new_status_str = data.get("status", "UNKNOWN").upper()

        try:
            new_status = Status(new_status_str)
        except ValueError:
            new_status = Status.UNKNOWN

        old_status = None
        async with self._lock:
            skill = self._skills.get(skill_name)
            if skill:
                old_status = skill.status
                skill.status = new_status

        # Broadcast le changement
        await self.ws_manager.broadcast_status_update(
            "skill", skill_name, new_status.value,
            {"old_status": old_status.value if old_status else None}
        )

    async def _handle_skill_event(self, event: RedisEvent, started: bool) -> None:
        """Traite un événement skill started/stopped"""
        data = event.data
        skill_name = data.get("skill_name") or data.get("skill")
        new_status = Status.UP if started else Status.DOWN

        async with self._lock:
            skill = self._skills.get(skill_name)
            if skill:
                skill.status = new_status

        await self.ws_manager.broadcast_status_update(
            "skill", skill_name, new_status.value
        )

    async def _handle_full_refresh(self, reason: str) -> None:
        """Refresh complet et broadcast"""
        state = await self.refresh_all()
        await self.ws_manager.broadcast({
            "type": "refresh",
            "reason": reason,
            "data": state.model_dump(mode='json'),
        })

    # =========================================================================
    # Getters
    # =========================================================================

    def get_network_state(self) -> NetworkState:
        """Retourne l'état complet du réseau"""
        if self._state:
            return self._state
        # État vide si pas encore chargé
        return NetworkState()

    def get_machine(self, node_id: str) -> Optional[Machine]:
        """Retourne une machine par son ID"""
        return self._machines.get(node_id)

    def get_skill(self, name: str) -> Optional[Skill]:
        """Retourne un skill par son nom"""
        return self._skills.get(name)

    def get_area(self, area_id: str) -> Optional[Area]:
        """Retourne une aire par son ID"""
        return self._areas.get(area_id)

    def get_skills_by_area(self, area_id: str) -> List[Skill]:
        """Retourne les skills d'une aire"""
        return [s for s in self._skills.values() if s.brain_area == area_id]

    # =========================================================================
    # Helpers visualisation
    # =========================================================================

    def get_visual_config(self, entity_type: str, entity_id: str) -> dict:
        """Retourne la config visuelle pour une entité"""
        if entity_type == "machine":
            machine = self._machines.get(entity_id)
            if machine:
                return {
                    "shape": MACHINE_SHAPES.get(machine.machine_type, "sphere"),
                    "color": STATUS_COLORS.get(
                        machine.status,
                        MACHINE_BASE_COLORS.get(machine.machine_type, "#666666")
                    ),
                    "animation": STATUS_ANIMATIONS.get(machine.status, "none"),
                }

        elif entity_type == "skill":
            skill = self._skills.get(entity_id)
            if skill:
                return {
                    "shape": "sphere",
                    "color": STATUS_COLORS.get(skill.status, "#666666"),
                    "animation": STATUS_ANIMATIONS.get(skill.status, "none"),
                }

        elif entity_type == "area":
            area = self._areas.get(entity_id)
            if area:
                return {
                    "shape": "sphere",
                    "color": STATUS_COLORS.get(area.status, area.color),
                    "animation": STATUS_ANIMATIONS.get(area.status, "none"),
                }

        return {"shape": "sphere", "color": "#666666", "animation": "none"}
