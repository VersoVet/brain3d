"""Machine data fusion and coherence detection logic.

This module handles merging data from multiple sources (Core, Heart, Network Inventory)
and detecting inconsistencies.
"""

import logging
from typing import Any

from src.models import Incoherence, LocalSkill, Machine, MachineType, Skill, Status

logger = logging.getLogger(__name__)


def build_expected_skills_by_node(
    deploy_matrix: dict[str, Any],
) -> dict[str, list[str]]:
    """Build list of expected skills per node from deployment matrix.

    Args:
        deploy_matrix: Deployment matrix from OnyxCore.

    Returns:
        Dictionary mapping node_id to list of expected skill names.
    """
    expected_by_node: dict[str, list[str]] = {}

    matrix = deploy_matrix.get("matrix", {})

    for skill_id, nodes in matrix.items():
        if not isinstance(nodes, dict):
            continue
        for node_id, deployment in nodes.items():
            if isinstance(deployment, dict) and deployment.get("status") in (
                "installed",
                "running",
            ):
                skill_name = deployment.get("skill_name") or skill_id.split("/")[-1]
                if node_id not in expected_by_node:
                    expected_by_node[node_id] = []
                expected_by_node[node_id].append(skill_name)

    return expected_by_node


def parse_heart_skills(heart_data: dict[str, Any]) -> list[LocalSkill]:
    """Parse skills returned by Heart into LocalSkill models.

    Args:
        heart_data: Raw skill data from Heart HTTP response.

    Returns:
        List of LocalSkill objects.
    """
    skills = []
    for name, info in heart_data.items():
        if isinstance(info, dict):
            skill = LocalSkill(
                name=name,
                status=info.get("status", "unknown"),
                pid=info.get("pid"),
                version=info.get("version", ""),
                brain_area=info.get("brain_area", "external"),
                git_repo=info.get("git_repo", ""),
                git_commit=info.get("git_commit", ""),
            )
            skills.append(skill)
    return skills


def detect_incoherences(
    hostname: str, local_skills: list[LocalSkill], expected_skills: list[str]
) -> list[Incoherence]:
    """Detect inconsistencies between local and expected skills.

    Args:
        hostname: Hostname of the machine.
        local_skills: Skills running locally on Heart.
        expected_skills: Skills expected by Core registry.

    Returns:
        List of Incoherence objects describing mismatches.
    """
    local_names = {s.name for s in local_skills}
    expected_names = set(expected_skills)

    incoherences = [Incoherence(
                type="unexpected_skill",
                skill=name,
                message=f"Skill '{name}' présent sur Heart mais pas dans registre Core",
                severity="warning",
            ) for name in local_names - expected_names]

    incoherences.extend(Incoherence(
                type="missing_skill",
                skill=name,
                message=f"Skill '{name}' attendu par Core mais absent du Heart",
                severity="error",
            ) for name in expected_names - local_names)

    return incoherences


def determine_machine_type(hostname: str, has_heart: bool) -> MachineType:
    """Determine machine type from hostname.

    Args:
        hostname: Hostname of the machine.
        has_heart: Whether machine has a Heart component.

    Returns:
        MachineType enum value.
    """
    hostname_lower = hostname.lower()

    if hostname_lower == "onyxsoma":
        return MachineType.CORE

    if hostname_lower in ("onyxdendrite", "onyx-dendrite"):
        return MachineType.FORGE

    if has_heart:
        return MachineType.HEART

    return MachineType.NETWORK


def _core_skill_to_local(skill: "Skill") -> LocalSkill:
    """Convert a Core Skill to LocalSkill format.

    Args:
        skill: Skill from Core registry.

    Returns:
        LocalSkill with name, status, brain_area from Core data.
    """
    status_val = skill.status.value if hasattr(skill.status, "value") else str(skill.status)
    return LocalSkill(
        name=skill.name,
        status=status_val.lower(),
        version=skill.version,
        brain_area=skill.brain_area,
    )


def merge_machines_with_coherence(
    core_nodes: list[dict[str, Any]],
    network_devices: dict[str, dict[str, Any]],
    heart_skills_by_node: dict[str, Any],
    expected_by_node: dict[str, list[str]],
    parse_datetime: Any,
    skills_by_host_ip: dict[str, list[Any]] | None = None,
) -> list[Machine]:
    """Merge machine data from Core, Heart, and Network Inventory with coherence detection.

    Args:
        core_nodes: Nodes from OnyxCore.
        network_devices: Devices from network inventory.
        heart_skills_by_node: Skills indexed by hostname from Heart queries.
        expected_by_node: Expected skills per node from deployment matrix.
        parse_datetime: Function to parse datetime strings.
        skills_by_host_ip: Skills from Core registry indexed by host IP (fallback).

    Returns:
        List of merged Machine objects.
    """
    machines = []
    seen_ips = set()

    for node in core_nodes:
        ip = node.get("ip", "")
        hostname = node.get("hostname", "")
        seen_ips.add(ip)

        device_info = network_devices.get(hostname, {})

        machine_type = determine_machine_type(hostname, has_heart=True)

        heart_status = node.get("heart_status") or "unknown"
        if heart_status == "up":
            status = Status.UP
        elif heart_status == "down":
            status = Status.DOWN
        else:
            # Derive from Core skills when Heart status not available
            core_host_skills = (skills_by_host_ip or {}).get(ip, [])
            if any(getattr(s.status, "value", s.status) in ("UP", "WORKING") for s in core_host_skills):
                status = Status.UP
            elif core_host_skills:
                status = Status.DOWN
            else:
                status = Status.UNKNOWN

        heart_data = heart_skills_by_node.get(hostname, {})
        if isinstance(heart_data, Exception):
            heart_data = {}
            logger.warning(f"Erreur Heart {hostname}: {heart_data}")

        local_skills = parse_heart_skills(heart_data)

        # Fallback: use Core registry skills when Heart is not reachable
        if not local_skills and skills_by_host_ip:
            core_skills_for_node = skills_by_host_ip.get(ip, [])
            local_skills = [_core_skill_to_local(s) for s in core_skills_for_node]
            if local_skills:
                logger.info(f"{hostname}: {len(local_skills)} skills from Core registry (Heart not reachable)")

        expected_skills = expected_by_node.get(ip, []) or expected_by_node.get(
            hostname, []
        )

        incoherences = detect_incoherences(hostname, local_skills, expected_skills)
        is_coherent = len(incoherences) == 0

        machine = Machine(
            node_id=hostname,
            hostname=hostname,
            ip=ip,
            mac=device_info.get("mac"),
            machine_type=machine_type,
            status=status,
            has_heart=True,
            heart_version=node.get("heart_version"),
            heart_status=heart_status,
            platform=device_info.get("os") or "unknown",
            skills_count=node.get("skills_count", 0),
            skills_installed=node.get("skills_installed", 0),
            device_type=device_info.get("type") or "server",
            role=device_info.get("role") or "",
            wol_enabled=device_info.get("wol_enabled", False),
            managed=device_info.get("managed", True),
            last_seen=parse_datetime(node.get("last_seen")),
            tags=node.get("tags", []),
            local_skills=local_skills,
            expected_skills=expected_skills,
            incoherences=incoherences,
            is_coherent=is_coherent,
        )
        machines.append(machine)

        if not is_coherent:
            logger.info(
                f"Incohérences détectées sur {hostname}: {[i.message for i in incoherences]}"
            )

    for name, device in network_devices.items():
        ip = device.get("ip", "")
        if ip in seen_ips:
            continue

        machine = Machine(
            node_id=name,
            hostname=name,
            ip=ip,
            mac=device.get("mac"),
            machine_type=MachineType.NETWORK,
            status=Status.UP,
            has_heart=False,
            platform=device.get("os") or "network",
            device_type=device.get("type", "network"),
            role=device.get("role", ""),
            wol_enabled=device.get("wol_enabled", False),
            managed=device.get("managed", False),
        )
        machines.append(machine)

    logger.info(f"Total machines fusionnées: {len(machines)}")
    return machines
