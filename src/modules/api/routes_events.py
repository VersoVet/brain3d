"""Routes pour l'historique evenements et overlay metadata."""

import logging
from typing import Annotated

from fastapi import APIRouter, Query, Request

logger = logging.getLogger(__name__)

events_router = APIRouter(prefix="/api", tags=["events"])


@events_router.get("/events/history")
async def get_events_history(
    request: Request, count: Annotated[int, Query(ge=1, le=500)] = 50
) -> dict:
    """Retourne les derniers evenements du stream Redis.

    Args:
        request: FastAPI request.
        count: Nombre d'evenements a recuperer (1-500).

    Returns:
        Dict avec events et metadata stream.
    """
    stream_reader = request.app.state.stream_reader
    events = await stream_reader.read_history(count=count)
    info = await stream_reader.get_stream_info()

    return {
        "events": [e.model_dump(mode="json") for e in events],
        "count": len(events),
        "stream_info": info,
    }


@events_router.get("/events/since/{last_id}")
async def get_events_since(
    request: Request,
    last_id: str,
    count: Annotated[int, Query(ge=1, le=500)] = 50,
) -> dict:
    """Retourne les evenements posterieurs a un ID donne.

    Args:
        request: FastAPI request.
        last_id: ID du dernier evenement recu.
        count: Nombre max d'evenements.

    Returns:
        Dict avec events.
    """
    stream_reader = request.app.state.stream_reader
    events = await stream_reader.read_since(last_id=last_id, count=count)

    return {
        "events": [e.model_dump(mode="json") for e in events],
        "count": len(events),
    }


@events_router.get("/overlay/{hostname}")
async def get_overlay_metadata(request: Request, hostname: str) -> dict:
    """Retourne les metadonnees overlay d'une machine.

    Args:
        request: FastAPI request.
        hostname: Hostname de la machine.

    Returns:
        Dict avec capabilities, services, actions, specs.
    """
    overlay = request.app.state.overlay

    if not overlay.is_loaded:
        return {"error": "Overlay not loaded", "hostname": hostname}

    return {
        "hostname": hostname,
        "capabilities": overlay.get_capabilities(hostname),
        "services": overlay.get_services(hostname),
        "loaded": True,
    }
