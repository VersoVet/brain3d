"""Gestionnaire d'etat avec cache et heritage des statuts"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field

from .config import (
    Status, MachineType, STATUS_PRIORITY, CACHE_TTL,
    STATUS_COLORS, STATUS_ANIMATIONS, MACHINE_SHAPES, MACHINE_BASE_COLORS
)
from .models import Machine, Skill, Area, Heart, NetworkState, RedisEvent, Metrics
from .core_client import CoreAPIClient
from .websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


class StateManager:
    """
    Gestionnaire d'etat central pour Brain3D.
    Gere le cache, l'heritage des statuts et la propagation des updates.
    """

    def __init__(
        self,
        core_client: CoreAPIClient,
        ws_manager: WebSocketManager
    ):
        self.core_client = core_client
        self.ws_manager = ws_manager

        # Caches
        self._machines: Dict[str, Machine] = {}
        self._skills: Dict[str, Skill] = {}
        self._areas: Dict[str, Area] = {}
        self._hearts: Dict[str, Heart] = {}

        # Timestamps
        self._last_refresh = datetime.min
        self._cache_ttl = timedelta(seconds=CACHE_TTL)

        # Lock pour acces concurrent
        self._lock = asyncio.Lock()

    # === CALCUL HERITAGE STATUTS ===

    def _calculate_area_status(self, area_id: str) -> Status:
        """
        Calcule le statut d'une aire basee sur ses skills.
        Priorite: ERROR > WORKING > UP > DOWN > UNKNOWN
        """
        skills_in_area = [
            s for s in self._skills.values()
            if s.brain_area == area_id
        ]

        if not skills_in_area:
            return Status.UNKNOWN

        # Trouver le statut le plus prioritaire
        max_priority = -1
        result_status = Status.UNKNOWN

        for skill in skills_in_area:
            priority = STATUS_PRIORITY.get(skill.status, 0)
            if priority > max_priority:
                max_priority = priority
                result_status = skill.status

        return result_status

    def _calculate_heart_status(self, node_id: str) -> Status:
        """
        Calcule le statut d'un Heart base sur ses aires/skills.
        """
        # Trouver les skills sur ce node
        skills_on_node = [
            s for s in self._skills.values()
            if node_id in s.deployed_on or any(
                m.hostname in s.deployed_on
                for m in self._machines.values()
                if m.node_id == node_id
            )
        ]

        if not skills_on_node:
            return Status.UNKNOWN

        max_priority = -1
        result_status = Status.UNKNOWN

        for skill in skills_on_node:
            priority = STATUS_PRIORITY.get(skill.status, 0)
            if priority > max_priority:
                max_priority = priority
                result_status = skill.status

        return result_status

    def _calculate_machine_status(self, machine: Machine) -> Status:
        """
        Calcule le statut d'une machine.
        - Si pas de Heart: UNKNOWN (device reseau)
        - Si Heart: herite du statut du Heart
        """
        if not machine.has_heart:
            return Status.UNKNOWN

        return self._calculate_heart_status(machine.node_id)

    def _propagate_status_changes(self) -> List[dict]:
        """
        Recalcule tous les statuts herites et retourne les changements.
        """
        changes = []

        # 1. Recalculer statuts des aires
        for area_id, area in self._areas.items():
            new_status = self._calculate_area_status(area_id)
            if area.status != new_status:
                old_status = area.status
                area.status = new_status
                changes.append({
                    "type": "area",
                    "id": area_id,
                    "old_status": old_status,
                    "new_status": new_status,
                })

        # 2. Recalculer statuts des machines avec Heart
        for node_id, machine in self._machines.items():
            if machine.has_heart:
                new_status = self._calculate_machine_status(machine)
                if machine.status != new_status:
                    old_status = machine.status
                    machine.status = new_status
                    changes.append({
                        "type": "machine",
                        "id": node_id,
                        "old_status": old_status,
                        "new_status": new_status,
                    })

        return changes

    # === REFRESH DEPUIS CORE ===

    async def refresh_all(self) -> NetworkState:
        """Rafraichit tout l'etat depuis Core"""
        async with self._lock:
            # Recuperer les donnees
            machines = await self.core_client.get_all_machines()
            skills = await self.core_client.get_skills()
            areas = await self.core_client.get_areas()

            # Mettre a jour les caches
            self._machines = {m.node_id: m for m in machines}
            self._skills = {s.name: s for s in skills}
            self._areas = {a.id: a for a in areas}

            # Propager les statuts
            self._propagate_status_changes()

            self._last_refresh = datetime.now()

            return self.get_network_state()

    async def refresh_if_stale(self) -> Optional[NetworkState]:
        """Rafraichit seulement si le cache est expire"""
        if datetime.now() - self._last_refresh > self._cache_ttl:
            return await self.refresh_all()
        return None

    # === TRAITEMENT EVENEMENTS REDIS ===

    async def handle_redis_event(self, event: RedisEvent) -> None:
        """Traite un evenement Redis et propage les updates"""
        event_type = event.type.lower()

        if event_type == "heartbeat":
            await self._handle_heartbeat(event)

        elif event_type in ("status_change", "skill_status"):
            await self._handle_status_change(event)

        elif event_type == "skill_started":
            await self._handle_skill_started(event)

        elif event_type == "skill_stopped":
            await self._handle_skill_stopped(event)

        elif event_type == "sync_complete":
            # Refresh complet
            await self.refresh_all()
            await self.ws_manager.broadcast({
                "type": "refresh",
                "reason": "sync_complete",
                "data": self.get_network_state().model_dump(mode='json'),
            })

        else:
            logger.debug(f"Event Redis ignore: {event_type}")

    async def _handle_heartbeat(self, event: RedisEvent) -> None:
        """Traite un heartbeat"""
        node_id = event.node
        data = event.data

        async with self._lock:
            machine = self._machines.get(node_id)
            if machine:
                # Mettre a jour les metriques
                machine.metrics = Metrics(
                    cpu_percent=data.get("cpu_percent", 0),
                    ram_percent=data.get("memory_percent", 0),
                    disk_percent=data.get("disk_percent", 0),
                    temp_celsius=data.get("temp"),
                )
                machine.last_heartbeat = datetime.now()
                machine.uptime_seconds = data.get("uptime_seconds", 0)

        # Broadcast aux clients
        await self.ws_manager.broadcast_metrics_update(
            node_id,
            data
        )

    async def _handle_status_change(self, event: RedisEvent) -> None:
        """Traite un changement de statut"""
        data = event.data
        skill_name = data.get("skill_name") or data.get("skill")
        new_status_str = data.get("status", "UNKNOWN").upper()

        try:
            new_status = Status(new_status_str)
        except:
            new_status = Status.UNKNOWN

        async with self._lock:
            skill = self._skills.get(skill_name)
            if skill:
                old_status = skill.status
                skill.status = new_status
                skill.last_update = datetime.now()

                # Propager les changements
                changes = self._propagate_status_changes()

        # Broadcast le changement de skill
        await self.ws_manager.broadcast_status_update(
            "skill", skill_name, new_status.value,
            {"old_status": old_status.value if skill else None}
        )

        # Broadcast les changements propages
        for change in changes:
            await self.ws_manager.broadcast_status_update(
                change["type"],
                change["id"],
                change["new_status"].value,
                {"old_status": change["old_status"].value}
            )

    async def _handle_skill_started(self, event: RedisEvent) -> None:
        """Traite le demarrage d'un skill"""
        data = event.data
        skill_name = data.get("skill_name") or data.get("skill")

        # Refresh le skill depuis Core
        skill = await self.core_client.get_skill(skill_name)
        if skill:
            async with self._lock:
                self._skills[skill_name] = skill
                self._propagate_status_changes()

            await self.ws_manager.broadcast_topology_change(
                "add", "skill", skill.model_dump(mode='json')
            )

    async def _handle_skill_stopped(self, event: RedisEvent) -> None:
        """Traite l'arret d'un skill"""
        data = event.data
        skill_name = data.get("skill_name") or data.get("skill")

        async with self._lock:
            skill = self._skills.get(skill_name)
            if skill:
                skill.status = Status.DOWN
                self._propagate_status_changes()

        await self.ws_manager.broadcast_status_update(
            "skill", skill_name, Status.DOWN.value
        )

    # === GETTERS ===

    def get_network_state(self) -> NetworkState:
        """Retourne l'etat complet du reseau"""
        machines = list(self._machines.values())
        skills = list(self._skills.values())
        areas = list(self._areas.values())
        hearts = list(self._hearts.values())

        return NetworkState(
            machines=machines,
            hearts=hearts,
            skills=skills,
            areas=areas,
            total_machines=len(machines),
            machines_with_heart=sum(1 for m in machines if m.has_heart),
            total_skills=len(skills),
            skills_up=sum(1 for s in skills if s.status == Status.UP),
            skills_working=sum(1 for s in skills if s.status == Status.WORKING),
            skills_error=sum(1 for s in skills if s.status == Status.ERROR),
            last_update=self._last_refresh,
        )

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

    def get_skills_by_machine(self, node_id: str) -> List[Skill]:
        """Retourne les skills d'une machine"""
        machine = self._machines.get(node_id)
        if not machine:
            return []
        return [s for s in self._skills.values() if s.name in machine.skills]

    # === HELPERS VISUALISATION ===

    def get_visual_config(self, entity_type: str, entity_id: str) -> dict:
        """Retourne la config visuelle pour une entite"""
        if entity_type == "machine":
            machine = self._machines.get(entity_id)
            if machine:
                return {
                    "shape": MACHINE_SHAPES.get(machine.machine_type, "sphere"),
                    "color": STATUS_COLORS.get(machine.status, MACHINE_BASE_COLORS.get(machine.machine_type, "#666666")),
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
                    "color": area.color if area.status == Status.UP else STATUS_COLORS.get(area.status, area.color),
                    "animation": STATUS_ANIMATIONS.get(area.status, "none"),
                }

        return {"shape": "sphere", "color": "#666666", "animation": "none"}
