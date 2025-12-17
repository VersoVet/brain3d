#!/usr/bin/env python3
"""
BRAIN3D SKILL - Visualisation 3D du cerveau Onyx

Skill de monitoring temps reel avec:
- Interface WebSocket pour mises a jour live
- Visualisation 3D Three.js du cerveau
- Vues: cerveau global, aires cerebrales, reseau machines

Se connecte a l'API Master OnyxCore (port 8000) pour:
- Recuperer l'architecture des skills
- Recevoir les events de status
- Lister les machines OnyxHeart
"""

import asyncio
import json
import logging
import os
import httpx
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Set, Optional, Any
from dataclasses import dataclass, asdict, field
from enum import Enum

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

try:
    from mcp_addon import run_mcp_background
except ImportError:
    run_mcp_background = lambda **kw: None
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
import uvicorn

# Configuration
SKILL_DIR = Path(__file__).parent
CORE_API_URL = os.environ.get("ONYX_CORE_URL", "http://10.0.0.11:8000")
NETWORK_INVENTORY_URL = os.environ.get("NETWORK_INVENTORY_URL", "http://10.0.0.11:8053")
PORT = int(os.environ.get("BRAIN3D_PORT", "8888"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("brain3d")


# ============ ENUMS ============

class SkillStatus(str, Enum):
    UP = "up"
    DOWN = "down"
    RUNNING = "running"
    OFF = "off"
    ONLINE = "online"
    OFFLINE = "offline"
    WORKING = "working"
    BUSY = "busy"
    FAILED = "failed"
    DEGRADED = "degraded"
    MAINTENANCE = "maintenance"
    UNKNOWN = "unknown"


STATUS_COLORS = {
    SkillStatus.UP: "#00ff88",
    SkillStatus.RUNNING: "#00ff88",
    SkillStatus.ONLINE: "#00ff88",
    SkillStatus.DOWN: "#ff4444",
    SkillStatus.OFF: "#888888",
    SkillStatus.OFFLINE: "#888888",
    SkillStatus.WORKING: "#ff00ff",
    SkillStatus.BUSY: "#ff00ff",
    SkillStatus.FAILED: "#ff0000",
    SkillStatus.DEGRADED: "#ff8800",
    SkillStatus.MAINTENANCE: "#888888",
    SkillStatus.UNKNOWN: "#666666",
}

STATUS_ANIMATIONS = {
    SkillStatus.UP: "pulse-slow",
    SkillStatus.DOWN: "none",
    SkillStatus.WORKING: "pulse-fast",
    SkillStatus.BUSY: "pulse-medium",
    SkillStatus.FAILED: "blink",
    SkillStatus.DEGRADED: "pulse-slow",
    SkillStatus.MAINTENANCE: "fade",
    SkillStatus.UNKNOWN: "none",
}

# Couleur uniforme pour toutes les aires cerebrales (cyan/turquoise)
AREA_DEFAULT_COLOR = "#00d4aa"


# ============ DATA CLASSES ============

@dataclass
class StatusEvent:
    skill_name: str
    status: SkillStatus
    brain_area: str
    task: str = ""
    progress: int = 0
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: Dict = field(default_factory=dict)


@dataclass
class ConnectedClient:
    websocket: WebSocket
    client_id: str
    connected_at: str
    view_mode: str = "global"
    focused_area: Optional[str] = None
    focused_skill: Optional[str] = None


# ============ WEBSOCKET MANAGER ============

class Brain3DConnectionManager:
    """Gestionnaire de connexions WebSocket pour Brain3D"""

    def __init__(self):
        self.active_connections: Dict[str, ConnectedClient] = {}
        self._client_counter = 0
        self._status_cache: Dict[str, StatusEvent] = {}

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        self._client_counter += 1
        client_id = f"brain3d_{self._client_counter}"

        self.active_connections[client_id] = ConnectedClient(
            websocket=websocket,
            client_id=client_id,
            connected_at=datetime.now().isoformat()
        )

        logger.info(f"Client {client_id} connected. Total: {len(self.active_connections)}")
        return client_id

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client {client_id} disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: Dict):
        disconnected = []
        for client_id, client in self.active_connections.items():
            try:
                await client.websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to {client_id}: {e}")
                disconnected.append(client_id)

        for client_id in disconnected:
            self.disconnect(client_id)

    async def send_to_client(self, client_id: str, message: Dict):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to {client_id}: {e}")
                self.disconnect(client_id)

    def set_client_focus(self, client_id: str, view_mode: str,
                         area: Optional[str] = None, skill: Optional[str] = None):
        if client_id in self.active_connections:
            client = self.active_connections[client_id]
            client.view_mode = view_mode
            client.focused_area = area
            client.focused_skill = skill

    def update_status_cache(self, event: StatusEvent):
        self._status_cache[event.skill_name] = event

    def get_cached_status(self, skill_name: str) -> Optional[StatusEvent]:
        return self._status_cache.get(skill_name)

    def get_all_cached_statuses(self) -> Dict[str, StatusEvent]:
        return self._status_cache.copy()

    def get_stats(self) -> Dict:
        return {
            "total_connections": len(self.active_connections),
            "cached_statuses": len(self._status_cache),
            "clients": [
                {
                    "id": c.client_id,
                    "connected_at": c.connected_at,
                    "view_mode": c.view_mode,
                    "focused_area": c.focused_area
                }
                for c in self.active_connections.values()
            ]
        }


# ============ CORE API CLIENT ============

class CoreAPIClient:
    """Client pour communiquer avec l'API Master OnyxCore"""

    def __init__(self, base_url: str = CORE_API_URL):
        self.base_url = base_url
        self._client = httpx.AsyncClient(timeout=10.0)

    async def get_skills(self) -> List[Dict]:
        """Recupere la liste des skills depuis OnyxCore"""
        try:
            resp = await self._client.get(f"{self.base_url}/api/skills")
            if resp.status_code == 200:
                data = resp.json()
                return data.get("skills", [])
        except Exception as e:
            logger.error(f"Failed to get skills from Core: {e}")
        return []

    async def get_brain_areas(self) -> Dict:
        """Recupere les aires cerebrales"""
        try:
            resp = await self._client.get(f"{self.base_url}/api/brain/areas")
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Failed to get brain areas: {e}")
        return {}

    async def get_machines(self) -> List[Dict]:
        """Recupere la liste des machines OnyxHeart"""
        try:
            resp = await self._client.get(f"{self.base_url}/api/machines")
            if resp.status_code == 200:
                data = resp.json()
                return data.get("machines", [])
        except Exception as e:
            logger.error(f"Failed to get machines: {e}")
        return []

    async def get_network_devices(self) -> Dict[str, Dict]:
        """Recupere la liste des machines reseau depuis network-inventory"""
        try:
            resp = await self._client.get(f"{NETWORK_INVENTORY_URL}/devices")
            if resp.status_code == 200:
                data = resp.json()
                return data.get("devices", {})
        except Exception as e:
            logger.warning(f"Failed to get network devices: {e}")
        return {}

    async def get_all_machines(self) -> List[Dict]:
        """
        Combine les machines OnyxHeart et les devices reseau.
        Retourne une liste unifiee avec has_onyxheart=True/False
        """
        # Recuperer les deux sources
        onyxheart_machines = await self.get_machines()
        network_devices = await self.get_network_devices()

        # Indexer les machines OnyxHeart par IP
        onyxheart_by_ip = {m.get("local_ip"): m for m in onyxheart_machines}

        # Construire la liste combinee
        all_machines = []

        # D'abord ajouter les machines OnyxHeart
        for machine in onyxheart_machines:
            machine["has_onyxheart"] = True
            machine["device_type"] = "onyxheart"
            all_machines.append(machine)

        # Ensuite ajouter les devices reseau qui n'ont pas OnyxHeart
        for name, device in network_devices.items():
            ip = device.get("ip")
            if ip and ip not in onyxheart_by_ip:
                # Machine sans OnyxHeart
                all_machines.append({
                    "node_id": f"network-{name}",
                    "hostname": name,
                    "local_ip": ip,
                    "mac": device.get("mac"),
                    "platform": device.get("os", "unknown"),
                    "status": "unknown",  # Pas de heartbeat
                    "device_type": device.get("type", "unknown"),
                    "role": device.get("role", ""),
                    "has_onyxheart": False,
                    "wol_enabled": device.get("wol_enabled", False),
                    "managed": device.get("managed", False),
                    "skills": []
                })

        return all_machines

    async def get_skill_status(self, skill_name: str) -> Optional[Dict]:
        """Recupere le status d'un skill"""
        try:
            resp = await self._client.get(f"{self.base_url}/api/skills/{skill_name}/status")
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Failed to get skill status: {e}")
        return None

    async def close(self):
        await self._client.aclose()


# ============ FASTAPI APP ============

app = FastAPI(
    title="Brain3D Visualizer",
    description="Visualisation 3D temps reel du cerveau Onyx",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files and templates
static_path = SKILL_DIR / "static"
templates_path = SKILL_DIR / "templates"

if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

templates = None
if templates_path.exists():
    templates = Jinja2Templates(directory=str(templates_path))

# Global instances
manager = Brain3DConnectionManager()
core_client = CoreAPIClient()


# ============ STARTUP / SHUTDOWN ============

@app.on_event("startup")
async def startup():
    logger.info(f"Brain3D starting on port {PORT}")
    logger.info(f"Core API: {CORE_API_URL}")

    # Emettre notre status vers OnyxCore
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{CORE_API_URL}/status",
                json={
                    "skill_name": "brain3d",
                    "status": "up",
                    "brain_area": "cortex-prefrontal",
                    "task": "Brain3D Visualizer ready"
                }
            )
    except Exception as e:
        logger.warning(f"Could not notify Core: {e}")

    # Start MCP server
    run_mcp_background(core_client=core_client)


@app.on_event("shutdown")
async def shutdown():
    await core_client.close()
    logger.info("Brain3D shutdown")


# ============ ROUTES ============

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "skill": "brain3d",
        "version": "2.0.0",
        "connections": len(manager.active_connections)
    }


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Page principale Brain3D"""
    if templates:
        return templates.TemplateResponse("index.html", {"request": request})
    else:
        return HTMLResponse(content="""
        <!DOCTYPE html>
        <html>
        <head><title>Brain3D</title></head>
        <body>
            <h1>Brain3D Visualizer</h1>
            <p>UI templates not found. API available at /architecture</p>
            <ul>
                <li><a href="/architecture">Architecture 3D</a></li>
                <li><a href="/connections">WebSocket Stats</a></li>
                <li><a href="/health">Health Check</a></li>
            </ul>
        </body>
        </html>
        """)


@app.get("/architecture")
async def get_architecture():
    """Architecture 3D complete du cerveau"""
    skills = await core_client.get_skills()
    machines = await core_client.get_all_machines()

    # Organiser par aire cerebrale
    areas = {}
    for skill in skills:
        area_id = skill.get("brain_area_id", "external")
        if area_id not in areas:
            areas[area_id] = {
                "id": area_id,
                "name": area_id.replace("-", " ").title(),
                "skills": [],
                "color": AREA_DEFAULT_COLOR
            }

        # Ajouter status cache si disponible
        cached = manager.get_cached_status(skill["name"])
        if cached:
            skill["live_status"] = cached.status.value
            skill["live_task"] = cached.task

        areas[area_id]["skills"].append(skill)

    return {
        "version": "2.0",
        "timestamp": datetime.now().isoformat(),
        "areas": areas,
        "machines": machines,
        "stats": {
            "total_skills": len(skills),
            "total_areas": len(areas),
            "total_machines": len(machines),
            "websocket_clients": len(manager.active_connections)
        }
    }


@app.get("/areas/{area_id}")
async def get_area(area_id: str):
    """Detail d'une aire cerebrale"""
    skills = await core_client.get_skills()
    area_skills = [s for s in skills if s.get("brain_area_id") == area_id]

    if not area_skills:
        raise HTTPException(status_code=404, detail=f"Area {area_id} not found")

    return {
        "area_id": area_id,
        "skills": area_skills,
        "count": len(area_skills)
    }


@app.get("/states")
async def get_states():
    """Tous les etats caches"""
    return {
        "states": {k: asdict(v) for k, v in manager.get_all_cached_statuses().items()},
        "count": len(manager._status_cache)
    }


@app.get("/connections")
async def get_connections():
    """Stats WebSocket"""
    return manager.get_stats()


@app.get("/machines")
async def get_machines_endpoint():
    """Liste de toutes les machines (OnyxHeart + reseau)"""
    machines = await core_client.get_all_machines()
    onyxheart_count = sum(1 for m in machines if m.get("has_onyxheart"))
    return {
        "machines": machines,
        "count": len(machines),
        "onyxheart_count": onyxheart_count,
        "network_only_count": len(machines) - onyxheart_count
    }


# ============ MACHINE METRICS ============

# Cache des metriques par machine (node_id -> {cpu, ram, gpu, disk, timestamp})
_metrics_cache: Dict[str, Dict] = {}

@app.get("/api/metrics")
async def get_all_metrics():
    """
    Retourne les metriques systeme de toutes les machines.
    Format: { "node_id": { "cpu": 0-100, "ram": 0-100, "gpu": 0-100, "disk": 0-100 }, ... }
    """
    # Recuperer les machines pour avoir les node_ids
    machines = await core_client.get_all_machines()

    result = {}
    for machine in machines:
        node_id = machine.get("node_id")
        if node_id and node_id in _metrics_cache:
            result[node_id] = _metrics_cache[node_id]

    return result


@app.post("/api/metrics/{node_id}")
async def receive_metrics(node_id: str, metrics: Dict):
    """
    Recoit les metriques d'une machine (envoye par OnyxHeart).
    Attend: { "cpu": 0-100, "ram": 0-100, "gpu": 0-100, "disk": 0-100 }
    """
    try:
        # Valider et normaliser les metriques
        validated = {
            "cpu": max(0, min(100, metrics.get("cpu", 0))),
            "ram": max(0, min(100, metrics.get("ram", 0))),
            "gpu": max(0, min(100, metrics.get("gpu", 0))),
            "disk": max(0, min(100, metrics.get("disk", 0))),
            "timestamp": datetime.now().isoformat()
        }

        _metrics_cache[node_id] = validated

        # Broadcast aux clients WebSocket (optionnel, pour updates en temps reel)
        await manager.broadcast({
            "type": "metrics_update",
            "node_id": node_id,
            "metrics": validated
        })

        return {"success": True, "node_id": node_id}

    except Exception as e:
        logger.error(f"Error receiving metrics for {node_id}: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/metrics/{node_id}")
async def get_machine_metrics(node_id: str):
    """Retourne les metriques d'une machine specifique"""
    if node_id in _metrics_cache:
        return _metrics_cache[node_id]
    raise HTTPException(status_code=404, detail=f"No metrics for {node_id}")


# ============ STATUS RECEIVER ============

@app.post("/status")
async def receive_status(event: Dict):
    """
    Recoit les mises a jour de status depuis OnyxCore.
    Broadcast aux clients WebSocket.
    """
    try:
        skill_name = event.get("skill_name")
        if not skill_name:
            return {"success": False, "error": "skill_name required"}

        status_str = event.get("status", "up")
        try:
            status = SkillStatus(status_str)
        except ValueError:
            status = SkillStatus.UNKNOWN

        status_event = StatusEvent(
            skill_name=skill_name,
            status=status,
            brain_area=event.get("brain_area", "external"),
            task=event.get("task", ""),
            progress=event.get("progress", 0),
            metadata=event.get("metadata", {})
        )

        # Cache le status
        manager.update_status_cache(status_event)

        # Broadcast aux clients (inclure host pour skills distants)
        broadcast_data = asdict(status_event)
        if "host" in event:
            broadcast_data["host"] = event["host"]

        await manager.broadcast({
            "type": "status_update",
            "data": broadcast_data,
            "color": STATUS_COLORS.get(status, "#666666"),
            "animation": STATUS_ANIMATIONS.get(status, "none")
        })

        return {"success": True}

    except Exception as e:
        logger.error(f"Error receiving status: {e}")
        return {"success": False, "error": str(e)}


# ============ WEBSOCKET ============

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket principal Brain3D"""
    client_id = await manager.connect(websocket)

    try:
        # Envoyer l'architecture initiale
        arch = await get_architecture()
        await manager.send_to_client(client_id, {
            "type": "init",
            "data": arch
        })

        # Envoyer les status caches
        for skill_name, event in manager.get_all_cached_statuses().items():
            await manager.send_to_client(client_id, {
                "type": "status_update",
                "data": asdict(event),
                "color": STATUS_COLORS.get(event.status, "#666666"),
                "animation": STATUS_ANIMATIONS.get(event.status, "none")
            })

        # Boucle de reception
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "set_focus":
                manager.set_client_focus(
                    client_id,
                    data.get("view_mode", "global"),
                    data.get("area"),
                    data.get("skill")
                )
            elif data.get("type") == "ping":
                await manager.send_to_client(client_id, {"type": "pong"})
            elif data.get("type") == "refresh":
                arch = await get_architecture()
                await manager.send_to_client(client_id, {
                    "type": "refresh",
                    "data": arch
                })

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
        manager.disconnect(client_id)


@app.websocket("/ws/area/{area_id}")
async def websocket_area(websocket: WebSocket, area_id: str):
    """WebSocket filtre par aire cerebrale"""
    client_id = await manager.connect(websocket)
    manager.set_client_focus(client_id, "area", area=area_id)

    try:
        # Envoyer l'aire initiale
        area_data = await get_area(area_id)
        await manager.send_to_client(client_id, {
            "type": "init_area",
            "data": area_data
        })

        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await manager.send_to_client(client_id, {"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket area error: {e}")
        manager.disconnect(client_id)


# ============ MAIN ============

if __name__ == "__main__":
    uvicorn.run(
        "skill:app",
        host="0.0.0.0",
        port=PORT,
        reload=False,
        log_level="info"
    )
