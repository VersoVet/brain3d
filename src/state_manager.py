"""Simplified state manager for Brain3D.

Manages caching, indexes, and broadcasts. Business logic is delegated to DataClient.
WebSocket connection to Core is delegated to CoreWsClient.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

from src.config import (
    CACHE_TTL,
    MACHINE_SHAPES,
    STATUS_ANIMATIONS,
    STATUS_COLORS,
    Status,
)
from src.core_ws_client import CoreWsClient
from src.data_client import DataClient
from src.models import Area, Machine, Metrics, NetworkState, RedisEvent, Skill
from src.websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


class StateManager:
    """State manager for Brain3D caching and broadcasting."""

    def __init__(self, data_client: DataClient, ws_manager: WebSocketManager):
        """Initialize StateManager.

        Args:
            data_client: DataClient for fetching system state.
            ws_manager: WebSocketManager for broadcasting updates.
        """
        self.data_client = data_client
        self.ws_manager = ws_manager

        # Cache
        self._state: NetworkState | None = None
        self._last_refresh = datetime.min
        self._cache_ttl = timedelta(seconds=CACHE_TTL)

        # Indexes for fast lookups
        self._machines: dict[str, Machine] = {}
        self._skills: dict[str, Skill] = {}
        self._areas: dict[str, Area] = {}

        # Concurrent access lock
        self._lock = asyncio.Lock()

        # Core WebSocket client
        self._core_ws_client = CoreWsClient(self, ws_manager)

    async def refresh_all(self) -> NetworkState:
        """Refresh all state from data sources.

        Returns:
            Updated NetworkState.
        """
        async with self._lock:
            self._state = await self.data_client.get_full_state()

            self._machines = {m.node_id: m for m in self._state.machines}
            self._skills = {s.name: s for s in self._state.skills}
            self._areas = {a.id: a for a in self._state.areas}

            self._last_refresh = datetime.now()

            logger.info(
                f"State refreshed: {len(self._machines)} machines, "
                f"{len(self._skills)} skills, {len(self._areas)} areas"
            )

            return self._state

    async def refresh_if_stale(self) -> NetworkState | None:
        """Refresh state only if cache expired.

        Returns:
            Updated NetworkState if refreshed, None if cache still valid.
        """
        if datetime.now() - self._last_refresh > self._cache_ttl:
            return await self.refresh_all()
        return None

    async def handle_redis_event(self, event: RedisEvent) -> None:
        """Handle Redis event and propagate updates.

        Args:
            event: Redis event from subscriber.
        """
        event_type = event.type.lower()

        if event_type == "heartbeat":
            await self._handle_heartbeat(event)

        elif event_type in ("status_change", "skill_status"):
            await self._handle_status_change(event)

        elif event_type == "skill_started":
            await self._handle_skill_event(event, started=True)

        elif event_type == "skill_stopped":
            await self._handle_skill_event(event, started=False)

        elif event_type in ("sync_complete", "infrastructure_change") or event_type in (
            "new_device_discovered",
            "device_offline",
            "device_online",
        ):
            await self._handle_full_refresh(event_type)

        else:
            logger.debug(f"Event Redis ignoré: {event_type}")

    async def _handle_heartbeat(self, event: RedisEvent) -> None:
        """Handle heartbeat event.

        Args:
            event: Heartbeat event with metrics.
        """
        node_id = event.node
        data = event.data

        async with self._lock:
            machine = self._machines.get(node_id)
            if machine:
                machine.metrics = Metrics(
                    cpu_percent=data.get("cpu_percent", data.get("cpu", 0)),
                    ram_percent=data.get("memory_percent", data.get("ram_percent", 0)),
                    disk_percent=data.get("disk_percent", 0),
                    temp_celsius=data.get("temp", data.get("temp_celsius")),
                )
                machine.last_heartbeat = datetime.now()
                machine.uptime_seconds = data.get("uptime_seconds", 0)

        await self.ws_manager.broadcast_metrics_update(node_id, data)

    async def _handle_status_change(self, event: RedisEvent) -> None:
        """Handle skill status change.

        Args:
            event: Status change event.
        """
        data = event.data
        skill_name = data.get("skill_name") or data.get("skill")
        new_status_str = data.get("status", "UNKNOWN").upper()

        try:
            new_status = Status(new_status_str)
        except ValueError:
            new_status = Status.UNKNOWN

        old_status = None
        async with self._lock:
            if isinstance(skill_name, str):
                skill = self._skills.get(skill_name)
                if skill:
                    old_status = skill.status
                    skill.status = new_status

        if isinstance(skill_name, str):
            await self.ws_manager.broadcast_status_update(
                "skill",
                skill_name,
                new_status.value,
                {"old_status": old_status.value if old_status else None},
            )

    async def _handle_skill_event(self, event: RedisEvent, started: bool) -> None:
        """Handle skill started/stopped event.

        Args:
            event: Skill event.
            started: True if skill started, False if stopped.
        """
        data = event.data
        skill_name = data.get("skill_name") or data.get("skill")
        new_status = Status.UP if started else Status.DOWN

        async with self._lock:
            if isinstance(skill_name, str):
                skill = self._skills.get(skill_name)
                if skill:
                    skill.status = new_status

        if isinstance(skill_name, str):
            await self.ws_manager.broadcast_status_update(
                "skill", skill_name, new_status.value
            )

    async def _handle_full_refresh(self, reason: str) -> None:
        """Handle event requiring full refresh.

        Args:
            reason: Reason for refresh.
        """
        state = await self.refresh_all()
        await self.ws_manager.broadcast(
            {
                "type": "refresh",
                "reason": reason,
                "data": state.model_dump(mode="json"),
            }
        )

    def get_network_state(self) -> NetworkState:
        """Get complete network state.

        Returns:
            Current NetworkState or empty state if not loaded.
        """
        if self._state:
            return self._state
        return NetworkState()

    def get_machine(self, node_id: str) -> Machine | None:
        """Get machine by ID.

        Args:
            node_id: Machine node ID.

        Returns:
            Machine object or None.
        """
        return self._machines.get(node_id)

    def get_skill(self, name: str) -> Skill | None:
        """Get skill by name.

        Args:
            name: Skill name.

        Returns:
            Skill object or None.
        """
        return self._skills.get(name)

    def get_area(self, area_id: str) -> Area | None:
        """Get brain area by ID.

        Args:
            area_id: Brain area ID.

        Returns:
            Area object or None.
        """
        return self._areas.get(area_id)

    def get_skills_by_area(self, area_id: str) -> list[Skill]:
        """Get all skills in a brain area.

        Args:
            area_id: Brain area ID.

        Returns:
            List of Skill objects.
        """
        area = self._areas.get(area_id)
        if area:
            return [s for s in self._skills.values() if s.brain_area == area_id]
        return []

    def get_visual_config(self, entity_type: str, entity_id: str) -> dict[str, Any]:
        """Get visual configuration for an entity.

        Args:
            entity_type: "machine", "skill", or "area".
            entity_id: Entity ID.

        Returns:
            Visual configuration dict.
        """
        if entity_type == "machine":
            machine = self.get_machine(entity_id)
            if machine:
                return {
                    "shape": MACHINE_SHAPES.get(machine.machine_type, "sphere"),
                    "color": STATUS_COLORS.get(machine.status, "#666666"),
                    "animation": STATUS_ANIMATIONS.get(machine.status, "none"),
                }

        elif entity_type == "skill":
            skill = self.get_skill(entity_id)
            if skill:
                return {
                    "shape": "sphere",
                    "color": STATUS_COLORS.get(skill.status, "#666666"),
                    "animation": STATUS_ANIMATIONS.get(skill.status, "pulse"),
                }

        elif entity_type == "area":
            area = self.get_area(entity_id)
            if area:
                return {
                    "shape": "sphere",
                    "color": STATUS_COLORS.get(area.status, "#666666"),
                    "animation": STATUS_ANIMATIONS.get(area.status, "none"),
                }

        return {"shape": "sphere", "color": "#666666", "animation": "none"}

    async def start_core_ws(self) -> None:
        """Start Core WebSocket connection."""
        await self._core_ws_client.start()

    async def stop_core_ws(self) -> None:
        """Stop Core WebSocket connection."""
        await self._core_ws_client.stop()
