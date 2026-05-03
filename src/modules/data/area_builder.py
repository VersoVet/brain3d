"""Brain area extraction and status computation.

This module handles grouping skills by brain area and computing aggregated status.
"""

from src.models import Area, Skill, Status


def extract_areas(skills: list[Skill]) -> list[Area]:
    """Extract brain areas from skills list.

    Args:
        skills: List of all skills.

    Returns:
        List of Area objects grouped by brain_area.
    """
    areas_dict: dict[str, list[Skill]] = {}

    for skill in skills:
        area_id = skill.brain_area or "external"
        if area_id not in areas_dict:
            areas_dict[area_id] = []
        areas_dict[area_id].append(skill)

    areas = []
    for area_id, area_skills in areas_dict.items():
        area_status = compute_area_status(area_skills)

        area = Area(
            id=area_id,
            name=format_area_name(area_id),
            status=area_status,
            skills=[s.name for s in area_skills],
            total_skills=len(area_skills),
            active_skills=sum(1 for s in area_skills if s.status == Status.UP),
        )
        areas.append(area)

    return areas


def compute_area_status(skills: list[Skill]) -> Status:
    """Compute aggregated status for a brain area (priority: ERROR > WORKING > UP > DOWN).

    Args:
        skills: List of skills in the area.

    Returns:
        Status enum with highest priority.
    """
    if not skills:
        return Status.UNKNOWN

    priority = {
        Status.ERROR: 4,
        Status.WORKING: 3,
        Status.UP: 2,
        Status.DOWN: 1,
        Status.UNKNOWN: 0,
    }

    max_priority = 0
    max_status = Status.UNKNOWN

    for skill in skills:
        p = priority.get(skill.status, 0)
        if p > max_priority:
            max_priority = p
            max_status = skill.status

    return max_status


def format_area_name(area_id: str) -> str:
    """Format brain area name from kebab-case to Title Case.

    Args:
        area_id: Brain area identifier (kebab-case).

    Returns:
        Formatted area name (Title Case).
    """
    return area_id.replace("-", " ").title()
