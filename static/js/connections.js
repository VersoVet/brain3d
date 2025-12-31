/**
 * Brain3D - Connection Lines & Message Particles
 * Visualise les connexions et le trafic du Message Bus Redis
 */

class ConnectionRenderer {
    constructor(scene) {
        this.scene = scene;
        this.lines = new Map(); // connectionId -> line
        this.particles = []; // Active message particles
        this.particlePool = []; // Reusable particles
        this.maxParticles = 100;
        this.coreId = null;
    }

    createConnection(fromId, toId, options = {}) {
        const connectionId = `${fromId}-${toId}`;

        if (this.lines.has(connectionId)) {
            return this.lines.get(connectionId);
        }

        const fromMesh = machineRenderer?.getMesh(fromId);
        const toMesh = machineRenderer?.getMesh(toId);

        if (!fromMesh || !toMesh) return null;

        const points = [
            fromMesh.position.clone(),
            toMesh.position.clone(),
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const color = options.color || 0x00d4aa;
        const dashed = options.dashed || false;

        let material;
        if (dashed) {
            material = new THREE.LineDashedMaterial({
                color: color,
                transparent: true,
                opacity: 0.3,
                dashSize: 1,
                gapSize: 0.5,
            });
        } else {
            material = new THREE.LineBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.4,
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

        const positions = line.geometry.attributes.position.array;
        positions[0] = fromMesh.position.x;
        positions[1] = fromMesh.position.y;
        positions[2] = fromMesh.position.z;
        positions[3] = toMesh.position.x;
        positions[4] = toMesh.position.y;
        positions[5] = toMesh.position.z;

        line.geometry.attributes.position.needsUpdate = true;

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

        // Clear particles
        this.particles.forEach(p => {
            this.scene.connectionsGroup.remove(p.mesh);
        });
        this.particles = [];
    }

    createAllConnections(machines) {
        this.clear();

        const coreNode = machines.find(m => m.machine_type === 'core');
        if (!coreNode) return;

        this.coreId = coreNode.node_id;

        machines.forEach(machine => {
            if (machine.node_id === coreNode.node_id) return;

            const isNetwork = machine.machine_type === 'network';
            const isForge = machine.machine_type === 'forge';

            this.createConnection(machine.node_id, coreNode.node_id, {
                dashed: isNetwork,
                color: isForge ? 0xaa44ff : (isNetwork ? 0x4488ff : 0x00d4aa),
                type: machine.machine_type,
            });
        });

        // Start message simulation
        this._startMessageSimulation();
    }

    // === MESSAGE PARTICLES ===

    /**
     * Crée ou réutilise une particule de message
     */
    _getParticle(messageType) {
        const config = CONFIG.MESSAGE_TYPES[messageType] || CONFIG.MESSAGE_TYPES.status;

        let particle;
        if (this.particlePool.length > 0) {
            particle = this.particlePool.pop();
            particle.mesh.material.color.setHex(config.color);
            particle.mesh.scale.setScalar(config.size);
            particle.mesh.visible = true;
        } else {
            const geometry = new THREE.SphereGeometry(1, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: config.color,
                transparent: true,
                opacity: 0.9,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.scale.setScalar(config.size);

            // Add glow
            const glowGeom = new THREE.SphereGeometry(1.5, 8, 8);
            const glowMat = new THREE.MeshBasicMaterial({
                color: config.color,
                transparent: true,
                opacity: 0.3,
                side: THREE.BackSide,
            });
            mesh.add(new THREE.Mesh(glowGeom, glowMat));

            this.scene.connectionsGroup.add(mesh);
            particle = { mesh };
        }

        return particle;
    }

    /**
     * Renvoie une particule dans le pool
     */
    _releaseParticle(particle) {
        particle.mesh.visible = false;
        this.particlePool.push(particle);
    }

    /**
     * Envoie un message visuel entre deux machines
     */
    sendMessage(fromId, toId, messageType = 'status') {
        if (this.particles.length >= this.maxParticles) return;

        const fromMesh = machineRenderer?.getMesh(fromId);
        const toMesh = machineRenderer?.getMesh(toId);

        if (!fromMesh || !toMesh) return;

        const config = CONFIG.MESSAGE_TYPES[messageType] || CONFIG.MESSAGE_TYPES.status;
        const particle = this._getParticle(messageType);

        particle.fromPos = fromMesh.position.clone();
        particle.toPos = toMesh.position.clone();
        particle.progress = 0;
        particle.speed = config.speed;
        particle.type = messageType;
        particle.mesh.position.copy(particle.fromPos);

        this.particles.push(particle);
    }

    /**
     * Broadcast un message à toutes les machines depuis Core
     */
    broadcastMessage(messageType = 'broadcast') {
        if (!this.coreId) return;

        this.lines.forEach((line, connectionId) => {
            const { fromId, toId } = line.userData;
            // Broadcast from Core to all
            if (fromId !== this.coreId && toId === this.coreId) {
                setTimeout(() => {
                    this.sendMessage(this.coreId, fromId, messageType);
                }, Math.random() * 200);
            }
        });
    }

    /**
     * Met à jour les particules (appelé dans la boucle d'animation)
     */
    updateParticles(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];

            // Update progress
            particle.progress += particle.speed * deltaTime;

            if (particle.progress >= 1) {
                // Message arrived - flash effect
                this._flashAtDestination(particle);

                // Release particle
                this._releaseParticle(particle);
                this.particles.splice(i, 1);
            } else {
                // Update position along path
                particle.mesh.position.lerpVectors(
                    particle.fromPos,
                    particle.toPos,
                    particle.progress
                );

                // Add slight wave motion
                const wave = Math.sin(particle.progress * Math.PI * 3) * 0.5;
                particle.mesh.position.y += wave;

                // Pulse size
                const pulse = 1 + Math.sin(particle.progress * Math.PI * 6) * 0.2;
                const baseSize = CONFIG.MESSAGE_TYPES[particle.type]?.size || 0.3;
                particle.mesh.scale.setScalar(baseSize * pulse);
            }
        }
    }

    /**
     * Flash quand un message arrive
     */
    _flashAtDestination(particle) {
        const config = CONFIG.MESSAGE_TYPES[particle.type];
        if (!config) return;

        // Create flash effect
        const flashGeom = new THREE.SphereGeometry(1, 16, 16);
        const flashMat = new THREE.MeshBasicMaterial({
            color: config.color,
            transparent: true,
            opacity: 0.6,
        });
        const flash = new THREE.Mesh(flashGeom, flashMat);
        flash.position.copy(particle.toPos);
        flash.scale.setScalar(0.5);
        this.scene.connectionsGroup.add(flash);

        // Animate flash
        let scale = 0.5;
        const animateFlash = () => {
            scale += 0.15;
            flash.scale.setScalar(scale);
            flash.material.opacity -= 0.08;

            if (flash.material.opacity > 0) {
                requestAnimationFrame(animateFlash);
            } else {
                this.scene.connectionsGroup.remove(flash);
                flash.geometry.dispose();
                flash.material.dispose();
            }
        };
        animateFlash();
    }

    // === MESSAGE SIMULATION ===

    /**
     * Simule le trafic du Message Bus
     */
    _startMessageSimulation() {
        // Heartbeats réguliers (toutes les 2-4 secondes par machine)
        this._simulateHeartbeats();

        // Messages aléatoires
        this._simulateRandomMessages();
    }

    _simulateHeartbeats() {
        const heartbeatInterval = () => {
            if (!this.coreId) return;

            // Each Heart sends a heartbeat
            this.lines.forEach((line) => {
                const { fromId, toId } = line.userData;
                if (line.userData.type === 'heart' && toId === this.coreId) {
                    // Random delay to stagger heartbeats
                    setTimeout(() => {
                        this.sendMessage(fromId, this.coreId, 'heartbeat');
                    }, Math.random() * 2000);
                }
            });

            // Schedule next round
            setTimeout(heartbeatInterval, 3000 + Math.random() * 2000);
        };

        setTimeout(heartbeatInterval, 1000);
    }

    _simulateRandomMessages() {
        const messageTypes = ['ping', 'sync', 'command', 'status', 'skill_event'];

        const sendRandom = () => {
            if (!this.coreId) return;

            const connections = Array.from(this.lines.values());
            if (connections.length === 0) return;

            // Random connection
            const conn = connections[Math.floor(Math.random() * connections.length)];
            const { fromId, toId } = conn.userData;

            // Random message type
            const msgType = messageTypes[Math.floor(Math.random() * messageTypes.length)];

            // Random direction (mostly Core → Hearts for commands)
            if (msgType === 'command' || msgType === 'sync') {
                this.sendMessage(this.coreId, fromId, msgType);
            } else if (msgType === 'status' || msgType === 'skill_event') {
                this.sendMessage(fromId, this.coreId, msgType);
            } else {
                // Ping can go either way
                if (Math.random() > 0.5) {
                    this.sendMessage(this.coreId, fromId, 'ping');
                    setTimeout(() => {
                        this.sendMessage(fromId, this.coreId, 'pong');
                    }, 300);
                }
            }

            // Occasional Forge communication
            if (Math.random() < 0.1) {
                const forgeConn = connections.find(c => c.userData.type === 'forge');
                if (forgeConn) {
                    this.sendMessage(this.coreId, forgeConn.userData.fromId, 'forge');
                    setTimeout(() => {
                        this.sendMessage(forgeConn.userData.fromId, this.coreId, 'forge');
                    }, 500);
                }
            }

            // Occasional broadcast
            if (Math.random() < 0.05) {
                this.broadcastMessage('broadcast');
            }

            // Schedule next random message
            setTimeout(sendRandom, 500 + Math.random() * 1500);
        };

        setTimeout(sendRandom, 2000);
    }

    /**
     * Envoie un vrai message depuis un événement Redis
     */
    handleRedisEvent(event) {
        const { type, node, target } = event;

        // Map event type to message type
        let msgType = 'status';
        if (type === 'heartbeat') msgType = 'heartbeat';
        else if (type === 'ping' || type === 'pong') msgType = type;
        else if (type === 'sync_complete') msgType = 'sync';
        else if (type === 'skill_started' || type === 'skill_stopped') msgType = 'skill_event';
        else if (type === 'error') msgType = 'error';
        else if (type?.includes('forge')) msgType = 'forge';

        // Determine source and target
        const sourceId = node || target;
        if (sourceId && this.coreId) {
            // Find connection
            const mesh = machineRenderer?.getMesh(sourceId);
            if (mesh) {
                this.sendMessage(sourceId, this.coreId, msgType);
            }
        }
    }
}

// Global instance (created in app.js)
let connectionRenderer = null;
