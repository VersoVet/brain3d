"""Routeur d'evenements par channel Redis."""

import logging
from typing import TYPE_CHECKING, Any

from src.config import REDIS_CHANNELS, Status
from src.models import RedisEvent

if TYPE_CHECKING:
    from src.state_manager import StateManager
    from src.websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


class ChannelEventRouter:
    """Route les evenements Redis des canaux skill_status, broadcast, forge."""

    def __init__(self, state_manager: "StateManager", ws_manager: "WebSocketManager"):
        """Initialize ChannelEventRouter.

        Args:
            state_manager: StateManager pour mise a jour de l'etat.
            ws_manager: WebSocketManager pour diffusion aux clients.
        """
        self._state = state_manager
        self._ws = ws_manager
        self._handlers = {
            REDIS_CHANNELS["skill_status"]: self._handle_skill_status,
            REDIS_CHANNELS["broadcast"]: self._handle_broadcast,
            REDIS_CHANNELS["forge"]: self._handle_forge,
        }

    async def handle_event(self, event: RedisEvent, channel: str) -> None:
        """Route un evenement vers le handler du channel.

        Args:
            event: Evenement Redis recu.
            channel: Nom du channel source.
        """
        handler = self._handlers.get(channel)
        if handler:
            await handler(event)
        else:
            logger.debug(f"No handler for channel: {channel}")

    async def _handle_skill_status(self, event: RedisEvent) -> None:
        """Traite un evenement de statut skill via onyx_sdk.

        Format attendu depuis onyx_sdk:
        {
            "type": "skill_status",
            "node": "skill-name",
            "data": {"status": "UP|WORKING|DOWN", "message": "..."}
        }

        Args:
            event: Evenement skill_status.
        """
        data = event.data
        skill_name = event.node
        status_str = data.get("status", data.get("state", "UNKNOWN")).upper()
        message = data.get("message", "")

        try:
            new_status = Status(status_str)
        except ValueError:
            new_status = Status.UNKNOWN

        # Mise a jour dans le state
        old_status = None
        skill = self._state.get_skill(skill_name)

        if skill:
            old_status = skill.status
            skill.status = new_status
            logger.debug(
                f"Skill {skill_name}: {old_status} -> {new_status} ({message})"
            )

        # Broadcast aux clients WebSocket
        await self._ws.broadcast_status_update(
            "skill",
            skill_name,
            new_status.value,
            {
                "old_status": old_status.value if old_status else None,
                "message": message,
                "source": "onyx_sdk",
            },
        )

    async def _handle_broadcast(self, event: RedisEvent) -> None:
        """Traite un evenement broadcast systeme.

        Notifications globales: maintenance, alertes, annonces.

        Args:
            event: Evenement broadcast.
        """
        data = event.data
        broadcast_type = event.type
        severity = data.get("severity", "info")

        logger.info(
            f"Broadcast [{severity}]: {broadcast_type} - {data.get('message', '')}"
        )

        # Diffuser directement aux clients frontend
        await self._ws.broadcast(
            {
                "type": "broadcast",
                "subtype": broadcast_type,
                "severity": severity,
                "node": event.node,
                "message": data.get("message", ""),
                "data": data,
            }
        )

    async def _handle_forge(self, event: RedisEvent) -> None:
        """Traite un evenement Forge (build, deploy, validate).

        Format attendu:
        {
            "type": "build_started|build_completed|deploy_started|deploy_completed|validate_result",
            "node": "skill-name",
            "data": {"status": "...", "duration_ms": ..., "errors": [...]}
        }

        Args:
            event: Evenement forge.
        """
        data = event.data
        forge_action = event.type
        skill_name = event.node

        logger.info(f"Forge event: {forge_action} for {skill_name}")

        # Si deploy complete avec succes, rafraichir l'etat
        if forge_action in ("deploy_completed", "deploy_success"):
            deploy_status = data.get("status", "")
            if deploy_status == "success":
                await self._state._handle_full_refresh(f"forge_{forge_action}")
                return

        # Broadcast l'evenement forge aux clients
        await self._ws.broadcast(
            {
                "type": "forge_event",
                "action": forge_action,
                "skill": skill_name,
                "data": data,
            }
        )

    def get_stats(self) -> dict[str, Any]:
        """Retourne les statistiques des handlers.

        Returns:
            Dict avec les channels geres.
        """
        return {
            "channels_handled": list(self._handlers.keys()),
            "total_channels": len(self._handlers),
        }
