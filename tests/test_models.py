"""Tests for models module."""

from src.config import MachineType, Status
from src.models import Area, Machine, Metrics, NetworkState, RedisEvent, Skill


def test_machine_defaults() -> None:
    """Test Machine model default values."""
    m = Machine(node_id="test", hostname="test-host", ip="10.0.0.1")
    assert m.status == Status.UNKNOWN
    assert m.machine_type == MachineType.NETWORK
    assert m.capabilities == []
    assert m.services == []
    assert m.actions == {}
    assert m.specs == {}
    assert m.wol_enabled is False


def test_machine_with_overlay_fields() -> None:
    """Test Machine with overlay enrichment fields."""
    m = Machine(
        node_id="soma",
        hostname="OnyxSoma",
        ip="10.0.0.44",
        capabilities=["ssh", "docker"],
        services=[{"name": "redis", "port": 6379}],
        actions={"shutdown": "ssh onyx@10.0.0.44 'sudo shutdown'"},
        specs={"cpu": "Xeon", "ram_mb": 65536},
        wol_enabled=True,
        mac="aa:bb:cc:dd:ee:ff",
    )
    assert m.capabilities == ["ssh", "docker"]
    assert m.services[0]["name"] == "redis"
    assert m.wol_enabled is True


def test_redis_event_with_channel() -> None:
    """Test RedisEvent includes channel field."""
    event = RedisEvent(
        type="heartbeat",
        node="test-node",
        channel="onyx:events",
        data={"cpu": 50},
    )
    assert event.channel == "onyx:events"
    assert event.type == "heartbeat"


def test_redis_event_default_channel() -> None:
    """Test RedisEvent default empty channel."""
    event = RedisEvent(type="test", node="n")
    assert event.channel == ""


def test_skill_model() -> None:
    """Test Skill model creation."""
    s = Skill(name="brain3d", port=8888, brain_area="cerebellum", status=Status.UP)
    assert s.name == "brain3d"
    assert s.status == Status.UP


def test_area_model() -> None:
    """Test Area model creation."""
    a = Area(id="cerebellum", name="Cerebellum", total_skills=5, active_skills=4)
    assert a.total_skills == 5


def test_metrics_defaults() -> None:
    """Test Metrics default values."""
    m = Metrics()
    assert m.cpu_percent == 0.0
    assert m.temp_celsius is None


def test_network_state() -> None:
    """Test NetworkState aggregation."""
    state = NetworkState(
        machines=[Machine(node_id="a", hostname="A", ip="1.1.1.1")],
        skills=[Skill(name="s1", status=Status.UP)],
        total_machines=1,
        total_skills=1,
        skills_up=1,
    )
    assert state.total_machines == 1
    assert state.skills_up == 1
