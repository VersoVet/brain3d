"""Visualization service for Brain3D.

Provides convenience methods for accessing visualization data.
"""

from typing import Any

from src.state_manager import StateManager


class VisualizationService:
    """Service for managing 3D visualization state."""

    def __init__(self, state_manager: StateManager) -> None:
        """Initialize visualization service.

        Args:
            state_manager: State manager for data access.
        """
        self.state_manager = state_manager

    async def get_visualization_state(self) -> dict[str, Any]:
        """Get current visualization state.

        Returns:
            Network state with nodes and links for visualization.
        """
        await self.state_manager.refresh_if_stale()
        state = self.state_manager.get_network_state()
        return state.model_dump(mode="json")

    async def refresh_state(self) -> None:
        """Force refresh of visualization data."""
        await self.state_manager.refresh_all()
