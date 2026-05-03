"""Core WebSocket client for real-time events.

Manages WebSocket connection to OnyxCore for receiving status updates
and other real-time events.
"""

import asyncio
import contextlib
import json
import logging
from typing import TYPE_CHECKING, Any

import websockets

from src.config import CORE_URL, Status

if TYPE_CHECKING:
    from src.state_manager import StateManager
    from src.websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


class CoreWsClient:
    """Manages WebSocket connection to OnyxCore."""

    def __init__(self, state_manager: "StateManager", ws_manager: "WebSocketManager"):
        """Initialize CoreWsClient.

        Args:
            state_manager: Reference to StateManager for refresh operations.
            ws_manager: Reference to WebSocketManager for broadcasting.
        """
        self.state_manager = state_manager
        self.ws_manager = ws_manager
        self._running = False
        self._task: Any = None

    async def start(self) -> None:
        """Start Core WebSocket connection.

        Creates an asyncio task for the connection loop.
        """
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Core WebSocket démarré")

    async def stop(self) -> None:
        """Stop Core WebSocket connection.

        Cancels the connection task.
        """
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        logger.info("Core WebSocket arrêté")

    async def _loop(self) -> None:
        """WebSocket connection loop with auto-reconnect.

        Maintains persistent connection to Core WebSocket with
        automatic reconnection on failure.
        """
        core_ws_url = (
            CORE_URL.replace("http://", "ws://").replace("https://", "wss://") + "/ws"
        )

        while self._running:
            try:
                logger.info(f"Connexion Core WebSocket: {core_ws_url}")
                async with websockets.connect(core_ws_url) as ws:
                    logger.info("Core WebSocket connecté")

                    async for message in ws:
                        try:
                            event = json.loads(message)
                            await self._handle_event(event)
                        except json.JSONDecodeError as e:
                            logger.warning(f"Core WS message invalide: {e}")

            except websockets.exceptions.ConnectionClosed:
                logger.warning("Core WebSocket déconnecté, reconnexion dans 5s...")
            except Exception as e:
                logger.error(f"Erreur Core WebSocket: {e}")

            if self._running:
                await asyncio.sleep(5)

    async def _handle_event(self, event: dict[str, Any]) -> None:
        """Handle event from Core WebSocket.

        Args:
            event: Event dictionary from Core.
        """
        event_type = event.get("type", "")

        refresh_events = {
            "skill:registered",
            "skill:unregistered",
            "deploy:completed",
            "deploy:failed",
            "heart:connected",
            "heart:disconnected",
        }

        status_events = {
            "skill:status_changed",
            "heart:metrics",
        }

        if event_type in refresh_events:
            logger.info(f"Core event {event_type} → refresh complet")
            state = await self.state_manager.refresh_all()
            await self.ws_manager.broadcast(
                {
                    "type": "refresh",
                    "reason": event_type,
                    "data": state.model_dump(mode="json"),
                }
            )

        elif event_type in status_events:
            data = event.get("data", {})

            if event_type == "skill:status_changed":
                skill_name = data.get("name") or data.get("skill")
                new_status = data.get("status", "UNKNOWN")
                logger.debug(f"Core event: skill {skill_name} → {new_status}")

                async with self.state_manager._lock:
                    skill = self.state_manager._skills.get(skill_name)
                    if skill:
                        try:
                            skill.status = Status(new_status.upper())
                        except ValueError:
                            skill.status = Status.UNKNOWN

                await self.ws_manager.broadcast_status_update(
                    "skill", skill_name, new_status
                )

            elif event_type == "heart:metrics":
                node = data.get("node") or data.get("hostname")
                metrics = data.get("metrics", {})
                logger.debug(f"Core event: heart metrics {node}")

                await self.ws_manager.broadcast_metrics_update(node, metrics)

        elif event_type == "skill:heartbeat":
            pass

        else:
            logger.debug(f"Core event ignoré: {event_type}")
