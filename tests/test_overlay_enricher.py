"""Tests for overlay_enricher module."""

import tempfile
from pathlib import Path

import pytest
import yaml

from src.models import Machine
from src.overlay_enricher import OverlayEnricher


@pytest.fixture
def sample_overlay(tmp_path: Path) -> Path:
    """Create a temporary overlay.yaml for testing."""
    data = {
        "devices": {
            "TestServer": {
                "wol": {"enabled": True, "mac": "aa:bb:cc:dd:ee:ff"},
                "capabilities": ["ssh", "docker", "ipmi"],
                "services": [
                    {"name": "web", "port": 8080, "url": "http://10.0.0.1:8080"},
                    {"name": "redis", "port": 6379},
                ],
                "actions": {"shutdown": "ssh user@10.0.0.1 'shutdown -h now'"},
                "specs": {"cpu": "Xeon E5", "ram_mb": 32768},
            },
            "NetworkSwitch": {
                "wol": {"enabled": False},
                "capabilities": ["snmp", "web_ui"],
                "services": [],
            },
        }
    }
    overlay_file = tmp_path / "overlay.yaml"
    overlay_file.write_text(yaml.dump(data))
    return overlay_file


@pytest.mark.asyncio
async def test_load_success(sample_overlay: Path) -> None:
    """Test successful overlay loading."""
    enricher = OverlayEnricher(overlay_path=str(sample_overlay))
    result = await enricher.load()
    assert result is True
    assert enricher.is_loaded is True
    assert enricher.device_count == 2


@pytest.mark.asyncio
async def test_load_missing_file() -> None:
    """Test loading with missing file returns False."""
    enricher = OverlayEnricher(overlay_path="/nonexistent/path.yaml")
    result = await enricher.load()
    assert result is False
    assert enricher.is_loaded is False


@pytest.mark.asyncio
async def test_enrich_machine(sample_overlay: Path) -> None:
    """Test machine enrichment with overlay data."""
    enricher = OverlayEnricher(overlay_path=str(sample_overlay))
    await enricher.load()

    machine = Machine(node_id="test", hostname="TestServer", ip="10.0.0.1")
    enriched = enricher.enrich_machine(machine)

    assert enriched.wol_enabled is True
    assert enriched.mac == "aa:bb:cc:dd:ee:ff"
    assert "ssh" in enriched.capabilities
    assert "docker" in enriched.capabilities
    assert len(enriched.services) == 2
    assert enriched.actions["shutdown"] == "ssh user@10.0.0.1 'shutdown -h now'"
    assert enriched.specs["cpu"] == "Xeon E5"


@pytest.mark.asyncio
async def test_enrich_machine_not_found(sample_overlay: Path) -> None:
    """Test enrichment when machine is not in overlay."""
    enricher = OverlayEnricher(overlay_path=str(sample_overlay))
    await enricher.load()

    machine = Machine(node_id="unknown", hostname="UnknownHost", ip="10.0.0.99")
    enriched = enricher.enrich_machine(machine)

    assert enriched.capabilities == []
    assert enriched.services == []


@pytest.mark.asyncio
async def test_enrich_preserves_existing_mac(sample_overlay: Path) -> None:
    """Test that enrichment does not overwrite existing MAC."""
    enricher = OverlayEnricher(overlay_path=str(sample_overlay))
    await enricher.load()

    machine = Machine(
        node_id="test", hostname="TestServer", ip="10.0.0.1", mac="11:22:33:44:55:66"
    )
    enriched = enricher.enrich_machine(machine)
    assert enriched.mac == "11:22:33:44:55:66"


@pytest.mark.asyncio
async def test_get_capabilities(sample_overlay: Path) -> None:
    """Test get_capabilities method."""
    enricher = OverlayEnricher(overlay_path=str(sample_overlay))
    await enricher.load()

    caps = enricher.get_capabilities("TestServer")
    assert caps == ["ssh", "docker", "ipmi"]

    caps_unknown = enricher.get_capabilities("NoSuchHost")
    assert caps_unknown == []


@pytest.mark.asyncio
async def test_get_services(sample_overlay: Path) -> None:
    """Test get_services method."""
    enricher = OverlayEnricher(overlay_path=str(sample_overlay))
    await enricher.load()

    services = enricher.get_services("TestServer")
    assert len(services) == 2
    assert services[0]["name"] == "web"


@pytest.mark.asyncio
async def test_case_insensitive_match(sample_overlay: Path) -> None:
    """Test case-insensitive hostname matching."""
    enricher = OverlayEnricher(overlay_path=str(sample_overlay))
    await enricher.load()

    caps = enricher.get_capabilities("testserver")
    assert "ssh" in caps
