"""Enrichissement des machines avec les metadonnees overlay.yaml."""

import logging
from pathlib import Path
from typing import Any

import yaml

from src.config import OVERLAY_PATH
from src.models import Machine

logger = logging.getLogger(__name__)


class OverlayEnricher:
    """Charge et applique les metadonnees overlay.yaml aux machines."""

    def __init__(self, overlay_path: str = OVERLAY_PATH):
        """Initialize OverlayEnricher.

        Args:
            overlay_path: Path to the overlay.yaml file.
        """
        self._path = Path(overlay_path)
        self._devices: dict[str, dict[str, Any]] = {}
        self._loaded = False

    async def load(self) -> bool:
        """Charge le fichier overlay.yaml.

        Returns:
            True si chargement reussi, False sinon.
        """
        try:
            if not self._path.exists():
                logger.warning(f"Overlay file not found: {self._path}")
                return False

            content = self._path.read_text(encoding="utf-8")
            data = yaml.safe_load(content)
            self._devices = data.get("devices", {})
            self._loaded = True
            logger.info(
                f"Overlay loaded: {len(self._devices)} devices from {self._path}"
            )
            return True
        except Exception as e:
            logger.warning(f"Overlay unavailable ({self._path}): {e}")
            return False

    def enrich_machine(self, machine: Machine) -> Machine:
        """Enrichit une machine avec les donnees overlay.

        Args:
            machine: Machine a enrichir.

        Returns:
            Machine enrichie avec capabilities, services, actions, specs.
        """
        if not self._loaded:
            return machine

        device_data = self._find_device(machine.hostname)
        if not device_data:
            return machine

        # WoL
        wol = device_data.get("wol", {})
        if wol.get("enabled"):
            machine.wol_enabled = True
        if wol.get("mac") and not machine.mac:
            machine.mac = wol["mac"]

        # Capabilities
        caps = device_data.get("capabilities", [])
        if caps:
            machine.capabilities = caps

        # Services
        services = device_data.get("services", [])
        if services:
            machine.services = services

        # Actions
        actions = device_data.get("actions", {})
        if actions:
            machine.actions = actions

        # Specs
        specs = device_data.get("specs", {})
        if specs:
            machine.specs = specs

        return machine

    def _find_device(self, hostname: str) -> dict[str, Any] | None:
        """Trouve un device dans l'overlay par hostname.

        Args:
            hostname: Hostname de la machine.

        Returns:
            Donnees overlay du device ou None.
        """
        # Exact match
        if hostname in self._devices:
            return self._devices[hostname]

        # Case-insensitive match
        hostname_lower = hostname.lower()
        for name, data in self._devices.items():
            if name.lower() == hostname_lower:
                return data
            # Match par hostname dans les donnees
            if data.get("hostname", "").lower() == hostname_lower:
                return data

        return None

    def get_capabilities(self, hostname: str) -> list[str]:
        """Retourne les capabilities d'un device.

        Args:
            hostname: Hostname de la machine.

        Returns:
            Liste des capabilities.
        """
        device = self._find_device(hostname)
        if device:
            return device.get("capabilities", [])
        return []

    def get_services(self, hostname: str) -> list[dict[str, Any]]:
        """Retourne les services declares d'un device.

        Args:
            hostname: Hostname de la machine.

        Returns:
            Liste des services avec name, port, url.
        """
        device = self._find_device(hostname)
        if device:
            return device.get("services", [])
        return []

    @property
    def is_loaded(self) -> bool:
        """Verifie si l'overlay est charge."""
        return self._loaded

    @property
    def device_count(self) -> int:
        """Nombre de devices dans l'overlay."""
        return len(self._devices)
