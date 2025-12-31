/**
 * Brain3D - Force-Directed Physics Layout
 */

class PhysicsEngine {
    constructor() {
        this.nodes = new Map(); // nodeId -> {position, velocity, mass, fixed}
        this.running = false;
        this.centerNode = null; // Core node (fixed at center)
    }

    addNode(nodeId, options = {}) {
        // Check if position is meaningful (not at origin)
        const hasValidPosition = options.position &&
            (options.position.x !== 0 || options.position.y !== 0 || options.position.z !== 0);

        const node = {
            position: hasValidPosition ? options.position : this._randomPosition(),
            velocity: { x: 0, y: 0, z: 0 },
            mass: options.mass || 1,
            fixed: options.fixed || false,
            type: options.type || 'heart',
            connections: options.connections || [],
        };

        this.nodes.set(nodeId, node);

        // Mark center node
        if (options.type === 'core') {
            this.centerNode = nodeId;
            node.fixed = true;
            node.position = { x: 0, y: 0, z: 0 };
        }

        return node;
    }

    removeNode(nodeId) {
        this.nodes.delete(nodeId);
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    _randomPosition() {
        const radius = 30 + Math.random() * 20;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI - Math.PI / 2;

        return {
            x: radius * Math.cos(theta) * Math.cos(phi),
            y: (Math.random() - 0.5) * 10, // Slight Y variation
            z: radius * Math.sin(theta) * Math.cos(phi),
        };
    }

    update() {
        if (!this.running) return;

        const nodes = Array.from(this.nodes.entries());
        const forces = new Map();

        // Initialize forces
        nodes.forEach(([id]) => {
            forces.set(id, { x: 0, y: 0, z: 0 });
        });

        // Calculate repulsion forces (all pairs)
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const [id1, node1] = nodes[i];
                const [id2, node2] = nodes[j];

                const dx = node2.position.x - node1.position.x;
                const dy = node2.position.y - node1.position.y;
                const dz = node2.position.z - node1.position.z;

                const distSq = dx * dx + dy * dy + dz * dz + 0.1;
                const dist = Math.sqrt(distSq);

                // Repulsion force (inverse square)
                const repulsion = CONFIG.PHYSICS.repulsion / distSq;

                const fx = (dx / dist) * repulsion;
                const fy = (dy / dist) * repulsion;
                const fz = (dz / dist) * repulsion;

                const f1 = forces.get(id1);
                const f2 = forces.get(id2);

                f1.x -= fx;
                f1.y -= fy;
                f1.z -= fz;

                f2.x += fx;
                f2.y += fy;
                f2.z += fz;
            }
        }

        // Calculate attraction forces (to center/core)
        nodes.forEach(([id, node]) => {
            if (node.fixed) return;

            const f = forces.get(id);

            // Attraction to center
            const centerForce = CONFIG.PHYSICS.centerForce;
            f.x -= node.position.x * centerForce;
            f.y -= node.position.y * centerForce * 2; // Stronger Y centering
            f.z -= node.position.z * centerForce;

            // Attraction to connected nodes (if core exists)
            if (this.centerNode && node.type !== 'network') {
                const coreNode = this.nodes.get(this.centerNode);
                if (coreNode) {
                    const dx = coreNode.position.x - node.position.x;
                    const dy = coreNode.position.y - node.position.y;
                    const dz = coreNode.position.z - node.position.z;

                    f.x += dx * CONFIG.PHYSICS.attraction;
                    f.y += dy * CONFIG.PHYSICS.attraction;
                    f.z += dz * CONFIG.PHYSICS.attraction;
                }
            }
        });

        // Apply forces and update positions
        nodes.forEach(([id, node]) => {
            if (node.fixed) return;

            const f = forces.get(id);

            // Update velocity
            node.velocity.x = (node.velocity.x + f.x) * CONFIG.PHYSICS.damping;
            node.velocity.y = (node.velocity.y + f.y) * CONFIG.PHYSICS.damping;
            node.velocity.z = (node.velocity.z + f.z) * CONFIG.PHYSICS.damping;

            // Clamp velocity
            const maxV = CONFIG.PHYSICS.maxVelocity;
            node.velocity.x = Math.max(-maxV, Math.min(maxV, node.velocity.x));
            node.velocity.y = Math.max(-maxV, Math.min(maxV, node.velocity.y));
            node.velocity.z = Math.max(-maxV, Math.min(maxV, node.velocity.z));

            // Update position
            node.position.x += node.velocity.x;
            node.position.y += node.velocity.y;
            node.position.z += node.velocity.z;
        });
    }

    start() {
        this.running = true;
    }

    stop() {
        this.running = false;
    }

    // Drag support
    setNodePosition(nodeId, position) {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.position = { ...position };
            node.velocity = { x: 0, y: 0, z: 0 };
        }
    }

    fixNode(nodeId, fixed = true) {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.fixed = fixed;
        }
    }

    clear() {
        this.nodes.clear();
        this.centerNode = null;
    }
}

// Global instance
const physics = new PhysicsEngine();
