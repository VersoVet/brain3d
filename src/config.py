"""Configuration centralisee Brain3D"""

import os
from enum import Enum
from typing import Dict


# URLs des services
REDIS_URL = os.getenv("REDIS_URL", "redis://10.0.0.44:6379")
CORE_URL = os.getenv("ONYX_CORE_URL", "http://10.0.0.44:8050")
NETWORK_INVENTORY_URL = os.getenv("NETWORK_INVENTORY_URL", "http://10.0.0.44:8053")

# Port Brain3D
PORT = int(os.getenv("BRAIN3D_PORT", "8888"))
DEV_PORT = int(os.getenv("BRAIN3D_DEV_PORT", "9888"))

# Redis channels
REDIS_CHANNELS = {
    "events": "onyx:events",
    "broadcast": "onyx:broadcast",
    "forge": "onyx:forge",
}


class Status(str, Enum):
    """Statuts possibles pour skills/aires/machines"""
    UP = "UP"
    WORKING = "WORKING"
    DOWN = "DOWN"
    ERROR = "ERROR"
    UNKNOWN = "UNKNOWN"


# Couleurs par statut (choix utilisateur)
STATUS_COLORS: Dict[str, str] = {
    Status.UP: "#00ff88",       # Vert
    Status.WORKING: "#ff00ff",  # Magenta
    Status.DOWN: "#555555",     # Gris
    Status.ERROR: "#ff8800",    # Orange
    Status.UNKNOWN: "#666666",  # Gris moyen
}

# Animations par statut
STATUS_ANIMATIONS: Dict[str, str] = {
    Status.UP: "pulse-slow",
    Status.WORKING: "pulse-fast",
    Status.DOWN: "none",
    Status.ERROR: "blink",
    Status.UNKNOWN: "none",
}


class MachineType(str, Enum):
    """Types de machines"""
    HEART = "heart"           # Machine avec OnyxHeart
    NETWORK = "network"       # Device reseau sans Heart
    CORE = "core"             # OnyxSoma (Core)
    FORGE = "forge"           # OnyxLab (Forge)


# Formes 3D par type de machine
MACHINE_SHAPES: Dict[str, str] = {
    MachineType.HEART: "cube",
    MachineType.NETWORK: "sphere",
    MachineType.CORE: "dodecahedron",
    MachineType.FORGE: "icosahedron",
}

# Couleurs de base par type
MACHINE_BASE_COLORS: Dict[str, str] = {
    MachineType.HEART: "#00ff88",     # Vert (selon statut)
    MachineType.NETWORK: "#4488ff",   # Bleu
    MachineType.CORE: "#00d4aa",      # Cyan
    MachineType.FORGE: "#aa44ff",     # Violet
}


# Aires cerebrales et leurs ports
BRAIN_AREAS = {
    "aire-visuelle": {"port_range": (8100, 8199), "color": "#00d4aa"},
    "aire-motrice": {"port_range": (8200, 8299), "color": "#00d4aa"},
    "aire-auditive": {"port_range": (8300, 8399), "color": "#00d4aa"},
    "prefrontal": {"port_range": (8400, 8499), "color": "#00d4aa"},
    "limbic": {"port_range": (8500, 8599), "color": "#00d4aa"},
    "cerebellum": {"port_range": (8600, 8699), "color": "#00d4aa"},
    "brainstem": {"port_range": (8050, 8099), "color": "#00d4aa"},
    "external": {"port_range": (8700, 8799), "color": "#00d4aa"},
}


# Priorite des statuts pour heritage (plus haut = plus prioritaire)
STATUS_PRIORITY = {
    Status.ERROR: 4,
    Status.WORKING: 3,
    Status.UP: 2,
    Status.DOWN: 1,
    Status.UNKNOWN: 0,
}


# Configuration WebSocket
WS_MAX_UPDATES_PER_SECOND = 10
WS_HEARTBEAT_INTERVAL = 30  # secondes


# Configuration cache
CACHE_TTL = 5  # secondes


# Machines speciales (node_id)
SPECIAL_NODES = {
    "OnyxSoma": MachineType.CORE,
    "OnyxLab": MachineType.FORGE,
    "onyxlab": MachineType.FORGE,
}

# Machines connues non detectees par Core (reseau NAT, offline, etc.)
KNOWN_MACHINES = [
    {
        "node_id": "OnyxLab",
        "hostname": "OnyxLab",
        "ip": "192.168.122.66",
        "machine_type": MachineType.FORGE,
        "status": Status.UP,
        "has_heart": True,
        "platform": "linux",
        "role": "Development VM",
    },
]

# Devices réseau sans Heart (routeurs, switches, NAS, etc.)
NETWORK_DEVICES = [
    {
        "node_id": "router-main",
        "hostname": "Livebox",
        "ip": "10.0.0.1",
        "machine_type": MachineType.NETWORK,
        "status": Status.UP,
        "has_heart": False,
        "role": "Router principal",
    },
    {
        "node_id": "switch-core",
        "hostname": "Switch-Core",
        "ip": "10.0.0.2",
        "machine_type": MachineType.NETWORK,
        "status": Status.UP,
        "has_heart": False,
        "role": "Switch principal",
    },
    {
        "node_id": "nas-synology",
        "hostname": "NAS-Synology",
        "ip": "10.0.0.50",
        "machine_type": MachineType.NETWORK,
        "status": Status.UP,
        "has_heart": False,
        "role": "Stockage NAS",
    },
    {
        "node_id": "ap-wifi",
        "hostname": "AP-Wifi",
        "ip": "10.0.0.10",
        "machine_type": MachineType.NETWORK,
        "status": Status.UP,
        "has_heart": False,
        "role": "Point d'accès WiFi",
    },
    {
        "node_id": "printer",
        "hostname": "Imprimante",
        "ip": "10.0.0.100",
        "machine_type": MachineType.NETWORK,
        "status": Status.UP,
        "has_heart": False,
        "role": "Imprimante réseau",
    },
]

# Mapping IP -> hostname pour corriger les noms manquants
IP_TO_HOSTNAME = {
    "10.0.0.13": "OnyxDendrite",
    "10.0.0.14": "OnyxFiber-01",
}
