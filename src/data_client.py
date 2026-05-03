"""Unified data client for fetching Onyx infrastructure data.

Retrieves data from OnyxCore (skills, nodes, deployment matrix) and
onyx-infra network inventory, aggregates and merges the data.
"""

import asyncio
import logging
from datetime import datetime
from typing import Any

import httpx

from src.config import CORE_URL, NETWORK_INVENTORY_URL, Status
from src.models import NetworkState, Skill  # noqa: F401 (used in type hint)
from src.modules.data.area_builder import extract_areas
from src.modules.data.merger import (
    build_expected_skills_by_node,
    merge_machines_with_coherence,
)

logger = logging.getLogger(__name__)


class DataClient:
    """Unified client for fetching all Onyx infrastructure data."""

    def __init__(
        self,
        core_url: str = CORE_URL,
        network_url: str = NETWORK_INVENTORY_URL,
        timeout: float = 10.0,
    ):
        """Initialize DataClient.

        Args:
            core_url: OnyxCore base URL.
            network_url: network-inventory base URL.
            timeout: HTTP timeout in seconds.
        """
        self.core_url = core_url
        self.network_url = network_url
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client.

        Returns:
            AsyncClient instance.
        """
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self) -> None:
        """Close HTTP client connection."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_full_state(self) -> NetworkState:
        """Get complete system state from all sources.

        Returns:
            NetworkState with aggregated data.
        """
        # Fetch from all sources in parallel
        core_nodes, core_skills, network_devices, deploy_matrix = await asyncio.gather(
            self._get_nodes_from_core(),
            self._get_skills_from_core(),
            self._get_devices_from_network_inventory(),
            self._get_deploy_matrix_from_core(),
            return_exceptions=True,
        )

        # Handle errors
        if isinstance(core_nodes, Exception):
            logger.error(f"Error fetching Core nodes: {core_nodes}")
            core_nodes = []
        if isinstance(core_skills, Exception):
            logger.error(f"Error fetching Core skills: {core_skills}")
            core_skills = []
        if isinstance(network_devices, Exception):
            logger.error(f"Error fetching network inventory: {network_devices}")
            network_devices = {}
        if isinstance(deploy_matrix, Exception):
            logger.error(f"Error fetching deploy matrix: {deploy_matrix}")
            deploy_matrix = {}

        # Query each Heart for local skills (try all nodes with an IP)
        heart_queries = {}
        for node in core_nodes:
            ip = node.get("ip", "")
            hostname = node.get("hostname", "")
            if ip:
                heart_queries[hostname] = self._query_heart(ip)

        if heart_queries:
            hostnames = list(heart_queries.keys())
            results = await asyncio.gather(
                *heart_queries.values(), return_exceptions=True
            )
            heart_skills_by_node = dict(zip(hostnames, results, strict=False))
        else:
            heart_skills_by_node = {}

        # Build expected skills matrix
        expected_by_node = build_expected_skills_by_node(deploy_matrix)

        # Check real skill statuses via /health endpoints (parallel, 2s timeout)
        if core_skills:
            health_checks = [self._check_skill_health(s) for s in core_skills if s.host and s.port]
            await asyncio.gather(*health_checks, return_exceptions=True)

        # Build skills by host IP from Core registry (fallback when Heart not reachable)
        skills_by_host_ip: dict[str, list] = {}
        for skill in core_skills:
            if skill.host:
                skills_by_host_ip.setdefault(skill.host, []).append(skill)

        # Merge machines with coherence detection
        machines = merge_machines_with_coherence(
            core_nodes,
            network_devices,
            heart_skills_by_node,
            expected_by_node,
            self._parse_datetime,
            skills_by_host_ip,
        )

        # Extract brain areas
        areas = extract_areas(core_skills)

        return NetworkState(
            machines=machines,
            skills=core_skills,
            areas=areas,
            total_machines=len(machines),
            total_skills=len(core_skills),
            skills_up=sum(1 for s in core_skills if s.status == Status.UP),
            skills_working=sum(1 for s in core_skills if s.status == Status.WORKING),
            skills_error=sum(1 for s in core_skills if s.status == Status.ERROR),
        )

    async def _get_nodes_from_core(self) -> list[dict[str, Any]]:
        """GET /deploy/nodes from OnyxCore.

        Returns:
            List of node dictionaries.
        """
        client = await self._get_client()
        try:
            response = await client.get(f"{self.core_url}/deploy/nodes")
            response.raise_for_status()
            data = response.json()
            nodes = data.get("nodes", [])
            logger.info(f"Core: {len(nodes)} nodes récupérés")
            return nodes
        except Exception as e:
            logger.error(f"Error GET /deploy/nodes: {e}")
            return []

    async def _get_skills_from_core(self) -> list[Skill]:
        """GET /skills from OnyxCore.

        Returns:
            List of Skill objects.
        """
        client = await self._get_client()
        try:
            response = await client.get(f"{self.core_url}/skills")
            response.raise_for_status()
            data = response.json()
            skills = data.get("skills", [])
            logger.info(f"Core: {len(skills)} skills récupérés")
            parsed = []
            for s in skills:
                if not isinstance(s, dict):
                    continue
                # Normalize status to uppercase for enum compatibility
                if "status" in s:
                    s["status"] = str(s["status"]).upper()
                try:
                    parsed.append(Skill(**s))
                except Exception as e:
                    logger.debug(f"Skill parse error ({s.get('name')}): {e}")
            return parsed
        except Exception as e:
            logger.error(f"Error GET /skills: {e}")
            return []

    async def _get_deploy_matrix_from_core(self) -> dict[str, Any]:
        """GET /deploy/matrix from OnyxCore.

        Returns:
            Deployment matrix dictionary.
        """
        client = await self._get_client()
        try:
            response = await client.get(f"{self.core_url}/deploy/matrix")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error GET /deploy/matrix: {e}")
            return {}

    async def _query_heart(self, ip: str) -> dict[str, Any]:
        """Query Heart on specific IP for local skills.

        Args:
            ip: IP address of Heart.

        Returns:
            Skills dictionary from Heart.
        """
        client = await self._get_client()
        try:
            response = await client.get(f"http://{ip}:8060/skills", timeout=5.0)
            response.raise_for_status()
            data = response.json()
            logger.debug(f"Heart {ip}: {len(data)} skills locaux")
            return data
        except Exception as e:
            logger.warning(f"Error querying Heart {ip}: {e}")
            return {}

    async def _get_devices_from_network_inventory(self) -> dict[str, dict[str, Any]]:
        """GET /devices from network-inventory.

        Returns:
            Dictionary of devices.
        """
        client = await self._get_client()
        try:
            response = await client.get(f"{self.network_url}/api/inventory/devices")
            response.raise_for_status()
            data = response.json()
            devices = data.get("devices", {})
            logger.info(f"network-inventory: {len(devices)} devices récupérés")
            return devices
        except Exception as e:
            logger.error(f"Error GET /devices: {e}")
            return {}

    async def _check_skill_health(self, skill: Skill) -> None:
        """Query skill /health endpoint and update its status in-place.

        Args:
            skill: Skill object with host and port set.
        """
        client = await self._get_client()
        url = f"http://{skill.host}:{skill.port}/health"
        try:
            resp = await client.get(url, timeout=2.0)
            if resp.status_code == 200:
                data = resp.json()
                raw = data.get("status", "unknown").lower()
                if raw in ("healthy", "up", "ok"):
                    skill.status = Status.UP
                elif raw in ("working", "busy"):
                    skill.status = Status.WORKING
                else:
                    skill.status = Status.DOWN
            else:
                skill.status = Status.DOWN
        except Exception:
            skill.status = Status.DOWN

    def _parse_datetime(self, dt_str: str | None) -> datetime | None:
        """Parse ISO datetime string.

        Args:
            dt_str: ISO format datetime string.

        Returns:
            Parsed datetime or None.
        """
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None
