"""Modeles Pydantic pour Brain3D"""

from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

from .config import Status, MachineType


class Metrics(BaseModel):
    """Metriques systeme d'une machine"""
    cpu_percent: float = 0.0
    cpu_count: int = 0
    ram_total_mb: int = 0
    ram_used_mb: int = 0
    ram_percent: float = 0.0
    disk_free_gb: float = 0.0
    disk_percent: float = 0.0
    temp_celsius: Optional[float] = None
    load_avg: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    network_in_mb: float = 0.0
    network_out_mb: float = 0.0


class Skill(BaseModel):
    """Representation d'un skill"""
    name: str
    version: str = "0.0.0"
    status: Status = Status.UNKNOWN
    brain_area: str = "unknown"
    port: int = 0
    description: str = ""

    # Metriques du skill
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    uptime_seconds: int = 0
    pid: Optional[int] = None

    # Metadata
    deployed_on: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    last_update: datetime = Field(default_factory=datetime.now)


class Area(BaseModel):
    """Aire cerebrale"""
    id: str
    name: str
    color: str = "#00d4aa"
    port_range: tuple = (0, 0)
    skills: List[str] = Field(default_factory=list)

    # Statut herite des skills
    status: Status = Status.UNKNOWN

    # Metriques agregees
    total_skills: int = 0
    active_skills: int = 0
    cpu_usage_percent: float = 0.0
    memory_usage_mb: float = 0.0


class Machine(BaseModel):
    """Representation d'une machine du reseau"""
    node_id: str
    hostname: str
    ip: str
    mac: Optional[str] = None

    # Type et statut
    machine_type: MachineType = MachineType.NETWORK
    status: Status = Status.UNKNOWN
    has_heart: bool = False

    # Infos Heart
    heart_version: Optional[str] = None
    heart_status: Optional[str] = None  # "up", "down", "unknown"

    # Infos systeme
    platform: str = "unknown"
    version: str = "0.0.0"

    # Skills count (depuis /deploy/nodes)
    skills_count: int = 0        # Nombre total de skills
    skills_installed: int = 0    # Skills installes

    # Heart Proxy (pour type proxy_target)
    proxy_heart: Optional[str] = None  # Hostname du Heart Proxy surveillant cette machine

    # Metriques
    metrics: Metrics = Field(default_factory=Metrics)

    # Skills et aires (si Heart present)
    skills: List[str] = Field(default_factory=list)
    areas: List[str] = Field(default_factory=list)

    # Position 3D (pour force-directed layout)
    position: Dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0, "z": 0})
    velocity: Dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0, "z": 0})

    # Metadata
    device_type: str = "unknown"  # nas, server, workstation, etc.
    role: str = ""
    wol_enabled: bool = False
    managed: bool = False
    last_heartbeat: Optional[datetime] = None
    last_seen: Optional[datetime] = None  # Dernier contact (depuis /deploy/nodes)
    uptime_seconds: int = 0
    tags: List[str] = Field(default_factory=list)  # Tags depuis Core


class Heart(BaseModel):
    """Representation d'un OnyxHeart"""
    node_id: str
    hostname: str
    ip: str
    version: str = "0.0.0"

    status: Status = Status.UNKNOWN
    registered: bool = False
    sdk_version: str = "0.0.0"

    # Skills geres par ce Heart
    skills: List[Skill] = Field(default_factory=list)

    # Aires presentes sur cette machine
    areas: Dict[str, Area] = Field(default_factory=dict)

    # Metriques
    metrics: Metrics = Field(default_factory=Metrics)

    last_heartbeat: datetime = Field(default_factory=datetime.now)
    uptime_seconds: int = 0


class RedisEvent(BaseModel):
    """Evenement recu via Redis"""
    type: str  # heartbeat, status_change, skill_started, etc.
    node: str
    timestamp: datetime = Field(default_factory=datetime.now)
    data: Dict[str, Any] = Field(default_factory=dict)


class WSMessage(BaseModel):
    """Message WebSocket"""
    type: str  # status_update, metrics_update, topology_change, etc.
    target: Optional[str] = None  # skill, area, machine
    id: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.now)


class NetworkState(BaseModel):
    """Etat complet du reseau pour le frontend"""
    machines: List[Machine] = Field(default_factory=list)
    hearts: List[Heart] = Field(default_factory=list)
    skills: List[Skill] = Field(default_factory=list)
    areas: List[Area] = Field(default_factory=list)

    # Statistiques
    total_machines: int = 0
    machines_with_heart: int = 0
    total_skills: int = 0
    skills_up: int = 0
    skills_working: int = 0
    skills_error: int = 0

    last_update: datetime = Field(default_factory=datetime.now)
