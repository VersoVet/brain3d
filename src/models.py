"""Modeles Pydantic pour Brain3D."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from .config import MachineType, Status


class Metrics(BaseModel):
    """Metriques systeme d'une machine."""

    cpu_percent: float = 0.0
    cpu_count: int = 0
    ram_total_mb: int = 0
    ram_used_mb: int = 0
    ram_percent: float = 0.0
    disk_free_gb: float = 0.0
    disk_percent: float = 0.0
    temp_celsius: float | None = None
    load_avg: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    network_in_mb: float = 0.0
    network_out_mb: float = 0.0


class LocalSkill(BaseModel):
    """Skill tel que vu par le Heart local (depuis :8060/skills)."""

    name: str
    status: str = "unknown"  # "running", "stopped", "loaded", "error"
    pid: int | None = None
    version: str | None = ""
    brain_area: str = "external"
    git_repo: str | None = ""
    git_commit: str | None = ""


class Incoherence(BaseModel):
    """Incohérence détectée entre Heart local et registre Core."""

    type: str  # "unexpected_skill", "missing_skill", "version_mismatch", "status_mismatch"
    skill: str
    message: str
    severity: str = "warning"  # "warning", "error"


class Skill(BaseModel):
    """Representation d'un skill."""

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
    pid: int | None = None

    # Metadata
    deployed_on: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    last_update: datetime = Field(default_factory=datetime.now)


class Area(BaseModel):
    """Aire cerebrale."""

    id: str
    name: str
    color: str = "#00d4aa"
    port_range: tuple = (0, 0)
    skills: list[str] = Field(default_factory=list)

    # Statut herite des skills
    status: Status = Status.UNKNOWN

    # Metriques agregees
    total_skills: int = 0
    active_skills: int = 0
    cpu_usage_percent: float = 0.0
    memory_usage_mb: float = 0.0


class Machine(BaseModel):
    """Representation d'une machine du reseau."""

    node_id: str
    hostname: str
    ip: str
    mac: str | None = None

    # Type et statut
    machine_type: MachineType = MachineType.NETWORK
    status: Status = Status.UNKNOWN
    has_heart: bool = False

    # Infos Heart
    heart_version: str | None = None
    heart_status: str | None = None  # "up", "down", "unknown"

    # Infos systeme
    platform: str = "unknown"
    version: str = "0.0.0"

    # Skills count (depuis /deploy/nodes)
    skills_count: int = 0  # Nombre total de skills
    skills_installed: int = 0  # Skills installes

    # Heart Proxy (pour type proxy_target)
    proxy_heart: str | None = None  # Hostname du Heart Proxy surveillant cette machine

    # Metriques
    metrics: Metrics = Field(default_factory=Metrics)

    # Skills et aires (si Heart present)
    skills: list[str] = Field(default_factory=list)
    areas: list[str] = Field(default_factory=list)

    # Skills locaux (depuis Heart :8060/skills) - NOUVEAU
    local_skills: list["LocalSkill"] = Field(default_factory=list)

    # Skills attendus par Core registry - NOUVEAU
    expected_skills: list[str] = Field(default_factory=list)

    # Incohérences détectées entre Heart et Core - NOUVEAU
    incoherences: list["Incoherence"] = Field(default_factory=list)

    # Flag de cohérence - NOUVEAU
    is_coherent: bool = True

    # Position 3D (pour force-directed layout)
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0.0, "y": 0.0, "z": 0.0})
    velocity: dict[str, float] = Field(default_factory=lambda: {"x": 0.0, "y": 0.0, "z": 0.0})

    # Metadata
    device_type: str = "unknown"  # nas, server, workstation, etc.
    role: str = ""
    wol_enabled: bool = False
    managed: bool = False
    last_heartbeat: datetime | None = None
    last_seen: datetime | None = None  # Dernier contact (depuis /deploy/nodes)
    uptime_seconds: int = 0
    tags: list[str] = Field(default_factory=list)  # Tags depuis Core


class Heart(BaseModel):
    """Representation d'un OnyxHeart."""

    node_id: str
    hostname: str
    ip: str
    version: str = "0.0.0"

    status: Status = Status.UNKNOWN
    registered: bool = False
    sdk_version: str = "0.0.0"

    # Skills geres par ce Heart
    skills: list[Skill] = Field(default_factory=list)

    # Aires presentes sur cette machine
    areas: dict[str, Area] = Field(default_factory=dict)

    # Metriques
    metrics: Metrics = Field(default_factory=Metrics)

    last_heartbeat: datetime = Field(default_factory=datetime.now)
    uptime_seconds: int = 0


class RedisEvent(BaseModel):
    """Evenement recu via Redis."""

    type: str  # heartbeat, status_change, skill_started, etc.
    node: str
    timestamp: datetime = Field(default_factory=datetime.now)
    data: dict[str, Any] = Field(default_factory=dict)


class WSMessage(BaseModel):
    """Message WebSocket."""

    type: str  # status_update, metrics_update, topology_change, etc.
    target: str | None = None  # skill, area, machine
    id: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.now)


class NetworkState(BaseModel):
    """Etat complet du reseau pour le frontend."""

    machines: list[Machine] = Field(default_factory=list)
    hearts: list[Heart] = Field(default_factory=list)
    skills: list[Skill] = Field(default_factory=list)
    areas: list[Area] = Field(default_factory=list)

    # Statistiques
    total_machines: int = 0
    machines_with_heart: int = 0
    total_skills: int = 0
    skills_up: int = 0
    skills_working: int = 0
    skills_error: int = 0

    last_update: datetime = Field(default_factory=datetime.now)
