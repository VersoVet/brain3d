/**
 * Brain3D - Connection Lines (Elastic links between machines)
 */

class ConnectionRenderer {
    constructor(scene) {
        this.scene = scene;
        this.lines = new Map(); // connectionId -> line
    }

    createConnection(fromId, toId, options = {}) {
        const connectionId = `${fromId}-${toId}`;

        // Check if already exists
        if (this.lines.has(connectionId)) {
            return this.lines.get(connectionId);
        }

        const fromMesh = machineRenderer?.getMesh(fromId);
        const toMesh = machineRenderer?.getMesh(toId);

        if (!fromMesh || !toMesh) return null;

        // Create line geometry
        const points = [
            fromMesh.position.clone(),
            toMesh.position.clone(),
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Material based on connection type
        const color = options.color || 0x00d4aa;
        const dashed = options.dashed || false;

        let material;
        if (dashed) {
            material = new THREE.LineDashedMaterial({
                color: color,
                transparent: true,
                opacity: 0.4,
                dashSize: 1,
                gapSize: 0.5,
            });
        } else {
            material = new THREE.LineBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.6,
            });
        }

        const line = new THREE.Line(geometry, material);
        line.name = connectionId;
        line.userData = {
            fromId,
            toId,
            type: options.type || 'default',
        };

        if (dashed) {
            line.computeLineDistances();
        }

        this.lines.set(connectionId, line);
        this.scene.addConnection(line);

        return line;
    }

    updateConnection(connectionId) {
        const line = this.lines.get(connectionId);
        if (!line) return;

        const { fromId, toId } = line.userData;
        const fromMesh = machineRenderer?.getMesh(fromId);
        const toMesh = machineRenderer?.getMesh(toId);

        if (!fromMesh || !toMesh) return;

        // Update line positions
        const positions = line.geometry.attributes.position.array;
        positions[0] = fromMesh.position.x;
        positions[1] = fromMesh.position.y;
        positions[2] = fromMesh.position.z;
        positions[3] = toMesh.position.x;
        positions[4] = toMesh.position.y;
        positions[5] = toMesh.position.z;

        line.geometry.attributes.position.needsUpdate = true;

        // Recompute dashed lines
        if (line.material.dashSize) {
            line.computeLineDistances();
        }
    }

    updateAllConnections() {
        this.lines.forEach((line, connectionId) => {
            this.updateConnection(connectionId);
        });
    }

    removeConnection(connectionId) {
        const line = this.lines.get(connectionId);
        if (line) {
            this.scene.removeConnection(line);
            this.lines.delete(connectionId);
        }
    }

    clear() {
        this.lines.forEach((line) => {
            this.scene.removeConnection(line);
        });
        this.lines.clear();
    }

    // Create connections from machines to core
    createAllConnections(machines) {
        this.clear();

        // Find core node
        const coreNode = machines.find(m => m.machine_type === 'core');
        if (!coreNode) return;

        machines.forEach(machine => {
            if (machine.node_id === coreNode.node_id) return;

            // Connection style based on type
            const isNetwork = machine.machine_type === 'network';
            const isForge = machine.machine_type === 'forge';

            this.createConnection(machine.node_id, coreNode.node_id, {
                dashed: isNetwork,
                color: isForge ? 0xaa44ff : (isNetwork ? 0x4488ff : 0x00d4aa),
                type: machine.machine_type,
            });
        });
    }
}

// Global instance (created in app.js)
let connectionRenderer = null;
