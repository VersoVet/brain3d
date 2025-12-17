#!/usr/bin/env python3
"""
MCP Server addon pour brain3d
"""

import asyncio
import logging
import sys
from pathlib import Path

SKILL_NAME = "brain3d"
MCP_PORT = 8988
SKILL_VERSION = "2.0.0"
ONYX_BASE = Path("/mnt/verso-data/cluster/apps/onyx")

logger = logging.getLogger(f"{SKILL_NAME}.mcp")
sys.path.insert(0, str(ONYX_BASE))

mcp_server = None
_core_client = None


def setup_mcp_server(core_client=None, **kwargs):
    """Configure le serveur MCP"""
    global mcp_server, _core_client
    _core_client = core_client

    try:
        from mcp.server import MCPServer
        mcp_server = MCPServer(SKILL_NAME, SKILL_VERSION)

        # Tool: status
        @mcp_server.tool(f"{SKILL_NAME.replace('-', '_')}/status")
        async def mcp_status(params: dict) -> dict:
            """Status du skill brain3d"""
            return {
                "name": SKILL_NAME,
                "status": "up",
                "mcp_port": MCP_PORT,
                "version": SKILL_VERSION
            }

        # Tool: health
        @mcp_server.tool(f"{SKILL_NAME.replace('-', '_')}/health")
        async def mcp_health(params: dict) -> dict:
            """Health check"""
            return {"healthy": True, "skill": SKILL_NAME}

        # Tool: architecture
        @mcp_server.tool(f"{SKILL_NAME.replace('-', '_')}/architecture")
        async def mcp_architecture(params: dict) -> dict:
            """Get brain architecture (areas, skills, machines)"""
            if _core_client:
                return await _core_client.get_architecture()
            return {"error": "Core client not initialized"}

        # Tool: states
        @mcp_server.tool(f"{SKILL_NAME.replace('-', '_')}/states")
        async def mcp_states(params: dict) -> dict:
            """Get cached skill states"""
            from skill import skill_states
            return {
                "states": {k: v.dict() for k, v in skill_states.items()},
                "count": len(skill_states)
            }

        # Tool: machines
        @mcp_server.tool(f"{SKILL_NAME.replace('-', '_')}/machines")
        async def mcp_machines(params: dict) -> dict:
            """Get all machines (OnyxHeart + network devices)"""
            if _core_client:
                return await _core_client.get_all_machines()
            return {"error": "Core client not initialized"}

        # Tool: areas
        @mcp_server.tool(f"{SKILL_NAME.replace('-', '_')}/areas")
        async def mcp_areas(params: dict) -> dict:
            """Get brain areas summary"""
            if _core_client:
                arch = await _core_client.get_architecture()
                areas = arch.get("areas", {})
                return {
                    "areas": [
                        {
                            "id": area_id,
                            "name": area.get("name", area_id),
                            "skill_count": len(area.get("skills", []))
                        }
                        for area_id, area in areas.items()
                    ],
                    "count": len(areas)
                }
            return {"error": "Core client not initialized"}

        logger.info(f"MCP Server configured with {len(mcp_server.tools)} tools on port {MCP_PORT}")
        return mcp_server

    except ImportError:
        logger.warning("MCP module not available")
        return None


async def start_mcp_server():
    """Demarre le serveur MCP"""
    if mcp_server:
        try:
            await mcp_server.start("0.0.0.0", MCP_PORT)
        except Exception as e:
            logger.error(f"MCP Server error: {e}")


def run_mcp_background(core_client=None, **kwargs):
    """Lance le serveur MCP dans un thread separe"""
    import threading

    setup_mcp_server(core_client=core_client, **kwargs)

    if mcp_server is None:
        return

    def mcp_thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(start_mcp_server())
        except Exception as e:
            logger.error(f"MCP thread error: {e}")

    thread = threading.Thread(target=mcp_thread, daemon=True)
    thread.start()
    logger.info(f"MCP server started in background on port {MCP_PORT}")
