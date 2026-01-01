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
        this.maxParticles = 150;
        this.coreId = null;
        this.machineIds = []; // All machine IDs for inter-connections
        this.activeLines = new Map(); // Lines currently being animated
    }

    createConnection(fromId, toId, options = {}) {
        // Create bidirectional key (sorted)
        const ids = [fromId, toId].sort();
        const connectionId = `${ids[0]}-${ids[1]}`;

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
        const baseOpacity = options.baseOpacity || 0.15; // Liens visibles mais subtils

        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: baseOpacity,
            linewidth: 1,
        });

        const line = new THREE.Line(geometry, material);
        line.name = connectionId;
        line.userData = {
            fromId: ids[0],
            toId: ids[1],
            originalFromId: fromId,
            originalToId: toId,
            type: options.type || 'default',
            baseOpacity: baseOpacity,
            baseColor: color,
            activeColor: options.activeColor || color,
        };

        this.lines.set(connectionId, line);
        this.scene.addConnection(line);

        return line;
    }

    /**
     * Trouve ou crée une connexion entre deux machines
     */
    getOrCreateConnection(fromId, toId) {
        const ids = [fromId, toId].sort();
        const connectionId = `${ids[0]}-${ids[1]}`;

        if (this.lines.has(connectionId)) {
            return this.lines.get(connectionId);
        }

        // Créer une nouvelle connexion à la volée
        return this.createConnection(fromId, toId, {
            color: 0x888888,
            baseOpacity: 0.1,
        });
    }

    /**
     * Active visuellement une connexion (highlight)
     */
    activateConnection(fromId, toId, color, duration = 500) {
        const ids = [fromId, toId].sort();
        const connectionId = `${ids[0]}-${ids[1]}`;
        const line = this.lines.get(connectionId);

        if (!line) return;

        // Highlight la ligne
        line.material.color.setHex(color);
        line.material.opacity = 0.8;

        // Store pour animation de fade
        this.activeLines.set(connectionId, {
            startTime: Date.now(),
            duration: duration,
            originalOpacity: line.userData.baseOpacity,
            originalColor: line.userData.baseColor,
        });
    }

    /**
     * Met à jour les animations des lignes actives
     */
    updateActiveLines() {
        const now = Date.now();

        this.activeLines.forEach((data, connectionId) => {
            const line = this.lines.get(connectionId);
            if (!line) {
                this.activeLines.delete(connectionId);
                return;
            }

            const elapsed = now - data.startTime;
            const progress = Math.min(elapsed / data.duration, 1);

            if (progress >= 1) {
                // Reset to original state
                line.material.opacity = data.originalOpacity;
                line.material.color.setHex(data.originalColor);
                this.activeLines.delete(connectionId);
            } else {
                // Fade out
                const opacity = 0.8 - (0.8 - data.originalOpacity) * progress;
                line.material.opacity = opacity;
            }
        });
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
        this.machineIds = machines.map(m => m.node_id);

        // Créer toutes les connexions possibles
        for (let i = 0; i < machines.length; i++) {
            for (let j = i + 1; j < machines.length; j++) {
                const m1 = machines[i];
                const m2 = machines[j];

                // Déterminer la couleur et l'opacité selon les types
                let color = 0x444466; // Couleur par défaut (subtile)
                let baseOpacity = 0.08; // Très subtil par défaut

                // Core connections (plus visibles)
                if (m1.machine_type === 'core' || m2.machine_type === 'core') {
                    const other = m1.machine_type === 'core' ? m2 : m1;
                    if (other.machine_type === 'forge') {
                        color = 0xaa44ff; // Violet pour Forge
                        baseOpacity = 0.25;
                    } else if (other.machine_type === 'heart') {
                        color = 0x00d4aa; // Cyan pour Hearts
                        baseOpacity = 0.2;
                    } else if (other.machine_type === 'network') {
                        color = 0x4488ff; // Bleu pour Network
                        baseOpacity = 0.12;
                    }
                }
                // Heart to Heart (communication inter-machines)
                else if (m1.machine_type === 'heart' && m2.machine_type === 'heart') {
                    color = 0x00ff88;
                    baseOpacity = 0.06;
                }
                // Forge to Heart
                else if ((m1.machine_type === 'forge' && m2.machine_type === 'heart') ||
                         (m1.machine_type === 'heart' && m2.machine_type === 'forge')) {
                    color = 0xaa88ff;
                    baseOpacity = 0.1;
                }

                this.createConnection(m1.node_id, m2.node_id, {
                    color: color,
                    baseOpacity: baseOpacity,
                    type: `${m1.machine_type}-${m2.machine_type}`,
                });
            }
        }

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
        particle.fromId = fromId;
        particle.toId = toId;
        particle.progress = 0;
        particle.speed = config.speed;
        particle.type = messageType;
        particle.mesh.position.copy(particle.fromPos);

        // Activer visuellement la connexion
        this.activateConnection(fromId, toId, config.color, 800);

        this.particles.push(particle);
    }

    /**
     * Met à jour les particules (appelé dans la boucle d'animation)
     */
    updateParticles(deltaTime) {
        // Update active line animations (fade out)
        this.updateActiveLines();

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
                const wave = Math.sin(particle.progress * Math.PI * 3) * 0.8;
                particle.mesh.position.y += wave;

                // Pulse size
                const pulse = 1 + Math.sin(particle.progress * Math.PI * 6) * 0.3;
                const baseSize = CONFIG.MESSAGE_TYPES[particle.type]?.size || 0.9;
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
        // Heartbeats réguliers
        this._simulateHeartbeats();

        // Messages aléatoires sur toutes les connexions
        this._simulateRandomMessages();

        // Communication inter-machines
        this._simulateInterMachineComm();
    }

    _simulateHeartbeats() {
        const heartbeatInterval = () => {
            if (!this.coreId || this.machineIds.length === 0) return;

            // Chaque machine envoie un heartbeat au Core
            this.machineIds.forEach(machineId => {
                if (machineId === this.coreId) return;

                // Random delay to stagger heartbeats
                setTimeout(() => {
                    this.sendMessage(machineId, this.coreId, 'heartbeat');
                }, Math.random() * 3000);
            });

            // Schedule next round
            setTimeout(heartbeatInterval, 4000 + Math.random() * 2000);
        };

        setTimeout(heartbeatInterval, 1000);
    }

    _simulateRandomMessages() {
        const sendRandom = () => {
            if (!this.coreId || this.machineIds.length < 2) return;

            const connections = Array.from(this.lines.values());
            if (connections.length === 0) return;

            // Random connection (pas réseau)
            const validConns = connections.filter(c => !c.userData.type.includes('network'));
            if (validConns.length === 0) return;

            const conn = validConns[Math.floor(Math.random() * validConns.length)];
            const { fromId, toId } = conn.userData;

            // Déterminer le type de message selon la connexion
            const connType = conn.userData.type;
            let msgType, direction;

            if (connType.includes('forge')) {
                // Communication Forge
                msgType = 'forge';
                direction = Math.random() > 0.5 ? [this.coreId, fromId] : [fromId, this.coreId];
            } else if (connType.includes('core')) {
                // Communication avec Core
                const msgTypes = ['command', 'sync', 'status', 'skill_event', 'ping'];
                msgType = msgTypes[Math.floor(Math.random() * msgTypes.length)];

                if (msgType === 'command' || msgType === 'sync') {
                    direction = [this.coreId, toId === this.coreId ? fromId : toId];
                } else {
                    direction = [toId === this.coreId ? fromId : toId, this.coreId];
                }
            } else {
                // Communication Heart to Heart
                msgType = Math.random() > 0.5 ? 'sync' : 'status';
                direction = Math.random() > 0.5 ? [fromId, toId] : [toId, fromId];
            }

            this.sendMessage(direction[0], direction[1], msgType);

            // Réponse pong si ping
            if (msgType === 'ping') {
                setTimeout(() => {
                    this.sendMessage(direction[1], direction[0], 'pong');
                }, 300);
            }

            // Schedule next random message
            setTimeout(sendRandom, 400 + Math.random() * 1200);
        };

        setTimeout(sendRandom, 2000);
    }

    _simulateInterMachineComm() {
        // Communication occasionnelle entre Hearts (sync, status)
        const sendInterMachine = () => {
            if (this.machineIds.length < 3) return;

            // Trouver deux machines non-Core différentes
            const nonCore = this.machineIds.filter(id => id !== this.coreId);
            if (nonCore.length < 2) return;

            const from = nonCore[Math.floor(Math.random() * nonCore.length)];
            let to = nonCore[Math.floor(Math.random() * nonCore.length)];
            while (to === from) {
                to = nonCore[Math.floor(Math.random() * nonCore.length)];
            }

            // Message status ou sync entre machines
            const msgType = Math.random() > 0.7 ? 'sync' : 'status';
            this.sendMessage(from, to, msgType);

            // Schedule next
            setTimeout(sendInterMachine, 3000 + Math.random() * 4000);
        };

        setTimeout(sendInterMachine, 5000);
    }

    /**
     * Broadcast - envoie un message de Core à toutes les machines
     */
    broadcastMessage(messageType = 'broadcast') {
        if (!this.coreId) return;

        this.machineIds.forEach(machineId => {
            if (machineId === this.coreId) return;

            setTimeout(() => {
                this.sendMessage(this.coreId, machineId, messageType);
            }, Math.random() * 300);
        });
    }

    /**
     * Envoie un vrai message depuis un événement Redis
     *
     * Event types from MESSAGE_BUS.md:
     * - Heart → Core: heartbeat, pong, sync_complete, skill_removed, skill_restarted, status_response
     * - Forge → Core: forge_online, pong, test_started, test_complete
     */
    handleRedisEvent(event) {
        // event structure: { type: "redis_event", event_type: "heartbeat", node: "...", data: {...} }
        const eventType = event.event_type || event.type;
        const node = event.node;
        const data = event.data || {};

        // Map Redis event type to visual message type
        const typeMapping = {
            // Heart events
            'heartbeat': 'heartbeat',
            'pong': 'pong',
            'sync_complete': 'sync',
            'skill_removed': 'skill_event',
            'skill_restarted': 'skill_event',
            'status_response': 'status',
            // Forge events
            'forge_online': 'forge',
            'test_started': 'forge',
            'test_complete': 'forge',
            // Other
            'error': 'error',
        };

        const msgType = typeMapping[eventType] || 'status';

        // Find the node's mesh - try with full node_id or hostname
        let sourceId = node;
        if (sourceId && this.coreId) {
            // Try to find matching machine
            const mesh = machineRenderer?.getMesh(sourceId);
            if (mesh) {
                this.sendMessage(sourceId, this.coreId, msgType);
            } else {
                // Try to find by partial match (hostname without suffix)
                const hostname = sourceId.split('-')[0];
                const allMeshes = machineRenderer?.getAllMeshes() || new Map();
                for (const [id, m] of allMeshes) {
                    if (id.startsWith(hostname) || id.includes(hostname)) {
                        this.sendMessage(id, this.coreId, msgType);
                        break;
                    }
                }
            }
        }

        console.log('Redis event:', eventType, node, '→', msgType);
    }
}

// Global instance (created in app.js)
let connectionRenderer = null;
