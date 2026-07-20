"""Tests for stream_reader module."""

import pytest

from src.stream_reader import RedisStreamReader


@pytest.mark.asyncio
async def test_connect_success() -> None:
    """Test successful connection to Redis."""
    reader = RedisStreamReader()
    connected = await reader.connect()
    assert connected is True
    await reader.close()


@pytest.mark.asyncio
async def test_connect_failure() -> None:
    """Test connection failure with bad URL."""
    reader = RedisStreamReader(redis_url="redis://192.0.2.1:9999")
    connected = await reader.connect()
    assert connected is False


@pytest.mark.asyncio
async def test_read_history_not_connected() -> None:
    """Test read_history returns empty when not connected."""
    reader = RedisStreamReader()
    events = await reader.read_history(count=10)
    assert events == []


@pytest.mark.asyncio
async def test_read_history() -> None:
    """Test reading event history from stream."""
    reader = RedisStreamReader()
    await reader.connect()
    events = await reader.read_history(count=10)
    # Stream exists and has events
    assert isinstance(events, list)
    await reader.close()


@pytest.mark.asyncio
async def test_get_stream_info() -> None:
    """Test getting stream info."""
    reader = RedisStreamReader()
    await reader.connect()
    info = await reader.get_stream_info()
    assert info["status"] == "connected"
    assert "length" in info
    await reader.close()


@pytest.mark.asyncio
async def test_get_stream_info_disconnected() -> None:
    """Test stream info when disconnected."""
    reader = RedisStreamReader()
    info = await reader.get_stream_info()
    assert info["status"] == "disconnected"


@pytest.mark.asyncio
async def test_read_since() -> None:
    """Test reading events since a given ID."""
    reader = RedisStreamReader()
    await reader.connect()
    events = await reader.read_since(last_id="0-0", count=5)
    assert isinstance(events, list)
    await reader.close()


@pytest.mark.asyncio
async def test_close_idempotent() -> None:
    """Test close can be called multiple times safely."""
    reader = RedisStreamReader()
    await reader.close()
    await reader.close()
