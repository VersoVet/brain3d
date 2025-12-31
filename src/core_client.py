"""Client pour communiquer avec OnyxCore via HTTP + SDK pour statuts"""

import logging
from typing import Dict, List, Optional
from datetime import datetime

import httpx

from .config import CORE_URL, SPECIAL_NODES, KNOWN_MACHINES, IP_TO_HOSTNAME, MachineType, Status
from .models import Machine, Skill, Area, Metrics

logger = logging.getLogger(__name__)


class CoreAPIClient:
    """Client pour communiquer avec OnyxCore

    Utilise httpx pour les appels API (get_machines, get_skills)
    car les endpoints Core diffèrent du SDK standard.

    Endpoints Core:
    - /nodes/health → liste des machines avec Heart
    - /skills → liste des skills
    """

    def __init__(self):
        self.core_url = CORE_URL.rstrip("/")
        self._http_client = httpx.AsyncClient(timeout=10.0)
        logger.info(f"CoreAPIClient initialise (Core: {self.core_url})")

    # === MACHINES / NODES ===

    async def get_nodes_health(self) -> List[dict]:
        """Recupere la sante de tous les Hearts via /nodes/health"""
        try:
            resp = await self._http_client.get(f"{self.core_url}/nodes/health")
            if resp.status_code == 200:
                data = resp.json()
                # Core retourne {results: [...]} ou directement une liste
                if isinstance(data, dict):
                    return data.get("results", data.get("nodes", []))
                return data if isinstance(data, list) else []
        except Exception as e:
            logger.error(f"Get nodes health failed: {e}")
        return []

    async def get_all_machines(self) -> List[Machine]:
        """
        Recupere toutes les machines via Core.
        Retourne une liste unifiee.
        """
        machines_list: List[Machine] = []

        # Recuperer via Core API
        nodes_data = await self.get_nodes_health()

        for node in nodes_data:
            # Extraire les champs (le SDK retourne des dicts)
            ip = node.get("node_ip", node.get("ip", ""))
            hostname = node.get("node", node.get("hostname", ""))

            # Corriger le hostname si manquant ou "unknown" via mapping IP
            if not hostname or hostname == "unknown":
                hostname = IP_TO_HOSTNAME.get(ip, f"device-{ip.split('.')[-1]}" if ip else "unknown")

            # Determiner le type de machine
            machine_type = SPECIAL_NODES.get(hostname, MachineType.HEART)

            # Convertir status
            status_str = node.get("status", "unknown")
            if status_str == "healthy":
                status = Status.UP
            elif status_str == "degraded":
                status = Status.ERROR
            elif not node.get("online", True):
                status = Status.DOWN
            else:
                status_upper = status_str.upper()
                status = Status(status_upper) if status_upper in Status.__members__ else Status.UNKNOWN

            machine = Machine(
                node_id=node.get("node_id", hostname),
                hostname=hostname,
                ip=ip,
                machine_type=machine_type,
                status=status,
                has_heart=node.get("registered", False) or node.get("sdk", False),
                platform=node.get("platform", "unknown"),
                version=node.get("version", "0.0.0"),
                skills=node.get("skills", []),
                metrics=Metrics(
                    cpu_percent=node.get("cpu_percent", 0),
                    cpu_count=node.get("cpu_count", 0),
                    ram_total_mb=node.get("ram_mb", 0),
                    ram_percent=node.get("ram_percent", 0),
                    load_avg=node.get("load_avg", [0, 0, 0]),
                    temp_celsius=node.get("temp_c"),
                ),
                uptime_seconds=node.get("uptime_seconds", 0),
                last_heartbeat=datetime.now(),
            )
            machines_list.append(machine)

        # Ajouter les machines connues non detectees par Core
        existing_ids = {m.node_id for m in machines_list}
        existing_ips = {m.ip for m in machines_list}

        for known in KNOWN_MACHINES:
            # Skip si deja presente (par ID ou IP)
            if known["node_id"] in existing_ids or known["ip"] in existing_ips:
                continue

            machine = Machine(
                node_id=known["node_id"],
                hostname=known["hostname"],
                ip=known["ip"],
                machine_type=known.get("machine_type", MachineType.HEART),
                status=known.get("status", Status.UNKNOWN),
                has_heart=known.get("has_heart", False),
                platform=known.get("platform", "unknown"),
                role=known.get("role", ""),
            )
            machines_list.append(machine)
            logger.debug(f"Added known machine: {known['hostname']}")

        return machines_list

    # === SKILLS ===

    async def get_skills_raw(self) -> List[dict]:
        """Recupere la liste des skills via /skills"""
        try:
            resp = await self._http_client.get(f"{self.core_url}/skills")
            if resp.status_code == 200:
                data = resp.json()
                # Core retourne {skills: [...]} ou directement une liste
                if isinstance(data, dict):
                    return data.get("skills", data.get("results", []))
                return data if isinstance(data, list) else []
        except Exception as e:
            logger.error(f"Get skills failed: {e}")
        return []

    async def get_skills(self, area: Optional[str] = None) -> List[Skill]:
        """Recupere la liste des skills"""
        skills_list: List[Skill] = []

        skills_data = await self.get_skills_raw()

        for s in skills_data:
            # Filtrer par aire si demande
            skill_area = s.get("brain_area", "unknown")
            if area and skill_area != area:
                continue

            status_str = s.get("status", "UNKNOWN").upper()
            status = Status(status_str) if status_str in Status.__members__ else Status.UNKNOWN

            skill = Skill(
                name=s.get("name", ""),
                version=s.get("version", "0.0.0"),
                status=status,
                brain_area=skill_area,
                port=s.get("port", 0),
                description=s.get("description", ""),
                deployed_on=s.get("deployed_on", []),
                tags=s.get("tags", []),
            )
            skills_list.append(skill)

        return skills_list

    async def get_skill(self, name: str) -> Optional[Skill]:
        """Recupere un skill specifique via /skills/{name}"""
        try:
            resp = await self._http_client.get(f"{self.core_url}/skills/{name}")
            if resp.status_code != 200:
                return None

            s = resp.json()
            # Core peut retourner {skill: {...}} ou directement {...}
            if isinstance(s, dict) and "skill" in s:
                s = s["skill"]

            status_str = s.get("status", "UNKNOWN").upper()
            status = Status(status_str) if status_str in Status.__members__ else Status.UNKNOWN

            return Skill(
                name=s.get("name", name),
                version=s.get("version", "0.0.0"),
                status=status,
                brain_area=s.get("brain_area", "unknown"),
                port=s.get("port", 0),
                description=s.get("description", ""),
                deployed_on=s.get("deployed_on", []),
                tags=s.get("tags", []),
            )
        except Exception as e:
            logger.error(f"Get skill {name} failed: {e}")
            return None

    # === AREAS ===

    async def get_areas(self) -> List[Area]:
        """Recupere les aires cerebrales (deduites des skills)"""
        areas_dict: Dict[str, Area] = {}

        skills = await self.get_skills()

        for skill in skills:
            area_id = skill.brain_area
            if area_id not in areas_dict:
                areas_dict[area_id] = Area(
                    id=area_id,
                    name=area_id.replace("-", " ").title(),
                    color="#00d4aa",
                    skills=[],
                    total_skills=0,
                    active_skills=0,
                )

            area = areas_dict[area_id]
            area.skills.append(skill.name)
            area.total_skills += 1
            if skill.status == Status.UP:
                area.active_skills += 1

        return list(areas_dict.values())

    # === HEALTH CHECK ===

    async def health_check(self) -> dict:
        """Verifie la sante de Core"""
        try:
            machines = await self.get_nodes_health()
            return {
                "status": "healthy" if machines else "degraded",
                "machines_count": len(machines),
                "core_url": self.core_url,
            }
        except Exception as e:
            logger.error(f"Health check Core failed: {e}")
            return {"status": "unreachable", "error": str(e)}

    async def close(self):
        """Ferme le client HTTP"""
        await self._http_client.aclose()
