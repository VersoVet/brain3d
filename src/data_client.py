"""
Brain3D - Data Client Unifié
Récupère les données depuis Core et network-inventory
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

import httpx

from .config import CORE_URL, NETWORK_INVENTORY_URL, MachineType, Status
from .models import Machine, Skill, Area, NetworkState, Metrics, LocalSkill, Incoherence

logger = logging.getLogger(__name__)


class DataClient:
    """Client unifié pour récupérer toutes les données de l'infrastructure Onyx"""

    def __init__(
        self,
        core_url: str = CORE_URL,
        network_url: str = NETWORK_INVENTORY_URL,
        timeout: float = 10.0,
    ):
        self.core_url = core_url
        self.network_url = network_url
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    # =========================================================================
    # API Principale
    # =========================================================================

    async def get_full_state(self) -> NetworkState:
        """Récupère l'état complet depuis toutes les sources + interroge les Hearts"""
        # 1. Requêtes parallèles aux sources principales
        core_nodes, core_skills, network_devices, deploy_matrix = await asyncio.gather(
            self._get_nodes_from_core(),
            self._get_skills_from_core(),
            self._get_devices_from_network_inventory(),
            self._get_deploy_matrix_from_core(),
            return_exceptions=True,
        )

        # Gérer les erreurs
        if isinstance(core_nodes, Exception):
            logger.error(f"Erreur Core nodes: {core_nodes}")
            core_nodes = []
        if isinstance(core_skills, Exception):
            logger.error(f"Erreur Core skills: {core_skills}")
            core_skills = []
        if isinstance(network_devices, Exception):
            logger.error(f"Erreur network-inventory: {network_devices}")
            network_devices = {}
        if isinstance(deploy_matrix, Exception):
            logger.error(f"Erreur Core deploy matrix: {deploy_matrix}")
            deploy_matrix = {}

        # 2. Interroger chaque Heart UP pour ses skills locaux
        heart_queries = {}
        for node in core_nodes:
            ip = node.get("ip", "")
            hostname = node.get("hostname", "")
            if node.get("heart_status") == "up" and ip:
                heart_queries[hostname] = self._query_heart(ip)

        # Exécuter les requêtes Heart en parallèle
        if heart_queries:
            hostnames = list(heart_queries.keys())
            results = await asyncio.gather(*heart_queries.values(), return_exceptions=True)
            heart_skills_by_node = dict(zip(hostnames, results))
        else:
            heart_skills_by_node = {}

        # 3. Construire la matrice des skills attendus par node
        expected_by_node = self._build_expected_skills_by_node(deploy_matrix)

        # 4. Fusionner les machines avec skills locaux et incohérences
        machines = self._merge_machines_with_coherence(
            core_nodes, network_devices, heart_skills_by_node, expected_by_node
        )

        # Extraire les aires depuis les skills
        areas = self._extract_areas(core_skills)

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

    # =========================================================================
    # Core API
    # =========================================================================

    async def _get_nodes_from_core(self) -> List[Dict[str, Any]]:
        """GET /deploy/nodes - Machines avec Heart"""
        client = await self._get_client()
        try:
            response = await client.get(f"{self.core_url}/deploy/nodes")
            response.raise_for_status()
            data = response.json()
            logger.info(f"Core: {data.get('count', 0)} nodes récupérés")
            return data.get("nodes", [])
        except Exception as e:
            logger.error(f"Erreur GET /deploy/nodes: {e}")
            return []

    async def _get_skills_from_core(self) -> List[Skill]:
        """GET /skills - Liste des skills"""
        client = await self._get_client()
        try:
            response = await client.get(f"{self.core_url}/skills")
            response.raise_for_status()
            data = response.json()

            skills = []
            for s in data.get("skills", []):
                skill = Skill(
                    name=s.get("name", ""),
                    version=s.get("version", "0.0.0"),
                    status=self._parse_status(s.get("status", "UNKNOWN")),
                    brain_area=s.get("brain_area", "external"),
                    port=s.get("port"),
                    deployed_on=s.get("deployed_on", []),
                    tags=s.get("tags", []),
                )
                skills.append(skill)

            logger.info(f"Core: {len(skills)} skills récupérés")
            return skills
        except Exception as e:
            logger.error(f"Erreur GET /skills: {e}")
            return []

    async def _get_deploy_matrix_from_core(self) -> Dict[str, Any]:
        """GET /deploy/matrix - Matrice de déploiement skill→node"""
        client = await self._get_client()
        try:
            response = await client.get(f"{self.core_url}/deploy/matrix")
            response.raise_for_status()
            data = response.json()
            logger.info(f"Core: deploy matrix récupérée")
            return data
        except Exception as e:
            logger.error(f"Erreur GET /deploy/matrix: {e}")
            return {}

    # =========================================================================
    # Heart API (interrogation directe)
    # =========================================================================

    async def _query_heart(self, ip: str) -> Dict[str, Any]:
        """Interroge un Heart directement sur port 8060 pour ses skills locaux"""
        client = await self._get_client()
        try:
            response = await client.get(f"http://{ip}:8060/skills", timeout=5.0)
            response.raise_for_status()
            data = response.json()
            logger.debug(f"Heart {ip}: {len(data)} skills locaux")
            return data
        except Exception as e:
            logger.warning(f"Impossible d'interroger Heart {ip}: {e}")
            return {}

    # =========================================================================
    # Network Inventory API
    # =========================================================================

    async def _get_devices_from_network_inventory(self) -> Dict[str, Dict]:
        """GET /devices - Tous les devices réseau"""
        client = await self._get_client()
        try:
            response = await client.get(f"{self.network_url}/devices")
            response.raise_for_status()
            data = response.json()
            devices = data.get("devices", {})
            logger.info(f"network-inventory: {len(devices)} devices récupérés")
            return devices
        except Exception as e:
            logger.error(f"Erreur GET /devices (network-inventory): {e}")
            return {}

    # =========================================================================
    # Fusion des données avec cohérence
    # =========================================================================

    def _build_expected_skills_by_node(self, deploy_matrix: Dict) -> Dict[str, List[str]]:
        """Construit la liste des skills attendus par node depuis la matrice"""
        expected_by_node: Dict[str, List[str]] = {}

        # La matrice est structurée comme: {"matrix": {skill_id: {node_id: deployment}}}
        matrix = deploy_matrix.get("matrix", {})

        for skill_id, nodes in matrix.items():
            if not isinstance(nodes, dict):
                continue
            for node_id, deployment in nodes.items():
                if isinstance(deployment, dict) and deployment.get("status") in ("installed", "running"):
                    skill_name = deployment.get("skill_name") or skill_id.split("/")[-1]
                    if node_id not in expected_by_node:
                        expected_by_node[node_id] = []
                    expected_by_node[node_id].append(skill_name)

        return expected_by_node

    def _parse_heart_skills(self, heart_data: Dict[str, Any]) -> List[LocalSkill]:
        """Parse les skills retournés par un Heart en LocalSkill"""
        skills = []
        for name, info in heart_data.items():
            if isinstance(info, dict):
                skill = LocalSkill(
                    name=name,
                    status=info.get("status", "unknown"),
                    pid=info.get("pid"),
                    version=info.get("version", ""),
                    brain_area=info.get("brain_area", "external"),
                    git_repo=info.get("git_repo", ""),
                    git_commit=info.get("git_commit", ""),
                )
                skills.append(skill)
        return skills

    def _detect_incoherences(
        self, hostname: str, local_skills: List[LocalSkill], expected_skills: List[str]
    ) -> List[Incoherence]:
        """Détecte les incohérences entre skills locaux et attendus"""
        incoherences = []

        local_names = {s.name for s in local_skills}
        expected_names = set(expected_skills)

        # Skill présent localement mais pas attendu par Core
        for name in local_names - expected_names:
            incoherences.append(Incoherence(
                type="unexpected_skill",
                skill=name,
                message=f"Skill '{name}' présent sur Heart mais pas dans registre Core",
                severity="warning",
            ))

        # Skill attendu par Core mais absent localement
        for name in expected_names - local_names:
            incoherences.append(Incoherence(
                type="missing_skill",
                skill=name,
                message=f"Skill '{name}' attendu par Core mais absent du Heart",
                severity="error",
            ))

        return incoherences

    def _merge_machines_with_coherence(
        self,
        core_nodes: List[Dict],
        network_devices: Dict[str, Dict],
        heart_skills_by_node: Dict[str, Any],
        expected_by_node: Dict[str, List[str]],
    ) -> List[Machine]:
        """Fusionne les nodes avec skills locaux et détection d'incohérences"""
        machines = []
        seen_ips = set()

        # 1. D'abord les nodes Core (ont un Heart)
        for node in core_nodes:
            ip = node.get("ip", "")
            hostname = node.get("hostname", "")
            seen_ips.add(ip)

            # Enrichir avec network-inventory si disponible
            device_info = network_devices.get(hostname, {})

            # Déterminer le type de machine
            machine_type = self._determine_machine_type(hostname, has_heart=True)

            # Déterminer le statut depuis heart_status
            heart_status = node.get("heart_status", "unknown")
            if heart_status == "up":
                status = Status.UP
            elif heart_status == "down":
                status = Status.DOWN
            else:
                status = Status.UNKNOWN

            # Skills locaux depuis Heart
            heart_data = heart_skills_by_node.get(hostname, {})
            if isinstance(heart_data, Exception):
                heart_data = {}
                logger.warning(f"Erreur Heart {hostname}: {heart_data}")

            local_skills = self._parse_heart_skills(heart_data)

            # Skills attendus depuis Core
            expected_skills = expected_by_node.get(ip, []) or expected_by_node.get(hostname, [])

            # Détecter les incohérences
            incoherences = self._detect_incoherences(hostname, local_skills, expected_skills)
            is_coherent = len(incoherences) == 0

            machine = Machine(
                node_id=hostname,
                hostname=hostname,
                ip=ip,
                mac=device_info.get("mac"),
                machine_type=machine_type,
                status=status,
                has_heart=True,
                heart_version=node.get("heart_version"),
                heart_status=heart_status,
                platform=device_info.get("os") or "unknown",
                skills_count=node.get("skills_count", 0),
                skills_installed=node.get("skills_installed", 0),
                device_type=device_info.get("type") or "server",
                role=device_info.get("role") or "",
                wol_enabled=device_info.get("wol_enabled", False),
                managed=device_info.get("managed", True),
                last_seen=self._parse_datetime(node.get("last_seen")),
                tags=node.get("tags", []),
                # Nouveaux champs
                local_skills=local_skills,
                expected_skills=expected_skills,
                incoherences=incoherences,
                is_coherent=is_coherent,
            )
            machines.append(machine)

            if not is_coherent:
                logger.info(f"Incohérences détectées sur {hostname}: {[i.message for i in incoherences]}")

        # 2. Ensuite les devices network-inventory qui n'ont PAS de Heart
        for name, device in network_devices.items():
            ip = device.get("ip", "")
            if ip in seen_ips:
                continue  # Déjà ajouté depuis Core

            machine = Machine(
                node_id=name,
                hostname=name,
                ip=ip,
                mac=device.get("mac"),
                machine_type=MachineType.NETWORK,
                status=Status.UP,  # Présent dans inventory = online
                has_heart=False,
                platform=device.get("os") or "network",
                device_type=device.get("type", "network"),
                role=device.get("role", ""),
                wol_enabled=device.get("wol_enabled", False),
                managed=device.get("managed", False),
            )
            machines.append(machine)

        logger.info(f"Total machines fusionnées: {len(machines)}")
        return machines

    def _determine_machine_type(self, hostname: str, has_heart: bool) -> MachineType:
        """Détermine le type de machine selon son hostname"""
        hostname_lower = hostname.lower()

        # Core = OnyxSoma
        if hostname_lower == "onyxsoma":
            return MachineType.CORE

        # Forge = OnyxLab
        if hostname_lower in ("onyxlab", "onyx-lab"):
            return MachineType.FORGE

        # Avec Heart = heart
        if has_heart:
            return MachineType.HEART

        # Sans Heart = network device
        return MachineType.NETWORK

    # =========================================================================
    # Extraction des aires cérébrales
    # =========================================================================

    def _extract_areas(self, skills: List[Skill]) -> List[Area]:
        """Extrait les aires cérébrales depuis les skills"""
        areas_dict: Dict[str, List[Skill]] = {}

        for skill in skills:
            area_id = skill.brain_area or "external"
            if area_id not in areas_dict:
                areas_dict[area_id] = []
            areas_dict[area_id].append(skill)

        areas = []
        for area_id, area_skills in areas_dict.items():
            # Calcul du statut de l'aire (priorité max des skills)
            area_status = self._compute_area_status(area_skills)

            area = Area(
                id=area_id,
                name=self._format_area_name(area_id),
                status=area_status,
                skills=[s.name for s in area_skills],
                total_skills=len(area_skills),
                active_skills=sum(1 for s in area_skills if s.status == Status.UP),
            )
            areas.append(area)

        return areas

    def _compute_area_status(self, skills: List[Skill]) -> Status:
        """Calcule le statut d'une aire (priorité: ERROR > WORKING > UP > DOWN)"""
        if not skills:
            return Status.UNKNOWN

        priority = {
            Status.ERROR: 4,
            Status.WORKING: 3,
            Status.UP: 2,
            Status.DOWN: 1,
            Status.UNKNOWN: 0,
        }

        max_priority = 0
        max_status = Status.UNKNOWN

        for skill in skills:
            p = priority.get(skill.status, 0)
            if p > max_priority:
                max_priority = p
                max_status = skill.status

        return max_status

    def _format_area_name(self, area_id: str) -> str:
        """Formate le nom d'une aire (kebab-case → Title Case)"""
        return area_id.replace("-", " ").title()

    # =========================================================================
    # Helpers
    # =========================================================================

    def _parse_status(self, status_str: str) -> Status:
        """Parse un string en Status enum"""
        try:
            return Status(status_str.upper())
        except (ValueError, AttributeError):
            return Status.UNKNOWN

    def _parse_datetime(self, dt_str: Optional[str]) -> Optional[datetime]:
        """Parse un string datetime ISO"""
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None
