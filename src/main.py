"""Brain3D - 3D visualization of Onyx ecosystem.

FastAPI application with real-time WebSocket updates via Redis and OnyxCore.
"""

import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

try:
    from onyx_sdk import OnyxClient
except ImportError:
    OnyxClient = None

from src.channel_handlers import ChannelEventRouter
from src.config import (
    CORE_URL,
    DEV_PORT,
    NETWORK_INVENTORY_URL,
    PORT,
    REDIS_CHANNELS,
    REDIS_URL,
)
from src.data_client import DataClient
from src.modules.api.routes import router
from src.modules.api.routes_events import events_router
from src.overlay_enricher import OverlayEnricher
from src.redis_client import RedisSubscriber
from src.state_manager import StateManager
from src.stream_reader import RedisStreamReader
from src.websocket_manager import WebSocketManager

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"


def get_version() -> str:
    """Read version from manifest.json."""
    try:
        manifest_path = BASE_DIR / "manifest.json"
        if manifest_path.exists():
            with Path(manifest_path).open() as f:
                data = json.load(f)
                return data.get("version", "3.1.0")
    except Exception:
        pass
    return "3.1.0"


VERSION = get_version()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle.

    Initializes all components on startup and cleans up on shutdown.
    """
    logger.info("Starting Brain3D...")
    logger.info(f"  Core: {CORE_URL}")
    logger.info(f"  network-inventory: {NETWORK_INVENTORY_URL}")

    # Initialize OnyxClient SDK
    if OnyxClient:
        try:
            OnyxClient(skill_name="brain3d", core_url=CORE_URL)
            logger.info("OnyxClient SDK initialized")
        except Exception as e:
            logger.warning(f"OnyxClient SDK init failed: {e}")

    # Load overlay metadata
    overlay = OverlayEnricher()
    await overlay.load()

    # Initialize components
    data_client = DataClient(
        core_url=CORE_URL, network_url=NETWORK_INVENTORY_URL, overlay=overlay
    )
    ws_manager = WebSocketManager()
    state_manager = StateManager(data_client, ws_manager)
    channel_router = ChannelEventRouter(state_manager, ws_manager)

    # Initialize stream reader
    stream_reader = RedisStreamReader(redis_url=REDIS_URL)
    await stream_reader.connect()

    # Start WebSocket manager
    await ws_manager.start()

    # Initialize Redis subscriber (all channels)
    redis_subscriber = RedisSubscriber(redis_url=REDIS_URL)

    async def route_redis_event(event: Any, channel: str) -> None:
        """Route Redis events by channel."""
        if channel == REDIS_CHANNELS["events"]:
            await state_manager.handle_redis_event(event)
        else:
            await channel_router.handle_event(event, channel)
        # Always forward to frontend
        await ws_manager.broadcast_redis_event(
            event_type=event.type, node=event.node, data=event.data
        )

    redis_subscriber.add_callback(route_redis_event)

    # Try connecting to Redis
    if await redis_subscriber.start():
        logger.info("Redis connected - real-time mode active")
    else:
        logger.warning("Redis unavailable - polling mode active")

    # Load initial state
    try:
        await state_manager.refresh_all()
        logger.info("Initial state loaded")
    except Exception as e:
        logger.error(f"Error loading initial state: {e}")

    # Start Core WebSocket
    try:
        await state_manager.start_core_ws()
        logger.info("Core WebSocket connected")
    except Exception as e:
        logger.warning(f"Core WebSocket unavailable: {e}")

    # Store components in app state for routes
    app.state.redis_subscriber = redis_subscriber
    app.state.data_client = data_client
    app.state.ws_manager = ws_manager
    app.state.state_manager = state_manager
    app.state.stream_reader = stream_reader
    app.state.overlay = overlay
    app.state.core_url = CORE_URL

    yield

    # Cleanup
    logger.info("Stopping Brain3D...")
    await state_manager.stop_core_ws()
    await redis_subscriber.stop()
    await stream_reader.close()
    await ws_manager.stop()
    await data_client.close()
    logger.info("Brain3D stopped")


app = FastAPI(
    title="Brain3D",
    description="Visualisation 3D de l'ecosysteme Onyx",
    version=VERSION,
    lifespan=lifespan,
)

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Jinja2 templates
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Include API routes
app.include_router(router)
app.include_router(events_router)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    """Main page.

    Returns:
        TemplateResponse with rendered HTML.
    """
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "title": "Brain3D - Onyx Visualizer",
        },
    )


def main():
    """Entry point for running Brain3D server."""
    import uvicorn

    is_dev = os.getenv("BRAIN3D_DEV", "false").lower() == "true"
    port = DEV_PORT if is_dev else PORT

    logger.info(f"Starting Brain3D on port {port} (dev={is_dev})")

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=port,
        reload=is_dev,
    )


if __name__ == "__main__":
    main()
