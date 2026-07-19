"""API routes for Brain3D endpoints.

GET health, status, state, machines, skills, areas, visual config.
POST refresh state, receive metrics.
WebSocket /ws for real-time updates.
"""

import contextlib
import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse


def _get_version() -> str:
    """Read version from manifest.json."""
    try:
        # From src/modules/api/routes.py -> up to project root
        manifest_path = Path(__file__).parent.parent.parent.parent / "manifest.json"
        if manifest_path.exists():
            with Path(manifest_path).open() as f:
                data = json.load(f)
                return data.get("version", "3.1.0")
    except Exception:
        pass
    return "3.1.0"


CURRENT_VERSION = _get_version()
router = APIRouter()


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    """Health check endpoint.

    Returns:
        Health status with service info.
    """
    redis_subscriber = request.app.state.redis_subscriber
    ws_manager = request.app.state.ws_manager

    return {
        "status": "healthy",
        "service": "brain3d",
        "version": CURRENT_VERSION,
        "redis_connected": redis_subscriber.is_connected if redis_subscriber else False,
        "websocket_clients": ws_manager.connection_count if ws_manager else 0,
    }


@router.get("/status")
async def status(request: Request) -> dict[str, Any]:
    """Detailed service status.

    Returns:
        Status info with Redis and WebSocket details.
    """
    from src.redis_client import RedisHealthCheck

    ws_manager = request.app.state.ws_manager
    core_url = request.app.state.core_url
    redis_check = await RedisHealthCheck().check()

    return {
        "service": "brain3d",
        "version": CURRENT_VERSION,
        "redis": redis_check,
        "core_url": core_url,
        "websocket": ws_manager.get_stats() if ws_manager else {},
    }


@router.get("/api/state")
async def get_state(request: Request) -> dict[str, Any]:
    """Get complete network state.

    Returns:
        Network state with machines, skills, and areas.
    """
    state_manager = request.app.state.state_manager

    if state_manager:
        await state_manager.refresh_if_stale()
        return state_manager.get_network_state().model_dump(mode="json")
    return {"error": "State manager not initialized"}


@router.get("/api/machines")
async def get_machines(request: Request) -> dict[str, Any]:
    """Get list of all machines.

    Returns:
        List of machine objects.
    """
    state_manager = request.app.state.state_manager

    if state_manager:
        await state_manager.refresh_if_stale()
        return {
            "machines": [
                m.model_dump(mode="json") for m in state_manager._machines.values()
            ]
        }
    return {"machines": []}


@router.get("/api/machines/{node_id}", response_model=None)
async def get_machine(node_id: str, request: Request) -> dict[str, Any] | JSONResponse:
    """Get machine details by ID.

    Args:
        node_id: Machine node ID.
        request: HTTP request object.

    Returns:
        Machine object or 404 error.
    """
    state_manager = request.app.state.state_manager

    if state_manager:
        machine = state_manager.get_machine(node_id)
        if machine:
            return machine.model_dump(mode="json")
    return JSONResponse({"error": "Machine not found"}, status_code=404)


@router.get("/api/skills")
async def get_skills(request: Request, area: str | None = None) -> dict[str, Any]:
    """Get list of skills.

    Args:
        request: HTTP request object.
        area: Optional brain area filter.

    Returns:
        List of skill objects.
    """
    state_manager = request.app.state.state_manager

    if state_manager:
        await state_manager.refresh_if_stale()
        if area:
            skills = state_manager.get_skills_by_area(area)
        else:
            skills = list(state_manager._skills.values())
        return {"skills": [s.model_dump(mode="json") for s in skills]}
    return {"skills": []}


@router.get("/api/skills/{name}", response_model=None)
async def get_skill(name: str, request: Request) -> dict[str, Any] | JSONResponse:
    """Get skill details by name.

    Args:
        name: Skill name.
        request: HTTP request object.

    Returns:
        Skill object or 404 error.
    """
    state_manager = request.app.state.state_manager

    if state_manager:
        skill = state_manager.get_skill(name)
        if skill:
            return skill.model_dump(mode="json")
    return JSONResponse({"error": "Skill not found"}, status_code=404)


@router.get("/api/areas")
async def get_areas(request: Request) -> dict[str, Any]:
    """Get list of brain areas.

    Returns:
        List of area objects.
    """
    state_manager = request.app.state.state_manager

    if state_manager:
        await state_manager.refresh_if_stale()
        return {
            "areas": [a.model_dump(mode="json") for a in state_manager._areas.values()]
        }
    return {"areas": []}


@router.get("/api/areas/{area_id}", response_model=None)
async def get_area(area_id: str, request: Request) -> dict[str, Any] | JSONResponse:
    """Get brain area details.

    Args:
        area_id: Brain area ID.
        request: HTTP request object.

    Returns:
        Area object with skills or 404 error.
    """
    state_manager = request.app.state.state_manager

    if state_manager:
        area = state_manager.get_area(area_id)
        if area:
            skills = state_manager.get_skills_by_area(area_id)
            return {
                **area.model_dump(mode="json"),
                "skills_details": [s.model_dump(mode="json") for s in skills],
            }
    return JSONResponse({"error": "Area not found"}, status_code=404)


@router.get("/api/visual/{entity_type}/{entity_id}")
async def get_visual_config(
    entity_type: str, entity_id: str, request: Request
) -> dict[str, str]:
    """Get visual configuration for an entity.

    Args:
        entity_type: "machine", "skill", or "area".
        entity_id: Entity ID.
        request: HTTP request object.

    Returns:
        Visual config with shape, color, animation.
    """
    state_manager = request.app.state.state_manager

    if state_manager:
        return state_manager.get_visual_config(entity_type, entity_id)
    return {"shape": "sphere", "color": "#666666", "animation": "none"}


@router.post("/api/metrics/{node_id}")
async def receive_metrics(node_id: str, request: Request) -> dict[str, Any]:
    """Receive and process metrics for a machine.

    Args:
        node_id: Machine node ID.
        request: HTTP request with metrics payload.

    Returns:
        Metrics processing result.
    """
    # Get onyx SDK from app state
    onyx = getattr(request.app.state, "onyx", None)

    # onyx.working() - Start processing task
    with contextlib.suppress(Exception):
        if onyx:
            onyx.working(f"Processing metrics for {node_id}")

    try:
        state_manager = request.app.state.state_manager
        ws_manager = request.app.state.ws_manager

        # Parse incoming metrics
        data = await request.json()
        metrics = data.get("metrics", {})

        # Update machine metrics in state
        if state_manager:
            machine = state_manager.get_machine(node_id)
            if machine:
                # Update metrics
                if "cpu_percent" in metrics:
                    machine.metrics.cpu_percent = float(metrics.get("cpu_percent", 0))
                if "ram_percent" in metrics:
                    machine.metrics.ram_percent = float(metrics.get("ram_percent", 0))
                if "disk_percent" in metrics:
                    machine.metrics.disk_percent = float(metrics.get("disk_percent", 0))

                # Broadcast metrics update to clients
                await ws_manager.broadcast_metrics_update(node_id, metrics)

        result = {
            "success": True,
            "node_id": node_id,
            "metrics_processed": len(metrics),
        }

        # onyx.done() - Mark task as complete
        with contextlib.suppress(Exception):
            if onyx:
                onyx.done()

        return result
    except Exception as e:
        # Mark task as done even on error
        with contextlib.suppress(Exception):
            if onyx:
                onyx.done()
        return {"success": False, "error": str(e)}


@router.post("/api/refresh")
async def refresh_state(request: Request) -> dict[str, Any]:
    """Force state refresh.

    Returns:
        Refresh status and updated state.
    """
    state_manager = request.app.state.state_manager
    ws_manager = request.app.state.ws_manager

    if state_manager:
        state = await state_manager.refresh_all()
        await ws_manager.broadcast(
            {
                "type": "refresh",
                "reason": "manual",
                "data": state.model_dump(mode="json"),
            }
        )
        return {"success": True, "state": state.model_dump(mode="json")}
    return {"success": False, "error": "State manager not initialized"}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time updates.

    Args:
        websocket: WebSocket connection.
    """
    client_id = str(uuid.uuid4())[:8]
    state_manager = websocket.app.state.state_manager
    ws_manager = websocket.app.state.ws_manager

    try:
        await ws_manager.connect(websocket, client_id)

        if state_manager:
            await state_manager.refresh_if_stale()
            state = state_manager.get_network_state()
            await websocket.send_json(
                {
                    "type": "init",
                    "data": state.model_dump(mode="json"),
                }
            )

        while True:
            data = await websocket.receive_json()

            if data.get("type") == "refresh":
                if state_manager:
                    state = await state_manager.refresh_all()
                    await websocket.send_json(
                        {
                            "type": "refresh",
                            "reason": "manual",
                            "data": state.model_dump(mode="json"),
                        }
                    )
                continue

            response = await ws_manager.handle_client_message(client_id, data)
            await websocket.send_json(response)

    except WebSocketDisconnect:
        await ws_manager.disconnect(client_id)
    except Exception:
        await ws_manager.disconnect(client_id)
