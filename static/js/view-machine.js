/**
 * MachineViewRenderer - Render machines with skills as satellites.
 *
 * Layout: Machines in spiral, skills in orbit around each machine.
 */

class MachineViewRenderer {
    constructor(scene3d) {
        this.scene3d = scene3d;
        this.machineMeshes = new Map();
        this.skillMeshes = new Map(); // Map<nodeId, Map<skillName, Mesh>>
        this.connectionLines = new Map();
        this.orbitGroups = new Map();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    /**
     * Initialize from state.
     *
     * Args:
     *     state: NetworkState
     */
    init(state) {
        this._buildLayout(state.machines, state.skills);
    }

    /**
     * Dispose all resources.
     */
    dispose() {
        this.machineMeshes.forEach((mesh) => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach((m) => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        });
        this.skillMeshes.forEach((skillMap) => {
            skillMap.forEach((mesh) => {
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            });
        });
        this.connectionLines.forEach((line) => {
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        });
        this.machineMeshes.clear();
        this.skillMeshes.clear();
        this.connectionLines.clear();
        this.orbitGroups.clear();
    }

    /**
     * Build layout with machines and skills.
     *
     * Args:
     *     machines: list of Machine objects
     *     skills: list of Skill objects
     */
    _buildLayout(machines, skills) {
        // Create skill lookup by name
        const skillMap = new Map();
        skills.forEach((skill) => {
            skillMap.set(skill.name, skill);
        });

        // Position machines in spiral
        const machinePositions = new Map();
        machines.forEach((machine, index) => {
            const radius = 15 + Math.floor(index / 6) * 15;
            const angle = ((index % 6) / 6) * Math.PI * 2;
            const pos = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
            machinePositions.set(machine.node_id, pos);

            // Create machine mesh
            const mesh = this._createMachineMesh(machine);
            mesh.position.copy(pos);
            this.scene3d.machinesGroup.add(mesh);
            this.machineMeshes.set(machine.node_id, mesh);
        });

        // Create skills around machines
        machines.forEach((machine) => {
            const machinePos = machinePositions.get(machine.node_id);
            const machineSkills = new Map();

            if (!machine.skills || machine.skills.length === 0) {
                this.skillMeshes.set(machine.node_id, machineSkills);
                return;
            }

            machine.skills.forEach((skillName, skillIndex) => {
                const skill = skillMap.get(skillName);
                if (!skill) return;

                const numSkills = machine.skills.length;
                const angle = (skillIndex / numSkills) * Math.PI * 2;
                const orbitRadius = 6;
                const skillPos = new THREE.Vector3(
                    machinePos.x + Math.cos(angle) * orbitRadius,
                    0,
                    machinePos.z + Math.sin(angle) * orbitRadius
                );

                const skillMesh = this._createSkillMesh(skill);
                skillMesh.position.copy(skillPos);
                skillMesh.userData = {
                    nodeType: 'skill',
                    skillName: skillName,
                    hostNodeId: machine.node_id,
                    status: skill.status,
                };
                this.scene3d.machinesGroup.add(skillMesh);
                machineSkills.set(skillName, skillMesh);

                // Create connection line
                const line = this._createConnectionLine(machinePos, skillPos);
                this.scene3d.connectionsGroup.add(line);
                this.connectionLines.set(`${machine.node_id}:${skillName}`, line);
            });

            this.skillMeshes.set(machine.node_id, machineSkills);
        });
    }

    /**
     * Create machine mesh.
     *
     * Args:
     *     machine: Machine object
     *
     * Returns:
     *     THREE.Mesh
     */
    _createMachineMesh(machine) {
        let geometry, color;

        if (machine.has_heart) {
            geometry = new THREE.BoxGeometry(3, 3, 3);
        } else {
            geometry = new THREE.SphereGeometry(2, 16, 16);
        }

        color = this._getStatusColor(machine.status);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            wireframe: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            nodeType: 'machine',
            nodeId: machine.node_id,
            hostname: machine.hostname,
            status: machine.status,
        };

        return mesh;
    }

    /**
     * Create skill mesh.
     *
     * Args:
     *     skill: Skill object
     *
     * Returns:
     *     THREE.Mesh
     */
    _createSkillMesh(skill) {
        const geometry = new THREE.SphereGeometry(0.6, 8, 8);
        const color = this._getStatusColor(skill.status);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.2,
        });

        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }

    /**
     * Create connection line.
     *
     * Args:
     *     pos1: Vector3
     *     pos2: Vector3
     *
     * Returns:
     *     THREE.Line
     */
    _createConnectionLine(pos1, pos2) {
        const geometry = new THREE.BufferGeometry();
        geometry.setFromPoints([pos1, pos2]);
        const material = new THREE.LineBasicMaterial({ color: 0x444444, opacity: 0.2 });
        return new THREE.Line(geometry, material);
    }

    /**
     * Get color for status.
     *
     * Args:
     *     status: Status string
     *
     * Returns:
     *     hex color code
     */
    _getStatusColor(status) {
        const colors = {
            UP: 0x00ff88,
            WORKING: 0xff00ff,
            DOWN: 0x555555,
            ERROR: 0xff8800,
            UNKNOWN: 0x666666,
        };
        return colors[status] || colors.UNKNOWN;
    }

    /**
     * Handle status update.
     *
     * Args:
     *     data: {target, id, status}
     */
    handleStatusUpdate(data) {
        if (data.target === 'machine') {
            const mesh = this.machineMeshes.get(data.id);
            if (mesh) {
                const color = this._getStatusColor(data.status);
                mesh.material.color.setHex(color);
                mesh.material.emissive.setHex(color);
            }
        } else if (data.target === 'skill') {
            // Find which machine has this skill
            this.skillMeshes.forEach((skillMap, nodeId) => {
                const skillMesh = skillMap.get(data.id);
                if (skillMesh) {
                    const color = this._getStatusColor(data.status);
                    skillMesh.material.color.setHex(color);
                    skillMesh.material.emissive.setHex(color);
                }
            });
        }
    }

    /**
     * Handle Redis event.
     *
     * Args:
     *     data: {event_type, node, data}
     */
    handleRedisEvent(data) {
        if (data.event_type === 'heartbeat') {
            this._triggerHeartbeatAnim(data.node);
        }
    }

    /**
     * Trigger heartbeat animation.
     *
     * Args:
     *     nodeId: machine node ID
     */
    _triggerHeartbeatAnim(nodeId) {
        const mesh = this.machineMeshes.get(nodeId);
        if (!mesh) return;

        const startTime = Date.now();
        const duration = 400;
        const originalScale = mesh.scale.clone();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Pulse: 1 -> 1.4 -> 1
            const pulse = 1 + Math.sin(progress * Math.PI) * 0.4;
            mesh.scale.copy(originalScale).multiplyScalar(pulse);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                mesh.scale.copy(originalScale);
            }
        };

        animate();
    }

    /**
     * Handle click event - show info only, no camera movement.
     *
     * Args:
     *     raycaster: THREE.Raycaster
     */
    onClick(raycaster) {
        const intersects = raycaster.intersectObjects(this.scene3d.machinesGroup.children, true);

        if (intersects.length > 0) {
            const obj = intersects[0].object;
            if (obj.userData.nodeType === 'machine') {
                window.ui?.showMachineInfo({ node_id: obj.userData.nodeId, hostname: obj.userData.hostname });
            } else if (obj.userData.nodeType === 'skill') {
                const skillData = Array.from(this.skillMeshes.values())
                    .flat()
                    .find(m => m === intersects[0].object);
                if (skillData) {
                    window.ui?.showSkillInfo(
                        { name: obj.userData.skillName, status: obj.userData.status },
                        obj.userData.hostNodeId
                    );
                }
            }
        }
    }
}
