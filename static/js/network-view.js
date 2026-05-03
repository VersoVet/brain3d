/**
 * NetworkView - Réseau en cercle fixe avec Core au centre.
 *
 * Layout: Core (0,0,0) au centre, machines en cercle autour.
 * Clic sur machine → panel latéral avec skills déployés.
 */

class NetworkView {
    constructor(scene3d) {
        this.scene3d = scene3d;
        this.meshes = new Map(); // nodeId → Mesh
        this.lines = new Map();  // nodeId → Line
        this.selectedId = null;
        this.currentMachines = [];
    }

    /**
     * Initialize view from network state.
     *
     * Args:
     *     state: NetworkState with machines and skills
     */
    init(state) {
        this.dispose();
        this.currentMachines = state.machines || [];
        this._buildLayout(this.currentMachines);
    }

    /**
     * Dispose all Three.js objects.
     */
    dispose() {
        this.meshes.forEach((mesh) => {
            this.scene3d.machinesGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.lines.forEach((line) => {
            this.scene3d.connectionsGroup.remove(line);
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        });
        this.meshes.clear();
        this.lines.clear();
        this.selectedId = null;
    }

    /**
     * Build circle layout: Core at center, others around.
     *
     * Args:
     *     machines: Array of Machine objects
     */
    _buildLayout(machines) {
        const core = machines.find((m) => m.machine_type === 'core');
        const others = machines.filter((m) => m.machine_type !== 'core');

        // Core at center
        if (core) {
            const mesh = this._createCoreMesh(core);
            mesh.position.set(0, 0, 0);
            this.scene3d.machinesGroup.add(mesh);
            this.meshes.set(core.node_id, mesh);
        }

        // Radius based on count
        const count = others.length;
        const radius = count <= 6 ? 28 : count <= 12 ? 35 : 45;

        others.forEach((machine, i) => {
            const angle = (i / count) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            const mesh = this._createMachineMesh(machine);
            mesh.position.set(x, 0, z);
            this.scene3d.machinesGroup.add(mesh);
            this.meshes.set(machine.node_id, mesh);

            // Line from core to machine
            if (core) {
                const line = this._createLine(
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(x, 0, z)
                );
                this.scene3d.connectionsGroup.add(line);
                this.lines.set(machine.node_id, line);
            }
        });
    }

    /**
     * Create Core mesh (IcosahedronGeometry, cyan).
     *
     * Args:
     *     machine: Machine object
     *
     * Returns:
     *     THREE.Mesh
     */
    _createCoreMesh(machine) {
        const geometry = new THREE.IcosahedronGeometry(5, 0);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00d4aa,
            emissive: 0x00d4aa,
            emissiveIntensity: 0.5,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            nodeId: machine.node_id,
            hostname: machine.hostname,
            ip: machine.ip,
            machine_type: machine.machine_type,
            local_skills: machine.local_skills || [],
            status: machine.status,
            isCore: true,
        };
        return mesh;
    }

    /**
     * Create machine mesh (Sphere, colored by skill status).
     *
     * Args:
     *     machine: Machine object
     *
     * Returns:
     *     THREE.Mesh
     */
    _createMachineMesh(machine) {
        const hasSkills = (machine.local_skills || []).length > 0;
        const size = hasSkills ? 2.5 : 1.8;
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const color = this._getMachineColor(machine);
        const opacity = hasSkills ? 1.0 : 0.6;

        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: hasSkills ? 0.35 : 0.15,
            transparent: !hasSkills,
            opacity: opacity,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            nodeId: machine.node_id,
            hostname: machine.hostname,
            ip: machine.ip,
            machine_type: machine.machine_type,
            local_skills: machine.local_skills || [],
            status: machine.status,
            isCore: false,
        };
        return mesh;
    }

    /**
     * Create connection line between two points.
     *
     * Args:
     *     from: THREE.Vector3
     *     to: THREE.Vector3
     *
     * Returns:
     *     THREE.Line
     */
    _createLine(from, to) {
        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        const material = new THREE.LineBasicMaterial({
            color: 0x334466,
            opacity: 0.2,
            transparent: true,
        });
        return new THREE.Line(geometry, material);
    }

    /**
     * Get hex color for machine based on its local skill statuses.
     *
     * Args:
     *     machine: Machine object
     *
     * Returns:
     *     Hex color number
     */
    _getMachineColor(machine) {
        const skills = machine.local_skills || [];
        if (skills.length === 0) return 0x333344;

        const statuses = skills.map((s) => this._normalizeStatus(s.status));
        if (statuses.includes('ERROR'))   return 0xff8800;
        if (statuses.includes('WORKING')) return 0xff00ff;
        if (statuses.includes('UP'))      return 0x00ff88;
        return 0x334455;
    }

    /**
     * Normalize Heart/Core status to canonical form.
     *
     * Args:
     *     status: Status string (running, stopped, error, UP, DOWN, etc.)
     *
     * Returns:
     *     Normalized status string (UP, DOWN, ERROR, WORKING)
     */
    _normalizeStatus(status) {
        const map = {
            running: 'UP',
            loaded: 'UP',
            stopped: 'DOWN',
            error: 'ERROR',
            unknown: 'DOWN',
        };
        return map[status] || status;
    }

    /**
     * Get hex color for a canonical status string.
     *
     * Args:
     *     status: Canonical status string
     *
     * Returns:
     *     Hex color number
     */
    _statusToColor(status) {
        const colors = {
            UP: 0x00ff88,
            WORKING: 0xff00ff,
            DOWN: 0x555555,
            ERROR: 0xff8800,
        };
        return colors[status] || 0x666666;
    }

    /**
     * Handle status update from WebSocket.
     *
     * Args:
     *     data: {target, id, status} — target is 'skill' or 'machine'
     */
    handleStatusUpdate(data) {
        if (data.target === 'skill') {
            // Find which machine hosts this skill and update its color
            this.currentMachines.forEach((machine) => {
                const skill = (machine.local_skills || []).find(
                    (s) => s.name === data.id
                );
                if (skill) {
                    skill.status = data.status;
                    const mesh = this.meshes.get(machine.node_id);
                    if (mesh) {
                        const color = this._getMachineColor(machine);
                        mesh.material.color.setHex(color);
                        mesh.material.emissive.setHex(color);
                    }
                }
            });
        } else if (data.target === 'machine') {
            const mesh = this.meshes.get(data.id);
            if (mesh) {
                const color = this._statusToColor(data.status);
                mesh.material.color.setHex(color);
                mesh.material.emissive.setHex(color);
            }
        }
    }

    /**
     * Handle Redis event from WebSocket.
     *
     * Args:
     *     data: {event_type, node, data}
     */
    handleRedisEvent(data) {
        if (data.event_type === 'heartbeat') {
            this._pulseNode(data.node);
        }
    }

    /**
     * Animate a node with scale pulse (heartbeat effect).
     *
     * Args:
     *     nodeId: Machine node ID
     */
    _pulseNode(nodeId) {
        const mesh = this.meshes.get(nodeId);
        if (!mesh) return;

        const startTime = Date.now();
        const duration = 400;
        const originalScale = mesh.scale.clone();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const pulse = 1 + Math.sin(progress * Math.PI) * 0.35;
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
     * Handle canvas click — show skills panel.
     *
     * Args:
     *     event: MouseEvent or {clientX, clientY}
     */
    onClick(event) {
        const obj = this.scene3d.getIntersectedObject(event);

        if (obj && obj.userData && obj.userData.nodeId) {
            this.setSelected(obj.userData.nodeId);
            window.ui?.showMachineSkills(obj.userData);
        } else {
            this.clearSelected();
            window.ui?.hideInfoPanel();
        }
    }

    /**
     * Highlight selected machine.
     *
     * Args:
     *     nodeId: Machine node ID
     */
    setSelected(nodeId) {
        if (this.selectedId) {
            const prev = this.meshes.get(this.selectedId);
            if (prev) prev.material.emissiveIntensity = 0.35;
        }
        this.selectedId = nodeId;
        const mesh = this.meshes.get(nodeId);
        if (mesh) mesh.material.emissiveIntensity = 0.75;
    }

    /**
     * Clear current selection.
     */
    clearSelected() {
        if (this.selectedId) {
            const mesh = this.meshes.get(this.selectedId);
            if (mesh) mesh.material.emissiveIntensity = 0.35;
        }
        this.selectedId = null;
    }
}

// Global instance
let networkView = null;
