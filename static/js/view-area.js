/**
 * AreaViewRenderer - Render brain areas with skills in orbit.
 *
 * Layout: 8 brain areas on sphere, skills orbiting each area.
 */

class AreaViewRenderer {
    constructor(scene3d) {
        this.scene3d = scene3d;
        this.areaMeshes = new Map();
        this.skillMeshes = new Map(); // Map<skillName, Mesh>
        this.areaSkills = new Map(); // Map<areaId, [skillNames]>
        this.connectionLines = new Map();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // 8 brain areas on sphere (R=35)
        this.AREA_POSITIONS = {
            prefrontal: { theta: 0, phi: 0.4 },
            limbic: { theta: 1.0, phi: 0.7 },
            cerebellum: { theta: 3.14, phi: 0.5 },
            brainstem: { theta: 3.14, phi: 1.4 },
            'aire-visuelle': { theta: 2.0, phi: 1.0 },
            'aire-motrice': { theta: 4.7, phi: 0.5 },
            'aire-auditive': { theta: 5.5, phi: 1.0 },
            external: { theta: 0.5, phi: 1.5 },
        };
    }

    /**
     * Initialize from state.
     *
     * Args:
     *     state: NetworkState
     */
    init(state) {
        this._buildLayout(state);
    }

    /**
     * Dispose all resources.
     */
    dispose() {
        this.areaMeshes.forEach((mesh) => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.skillMeshes.forEach((mesh) => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.connectionLines.forEach((line) => {
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        });
        this.areaMeshes.clear();
        this.skillMeshes.clear();
        this.areaSkills.clear();
        this.connectionLines.clear();
    }

    /**
     * Build layout with areas and skills.
     *
     * Args:
     *     state: NetworkState
     */
    _buildLayout(state) {
        // Organize skills by area
        const skillsByArea = new Map();
        state.skills.forEach((skill) => {
            const areaId = skill.brain_area;
            if (!skillsByArea.has(areaId)) {
                skillsByArea.set(areaId, []);
            }
            skillsByArea.get(areaId).push(skill);
        });

        // Create areas
        const R = 35;
        Object.entries(this.AREA_POSITIONS).forEach(([areaId, { theta, phi }]) => {
            // Convert to cartesian
            const x = R * Math.sin(phi) * Math.cos(theta);
            const y = R * Math.cos(phi);
            const z = R * Math.sin(phi) * Math.sin(theta);
            const pos = new THREE.Vector3(x, y, z);

            // Find area data
            const areaData = state.areas.find((a) => a.id === areaId);
            const skills = skillsByArea.get(areaId) || [];

            // Create area mesh
            const mesh = this._createAreaMesh(areaData || { id: areaId, status: 'UP' }, skills);
            mesh.position.copy(pos);
            this.scene3d.machinesGroup.add(mesh);
            this.areaMeshes.set(areaId, mesh);
            this.areaSkills.set(areaId, skills);

            // Create skills in orbit
            this._createSkillOrbits(areaId, pos, skills);
        });
    }

    /**
     * Create area mesh.
     *
     * Args:
     *     area: Area object or {id, status}
     *     skills: skill array
     *
     * Returns:
     *     THREE.Mesh
     */
    _createAreaMesh(area, skills) {
        const geometry = new THREE.SphereGeometry(4, 32, 32);
        const status = this._computeAreaStatus(skills);
        const color = this._getStatusColor(status);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.4,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            nodeType: 'area',
            areaId: area.id,
            status: status,
        };

        return mesh;
    }

    /**
     * Create skills in orbit around area.
     *
     * Args:
     *     areaId: area ID
     *     areaPos: Vector3 of area center
     *     skills: skill array
     */
    _createSkillOrbits(areaId, areaPos, skills) {
        if (!skills || skills.length === 0) return;

        skills.forEach((skill, index) => {
            const numSkills = skills.length;
            const angle = (index / numSkills) * Math.PI * 2;

            // Orbital plane: perpendicular to areaPos direction
            const normal = areaPos.clone().normalize();
            let up = new THREE.Vector3(0, 1, 0);
            if (Math.abs(normal.dot(up)) > 0.9) {
                up = new THREE.Vector3(1, 0, 0);
            }
            const right = new THREE.Vector3().crossVectors(up, normal).normalize();
            up = new THREE.Vector3().crossVectors(normal, right).normalize();

            const orbitRadius = 8;
            const skillPos = new THREE.Vector3();
            skillPos
                .copy(right)
                .multiplyScalar(Math.cos(angle) * orbitRadius)
                .add(new THREE.Vector3().copy(up).multiplyScalar(Math.sin(angle) * orbitRadius))
                .add(areaPos);

            const mesh = this._createSkillMesh(skill);
            mesh.position.copy(skillPos);
            mesh.userData = {
                nodeType: 'skill',
                skillName: skill.name,
                areaId: areaId,
                status: skill.status,
            };
            this.scene3d.machinesGroup.add(mesh);
            this.skillMeshes.set(skill.name, mesh);

            // Connection line
            const line = this._createConnectionLine(areaPos, skillPos);
            this.scene3d.connectionsGroup.add(line);
            this.connectionLines.set(`${areaId}:${skill.name}`, line);
        });
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
        const geometry = new THREE.SphereGeometry(0.7, 8, 8);
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
        const material = new THREE.LineBasicMaterial({ color: 0x444444, opacity: 0.15 });
        return new THREE.Line(geometry, material);
    }

    /**
     * Compute area status from skills.
     *
     * Args:
     *     skills: skill array
     *
     * Returns:
     *     status string
     */
    _computeAreaStatus(skills) {
        if (!skills || skills.length === 0) return 'DOWN';

        if (skills.some((s) => s.status === 'ERROR')) return 'ERROR';
        if (skills.some((s) => s.status === 'WORKING')) return 'WORKING';
        if (skills.every((s) => s.status === 'UP')) return 'UP';
        return 'DOWN';
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
        if (data.target === 'skill') {
            const mesh = this.skillMeshes.get(data.id);
            if (mesh) {
                const color = this._getStatusColor(data.status);
                mesh.material.color.setHex(color);
                mesh.material.emissive.setHex(color);

                // Recalculate area status
                const areaId = mesh.userData.areaId;
                const skills = this.areaSkills.get(areaId) || [];
                const skillData = skills.find((s) => s.name === data.id);
                if (skillData) {
                    skillData.status = data.status;
                    const areaStatus = this._computeAreaStatus(skills);
                    const areaMesh = this.areaMeshes.get(areaId);
                    if (areaMesh) {
                        const color = this._getStatusColor(areaStatus);
                        areaMesh.material.color.setHex(color);
                        areaMesh.material.emissive.setHex(color);
                    }
                }
            }
        }
    }

    /**
     * Handle Redis event.
     *
     * Args:
     *     data: {event_type, node, data}
     */
    handleRedisEvent(data) {
        // No animation for area view
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
            if (obj.userData.nodeType === 'area') {
                const areaId = obj.userData.areaId;
                const skills = this.areaSkills.get(areaId) || [];
                window.ui?.showAreaInfo({ id: areaId, name: areaId }, skills);
            } else if (obj.userData.nodeType === 'skill') {
                const skills = this.areaSkills.get(obj.userData.areaId) || [];
                const skill = skills.find((s) => s.name === obj.userData.skillName);
                if (skill) {
                    window.ui?.showSkillInfo(skill);
                }
            }
        }
    }
}
