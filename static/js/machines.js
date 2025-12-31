/**
 * Brain3D - Machine Rendering (Cubes, Spheres, Dodecahedron, Icosahedron)
 */

class MachineRenderer {
    constructor(scene) {
        this.scene = scene;
        this.meshes = new Map(); // nodeId -> mesh
    }

    createMachine(machine) {
        const type = machine.machine_type || 'network';
        const status = machine.status || 'UNKNOWN';

        let geometry, material, mesh;

        // Create geometry based on type
        switch (type) {
            case 'core':
                geometry = new THREE.DodecahedronGeometry(CONFIG.SIZES.core);
                break;
            case 'forge':
                geometry = new THREE.IcosahedronGeometry(CONFIG.SIZES.forge);
                break;
            case 'heart':
                geometry = new THREE.BoxGeometry(
                    CONFIG.SIZES.machine,
                    CONFIG.SIZES.machine,
                    CONFIG.SIZES.machine
                );
                break;
            case 'network':
            default:
                geometry = new THREE.SphereGeometry(CONFIG.SIZES.machine * 0.8, 32, 32);
                break;
        }

        // Create material
        const color = getMachineColor(type, status);
        material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: status === 'DOWN' ? 0.5 : 1,
        });

        // Create mesh
        mesh = new THREE.Mesh(geometry, material);
        mesh.name = machine.node_id;
        mesh.userData = {
            nodeId: machine.node_id,
            type: type,
            status: status,
            hostname: machine.hostname,
            ip: machine.ip,
            hasHeart: machine.has_heart,
            machineData: machine,
        };

        // Add glow effect for special nodes
        if (type === 'core' || type === 'forge') {
            this._addGlow(mesh, color);
        }

        // Store and add to scene
        this.meshes.set(machine.node_id, mesh);
        this.scene.addMachine(mesh);

        // Add to physics
        const physicsNode = physics.addNode(machine.node_id, {
            type: type,
            fixed: type === 'core',
            position: machine.position,
        });

        // Set initial position
        mesh.position.set(
            physicsNode.position.x,
            physicsNode.position.y,
            physicsNode.position.z
        );

        return mesh;
    }

    _addGlow(mesh, color) {
        const glowGeometry = mesh.geometry.clone();
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
        });

        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.scale.multiplyScalar(1.3);
        mesh.add(glow);
    }

    updateMachine(nodeId, updates) {
        const mesh = this.meshes.get(nodeId);
        if (!mesh) return;

        // Update status/color
        if (updates.status) {
            mesh.userData.status = updates.status;
            const color = getMachineColor(mesh.userData.type, updates.status);

            mesh.material.color.setHex(color);
            mesh.material.emissive.setHex(color);
            mesh.material.opacity = updates.status === 'DOWN' ? 0.5 : 1;
        }

        // Update position from physics
        const physNode = physics.getNode(nodeId);
        if (physNode) {
            mesh.position.set(
                physNode.position.x,
                physNode.position.y,
                physNode.position.z
            );
        }
    }

    removeMachine(nodeId) {
        const mesh = this.meshes.get(nodeId);
        if (mesh) {
            this.scene.removeMachine(mesh);
            this.meshes.delete(nodeId);
            physics.removeNode(nodeId);
        }
    }

    getMesh(nodeId) {
        return this.meshes.get(nodeId);
    }

    updateAllPositions() {
        this.meshes.forEach((mesh, nodeId) => {
            const physNode = physics.getNode(nodeId);
            if (physNode) {
                mesh.position.set(
                    physNode.position.x,
                    physNode.position.y,
                    physNode.position.z
                );
            }
        });
    }

    clear() {
        this.meshes.forEach((mesh, nodeId) => {
            this.scene.removeMachine(mesh);
        });
        this.meshes.clear();
        physics.clear();
    }

    // Create all machines from state
    createAllMachines(machines) {
        console.log('MachineRenderer.createAllMachines called with', machines.length, 'machines');
        this.clear();

        // Sort: core first, then forge, then hearts, then network
        const sorted = [...machines].sort((a, b) => {
            const order = { core: 0, forge: 1, heart: 2, network: 3 };
            return (order[a.machine_type] || 3) - (order[b.machine_type] || 3);
        });

        sorted.forEach(machine => {
            try {
                console.log('Creating machine:', machine.hostname, 'type:', machine.machine_type);
                this.createMachine(machine);
                console.log('  -> OK, mesh added');
            } catch (e) {
                console.error('  -> ERROR creating machine:', machine.hostname, e);
            }
        });

        console.log('Total meshes created:', this.meshes.size);
        // Start physics
        physics.start();
    }
}

// Global instance (created in app.js)
let machineRenderer = null;
