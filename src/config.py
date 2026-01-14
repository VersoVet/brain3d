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
    PROXY_TARGET = "proxy_target"  # Machine sans Heart, surveillee par Heart Proxy


# Formes 3D par type de machine
MACHINE_SHAPES: Dict[str, str] = {
    MachineType.HEART: "cube",
    MachineType.NETWORK: "sphere",
    MachineType.CORE: "dodecahedron",
    MachineType.FORGE: "icosahedron",
    MachineType.PROXY_TARGET: "cube",  # Cube pointille/transparent
}

# Couleurs de base par type
MACHINE_BASE_COLORS: Dict[str, str] = {
    MachineType.HEART: "#00ff88",     # Vert (selon statut)
    MachineType.NETWORK: "#4488ff",   # Bleu
    MachineType.CORE: "#00d4aa",      # Cyan
    MachineType.FORGE: "#aa44ff",     # Violet
    MachineType.PROXY_TARGET: "#88aaff",  # Bleu clair (proxy)
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

# NOTE: Les machines sont maintenant récupérées dynamiquement depuis:
# - Core /deploy/nodes (machines avec Heart)
# - network-inventory /devices (tous les devices réseau)
# Plus besoin de KNOWN_MACHINES, NETWORK_DEVICES, SPECIAL_NODES, IP_TO_HOSTNAME
