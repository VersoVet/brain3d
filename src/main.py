"""
Brain3D - Visualisation 3D de l'ecosysteme Onyx
FastAPI Application principale
"""

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .config import PORT, DEV_PORT, REDIS_URL, CORE_URL, Status
from .redis_client import RedisSubscriber, RedisHealthCheck
from .core_client import CoreAPIClient
from .websocket_manager import WebSocketManager
from .state_manager import StateManager

# Configuration logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Chemins
BASE_DIR = Path(__file__).parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

# Composants globaux
redis_subscriber: RedisSubscriber = None
core_client: CoreAPIClient = None
ws_manager: WebSocketManager = None
state_manager: StateManager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestion du cycle de vie de l'application"""
    global redis_subscriber, core_client, ws_manager, state_manager

    logger.info("Demarrage Brain3D...")

    # Initialiser les composants
    core_client = CoreAPIClient()  # Utilise le SDK avec config interne
    ws_manager = WebSocketManager()
    state_manager = StateManager(core_client, ws_manager)

    # Demarrer WebSocket manager
    await ws_manager.start()

    # Initialiser Redis subscriber
    redis_subscriber = RedisSubscriber(redis_url=REDIS_URL)
    redis_subscriber.add_callback(state_manager.handle_redis_event)

    # Callback pour visualisation Message Bus (particules animées)
    async def broadcast_redis_to_frontend(event):
        """Forward les événements Redis au frontend pour visualisation"""
        await ws_manager.broadcast_redis_event(
            event_type=event.type,
            node=event.node,
            data=event.data
        )
    redis_subscriber.add_callback(broadcast_redis_to_frontend)

    # Tenter connexion Redis (non bloquant si echec)
    if await redis_subscriber.start():
        logger.info("Redis connecte - mode temps reel actif")
    else:
        logger.warning("Redis non disponible - mode polling actif")

    # Charger l'etat initial
    try:
        await state_manager.refresh_all()
        logger.info("Etat initial charge")
    except Exception as e:
        logger.error(f"Erreur chargement etat initial: {e}")

    yield

    # Cleanup
    logger.info("Arret Brain3D...")
    await redis_subscriber.stop()
    await ws_manager.stop()
    logger.info("Brain3D arrete")


# Application FastAPI
app = FastAPI(
    title="Brain3D",
    description="Visualisation 3D de l'ecosysteme Onyx",
    version="3.0.0",
    lifespan=lifespan,
)

# Monter les fichiers statiques
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Templates Jinja2
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


# === ROUTES HTML ===

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Page principale"""
    return templates.TemplateResponse("index.html", {
        "request": request,
        "title": "Brain3D - Onyx Visualizer",
    })


# === ROUTES API ===

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "service": "brain3d",
        "version": "3.0.0",
        "redis_connected": redis_subscriber.is_connected if redis_subscriber else False,
        "websocket_clients": ws_manager.connection_count if ws_manager else 0,
    }


@app.get("/status")
async def status():
    """Statut detaille"""
    redis_check = await RedisHealthCheck().check()

    return {
        "service": "brain3d",
        "version": "3.0.0",
        "redis": redis_check,
        "core_url": CORE_URL,
        "websocket": ws_manager.get_stats() if ws_manager else {},
    }


@app.get("/api/state")
async def get_state():
    """Retourne l'etat complet du reseau"""
    if state_manager:
        await state_manager.refresh_if_stale()
        return state_manager.get_network_state().model_dump(mode='json')
    return {"error": "State manager not initialized"}


@app.get("/api/machines")
async def get_machines():
    """Liste des machines"""
    if state_manager:
        await state_manager.refresh_if_stale()
        return {
            "machines": [m.model_dump(mode='json') for m in state_manager._machines.values()]
        }
    return {"machines": []}


@app.get("/api/machines/{node_id}")
async def get_machine(node_id: str):
    """Detail d'une machine"""
    if state_manager:
        machine = state_manager.get_machine(node_id)
        if machine:
            return machine.model_dump(mode='json')
    return JSONResponse({"error": "Machine not found"}, status_code=404)


@app.get("/api/skills")
async def get_skills(area: str = None):
    """Liste des skills"""
    if state_manager:
        await state_manager.refresh_if_stale()
        if area:
            skills = state_manager.get_skills_by_area(area)
        else:
            skills = list(state_manager._skills.values())
        return {"skills": [s.model_dump(mode='json') for s in skills]}
    return {"skills": []}


@app.get("/api/skills/{name}")
async def get_skill(name: str):
    """Detail d'un skill"""
    if state_manager:
        skill = state_manager.get_skill(name)
        if skill:
            return skill.model_dump(mode='json')
    return JSONResponse({"error": "Skill not found"}, status_code=404)


@app.get("/api/areas")
async def get_areas():
    """Liste des aires cerebrales"""
    if state_manager:
        await state_manager.refresh_if_stale()
        return {"areas": [a.model_dump(mode='json') for a in state_manager._areas.values()]}
    return {"areas": []}


@app.get("/api/areas/{area_id}")
async def get_area(area_id: str):
    """Detail d'une aire"""
    if state_manager:
        area = state_manager.get_area(area_id)
        if area:
            skills = state_manager.get_skills_by_area(area_id)
            return {
                **area.model_dump(mode='json'),
                "skills_details": [s.model_dump(mode='json') for s in skills],
            }
    return JSONResponse({"error": "Area not found"}, status_code=404)


@app.get("/api/visual/{entity_type}/{entity_id}")
async def get_visual_config(entity_type: str, entity_id: str):
    """Configuration visuelle pour une entite"""
    if state_manager:
        return state_manager.get_visual_config(entity_type, entity_id)
    return {"shape": "sphere", "color": "#666666", "animation": "none"}


@app.post("/api/refresh")
async def refresh_state():
    """Force le rafraichissement de l'etat"""
    if state_manager:
        state = await state_manager.refresh_all()
        # Broadcast aux clients
        await ws_manager.broadcast({
            "type": "refresh",
            "reason": "manual",
            "data": state.model_dump(mode='json'),
        })
        return {"success": True, "state": state.model_dump(mode='json')}
    return {"success": False, "error": "State manager not initialized"}


# === WEBSOCKET ===

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Endpoint WebSocket principal"""
    client_id = str(uuid.uuid4())[:8]

    try:
        client = await ws_manager.connect(websocket, client_id)

        # Envoyer l'etat initial
        if state_manager:
            await state_manager.refresh_if_stale()
            state = state_manager.get_network_state()
            await websocket.send_json({
                "type": "init",
                "data": state.model_dump(mode='json'),
            })

        # Boucle de reception
        while True:
            data = await websocket.receive_json()
            response = await ws_manager.handle_client_message(client_id, data)
            await websocket.send_json(response)

    except WebSocketDisconnect:
        await ws_manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"Erreur WebSocket {client_id}: {e}")
        await ws_manager.disconnect(client_id)


# === MAIN ===

def main():
    """Point d'entree principal"""
    import uvicorn
    import os

    # Mode dev ou prod
    is_dev = os.getenv("BRAIN3D_DEV", "false").lower() == "true"
    port = DEV_PORT if is_dev else PORT

    logger.info(f"Demarrage Brain3D sur port {port} (dev={is_dev})")

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=port,
        reload=is_dev,
    )


if __name__ == "__main__":
    main()
