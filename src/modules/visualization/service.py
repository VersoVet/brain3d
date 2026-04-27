"""
Brain3D visualization service module.

Handles 3D visualization data aggregation, state management,
and real-time updates via WebSocket and Redis.
"""

from typing import Any, Dict

from src.state_manager import StateManager


class VisualizationService:
    """Service for managing 3D visualization state and updates."""

    def __init__(self, state_manager: StateManager) -> None:
        """Initialize visualization service.

        Args:
            state_manager: State manager instance for data aggregation.
        """
        self.state_manager = state_manager

    async def get_visualization_state(self) -> Dict[str, Any]:
        """Get current visualization state.

        Returns:
            Dictionary containing nodes, links, and metadata for visualization.
        """
        return await self.state_manager.get_full_state()

    async def refresh_state(self) -> None:
        """Force refresh of all visualization data."""
        await self.state_manager.load_and_aggregate_data()
