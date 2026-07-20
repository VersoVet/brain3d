"""Tests for channel_handlers module."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.channel_handlers import ChannelEventRouter
from src.config import REDIS_CHANNELS, Status
from src.models import RedisEvent, Skill


@pytest.fixture
def state_manager() -> MagicMock:
    """Create mock state manager."""
    sm = MagicMock()
    sm._handle_full_refresh = AsyncMock()
    return sm


@pytest.fixture
def ws_manager() -> MagicMock:
    """Create mock WebSocket manager."""
    ws = MagicMock()
    ws.broadcast_status_update = AsyncMock()
    ws.broadcast = AsyncMock()
    return ws


@pytest.fixture
def router(state_manager: MagicMock, ws_manager: MagicMock) -> ChannelEventRouter:
    """Create ChannelEventRouter with mocks."""
    return ChannelEventRouter(state_manager, ws_manager)


@pytest.mark.asyncio
async def test_handle_skill_status(router: ChannelEventRouter, state_manager: MagicMock, ws_manager: MagicMock) -> None:
    """Test skill status event handling."""
    skill = Skill(name="test-skill", status=Status.DOWN)
    state_manager.get_skill.return_value = skill

    event = RedisEvent(
        type="skill_status",
        node="test-skill",
        channel=REDIS_CHANNELS["skill_status"],
        data={"status": "UP", "message": "Ready"},
    )

    await router.handle_event(event, REDIS_CHANNELS["skill_status"])

    assert skill.status == Status.UP
    ws_manager.broadcast_status_update.assert_called_once()


@pytest.mark.asyncio
async def test_handle_skill_status_unknown(router: ChannelEventRouter, state_manager: MagicMock) -> None:
    """Test skill status with unknown skill."""
    state_manager.get_skill.return_value = None

    event = RedisEvent(
        type="skill_status",
        node="unknown-skill",
        data={"status": "UP"},
    )

    await router.handle_event(event, REDIS_CHANNELS["skill_status"])
    # Should not crash


@pytest.mark.asyncio
async def test_handle_broadcast(router: ChannelEventRouter, ws_manager: MagicMock) -> None:
    """Test broadcast event handling."""
    event = RedisEvent(
        type="maintenance",
        node="system",
        data={"severity": "warning", "message": "Reboot in 5min"},
    )

    await router.handle_event(event, REDIS_CHANNELS["broadcast"])

    ws_manager.broadcast.assert_called_once()
    call_args = ws_manager.broadcast.call_args[0][0]
    assert call_args["type"] == "broadcast"
    assert call_args["severity"] == "warning"


@pytest.mark.asyncio
async def test_handle_forge_deploy_success(router: ChannelEventRouter, state_manager: MagicMock) -> None:
    """Test forge deploy success triggers refresh."""
    event = RedisEvent(
        type="deploy_completed",
        node="my-skill",
        data={"status": "success", "duration_ms": 5000},
    )

    await router.handle_event(event, REDIS_CHANNELS["forge"])

    state_manager._handle_full_refresh.assert_called_once()


@pytest.mark.asyncio
async def test_handle_forge_build_started(router: ChannelEventRouter, ws_manager: MagicMock) -> None:
    """Test forge build event is broadcast."""
    event = RedisEvent(
        type="build_started",
        node="my-skill",
        data={"branch": "dev"},
    )

    await router.handle_event(event, REDIS_CHANNELS["forge"])

    ws_manager.broadcast.assert_called_once()
    call_args = ws_manager.broadcast.call_args[0][0]
    assert call_args["type"] == "forge_event"
    assert call_args["action"] == "build_started"


@pytest.mark.asyncio
async def test_unknown_channel(router: ChannelEventRouter, ws_manager: MagicMock) -> None:
    """Test unknown channel does not crash."""
    event = RedisEvent(type="test", node="x", data={})
    await router.handle_event(event, "onyx:unknown")
    ws_manager.broadcast.assert_not_called()


def test_get_stats(router: ChannelEventRouter) -> None:
    """Test get_stats returns channel info."""
    stats = router.get_stats()
    assert stats["total_channels"] == 3
    assert REDIS_CHANNELS["skill_status"] in stats["channels_handled"]
