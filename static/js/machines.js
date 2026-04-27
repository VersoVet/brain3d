/**
 * Brain3D - Machine Rendering
 * Simple: Heart = Cube, No Heart = Sphère
 */

class MachineRenderer {
    constructor(scene) {
        this.scene = scene;
        this.meshes = new Map(); // nodeId -> mesh
        this.metricsRings = new Map(); // nodeId -> {cpuRing, ramRing}
        this.metricsVisible = true;
        this.incoherentMachines = new Map(); // nodeId -> warningRing (pour animation)
    }

    createMachine(machine) {
        const type = machine.machine_type || 'network';
        const status = machine.status || 'UNKNOWN';
        const hasHeart = machine.has_heart;

        console.log(`[createMachine] ${machine.hostname}: type=${type}, hasHeart=${hasHeart}, status=${status}`);

        let mesh;

        // Géométrie spécifique selon type
        if (type === 'core') {
            // OnyxSoma: Icosaèdre avec électrons
            console.log(`  -> Creating CORE mesh (Icosahedron)`);
            mesh = this._createCoreMesh(machine, status);
        } else if (type === 'forge') {
            // OnyxDendrite: Torus violet
            console.log(`  -> Creating FORGE mesh (Torus)`);
            mesh = this._createForgeTorus(machine, status);
        } else if (hasHeart) {
            // Autres machines avec Heart: Cube
            console.log(`  -> Creating HEART mesh (Cube)`);
            mesh = this._createHeartCube(machine, type, status);
        } else {
            // Devices réseau sans Heart: Sphère
            console.log(`  -> Creating NETWORK mesh (Sphere)`);
            mesh = this._createNetworkSphere(machine, status);
        }

        mesh.name = machine.node_id;
        mesh.userData = {
            nodeId: machine.node_id,
            type: type,
            status: status,
            hostname: machine.hostname,
            ip: machine.ip,
            hasHeart: hasHeart,
            machineData: machine,
        };

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

    /**
     * Icosaèdre pour Core (OnyxSoma) avec champ d'électrons orbitants
     */
    _createCoreMesh(machine, status) {
        const group = new THREE.Group();
        const size = 5;
        const color = 0x00d4aa; // Cyan
        const opacity = status === 'DOWN' ? 0.3 : 0.85;

        // Icosaèdre central
        const geometry = new THREE.IcosahedronGeometry(size, 0);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: opacity,
            flatShading: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        group.userData.mainMesh = mesh;

        // Wireframe icosaèdre
        const wireGeom = new THREE.IcosahedronGeometry(size * 1.05, 0);
        const wireMat = new THREE.MeshBasicMaterial({
            color: color,
            wireframe: true,
            transparent: true,
            opacity: 0.6,
        });
        group.add(new THREE.Mesh(wireGeom, wireMat));

        // Champ d'électrons
        const electronGroup = this._createElectronField(size, color);
        group.add(electronGroup);
        group.userData.electronGroup = electronGroup;

        // Glow externe
        const glowGeom = new THREE.IcosahedronGeometry(size * 1.4, 1);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide,
        });
        group.add(new THREE.Mesh(glowGeom, glowMat));

        // Anneaux métriques
        this._addMetricsRings(group, machine.node_id, size);

        // Indicateur d'incohérence
        if (machine.is_coherent === false && machine.incoherences?.length > 0) {
            const warningRing = this._createWarningRing(size);
            group.add(warningRing);
            this.incoherentMachines.set(machine.node_id, warningRing);
            group.userData.hasIncoherence = true;
            group.userData.incoherenceCount = machine.incoherences.length;
        }

        return group;
    }

    /**
     * Crée un champ d'électrons orbitant autour du Core
     */
    _createElectronField(coreSize, color) {
        const electronGroup = new THREE.Group();
        electronGroup.name = 'electrons';

        const electronCount = 12;
        const orbitRadius = coreSize * 1.8;

        for (let i = 0; i < electronCount; i++) {
            // Petite sphère pour chaque électron
            const electronGeom = new THREE.SphereGeometry(0.25, 8, 8);
            const electronMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
            });
            const electron = new THREE.Mesh(electronGeom, electronMat);

            // Position initiale sur orbite
            const angle = (i / electronCount) * Math.PI * 2;
            const tilt = (i % 3) * 0.4;
            electron.userData = {
                orbitRadius: orbitRadius,
                angle: angle,
                speed: 0.5 + Math.random() * 0.5,
                tiltX: tilt,
                tiltZ: (i % 2) * 0.6,
            };

            // Position initiale
            electron.position.x = Math.cos(angle) * orbitRadius;
            electron.position.y = Math.sin(angle) * orbitRadius * Math.cos(tilt);
            electron.position.z = Math.sin(angle) * orbitRadius * Math.sin((i % 2) * 0.6);

            electronGroup.add(electron);
        }

        // Traînées lumineuses (3 orbites à différentes inclinaisons)
        const trailGeom = new THREE.TorusGeometry(orbitRadius, 0.05, 8, 64);
        const trailMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.15,
        });
        for (let t = 0; t < 3; t++) {
            const trail = new THREE.Mesh(trailGeom, trailMat.clone());
            trail.rotation.x = t * 0.4;
            trail.rotation.z = (t % 2) * 0.6;
            electronGroup.add(trail);
        }

        return electronGroup;
    }

    /**
     * Torus pour Forge (OnyxDendrite)
     */
    _createForgeTorus(machine, status) {
        const group = new THREE.Group();
        const radius = 3.5;
        const tube = 1.2;
        const color = 0xaa44ff; // Violet
        const opacity = status === 'DOWN' ? 0.3 : 0.8;

        // Torus principal
        const geometry = new THREE.TorusGeometry(radius, tube, 16, 48);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.35,
            transparent: true,
            opacity: opacity,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI / 2; // Horizontal
        group.add(mesh);
        group.userData.mainMesh = mesh;

        // Wireframe
        const wireGeom = new THREE.TorusGeometry(radius * 1.02, tube * 1.02, 16, 48);
        const wireMat = new THREE.MeshBasicMaterial({
            color: color,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
        });
        const wire = new THREE.Mesh(wireGeom, wireMat);
        wire.rotation.x = Math.PI / 2;
        group.add(wire);

        // Noyau central (petite sphère lumineuse)
        const coreGeom = new THREE.SphereGeometry(1, 16, 16);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
        });
        group.add(new THREE.Mesh(coreGeom, coreMat));

        // Glow
        const glowGeom = new THREE.TorusGeometry(radius * 1.3, tube * 1.3, 8, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide,
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        glow.rotation.x = Math.PI / 2;
        group.add(glow);

        // Anneaux métriques
        this._addMetricsRings(group, machine.node_id, radius);

        // Indicateur d'incohérence
        if (machine.is_coherent === false && machine.incoherences?.length > 0) {
            const warningRing = this._createWarningRing(radius);
            group.add(warningRing);
            this.incoherentMachines.set(machine.node_id, warningRing);
            group.userData.hasIncoherence = true;
            group.userData.incoherenceCount = machine.incoherences.length;
        }

        return group;
    }

    /**
     * Cube pour machine avec Heart
     * Couleur selon type: cyan (core), violet (forge), vert (heart standard)
     * Ajoute indicateur visuel si incohérence détectée
     */
    _createHeartCube(machine, type, status) {
        const group = new THREE.Group();

        // Taille selon type
        const size = type === 'core' ? 4 : type === 'forge' ? 3.5 : 3;

        // Couleur selon type (pas statut pour distinguer les types)
        const typeColors = {
            core: 0x00d4aa,    // Cyan
            forge: 0xaa44ff,   // Violet
            heart: 0x00ff88,   // Vert
        };
        const color = typeColors[type] || typeColors.heart;

        // Opacité selon statut
        const opacity = status === 'DOWN' ? 0.3 : 0.8;

        // Cube principal
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: opacity,
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        group.userData.mainMesh = mesh;

        // Wireframe
        const wireGeom = new THREE.BoxGeometry(size * 1.02, size * 1.02, size * 1.02);
        const wireMat = new THREE.MeshBasicMaterial({
            color: color,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
        });
        group.add(new THREE.Mesh(wireGeom, wireMat));

        // Glow
        const glowGeom = new THREE.BoxGeometry(size * 1.3, size * 1.3, size * 1.3);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide,
        });
        group.add(new THREE.Mesh(glowGeom, glowMat));

        // Anneaux métriques
        this._addMetricsRings(group, machine.node_id, size);

        // Indicateur d'incohérence si détecté
        if (machine.is_coherent === false && machine.incoherences?.length > 0) {
            const warningRing = this._createWarningRing(size);
            group.add(warningRing);
            this.incoherentMachines.set(machine.node_id, warningRing);
            group.userData.hasIncoherence = true;
            group.userData.incoherenceCount = machine.incoherences.length;
        }

        return group;
    }

    /**
     * Crée un anneau rouge pulsant pour signaler une incohérence
     */
    _createWarningRing(baseSize) {
        const ringGeom = new THREE.TorusGeometry(baseSize * 0.9, 0.15, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff4444,  // Rouge
            transparent: true,
            opacity: 0.8,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.userData.isWarning = true;
        return ring;
    }

    /**
     * Anime les anneaux d'avertissement (pulse rouge)
     */
    animateWarnings(time) {
        this.incoherentMachines.forEach((ring, nodeId) => {
            if (ring && ring.material) {
                // Pulse l'opacité
                ring.material.opacity = 0.4 + Math.sin(time * 4) * 0.4;
                // Pulse la taille
                const scale = 1 + Math.sin(time * 3) * 0.1;
                ring.scale.setScalar(scale);
            }
        });
    }

    /**
     * Sphère pour device réseau sans Heart
     */
    _createNetworkSphere(machine, status) {
        const group = new THREE.Group();
        const size = 1.5;
        const color = 0x4488ff; // Bleu
        const opacity = status === 'DOWN' ? 0.3 : 0.6;

        // Sphère
        const geometry = new THREE.SphereGeometry(size, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: opacity,
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        group.userData.mainMesh = mesh;

        // Glow
        const glowGeom = new THREE.SphereGeometry(size * 1.3, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide,
        });
        group.add(new THREE.Mesh(glowGeom, glowMat));

        return group;
    }

    /**
     * Ajoute des anneaux de métriques (CPU, RAM) autour d'une machine Heart
     */
    _addMetricsRings(group, nodeId, baseSize) {
        const ringRadius = baseSize * 0.85;
        const tubeRadius = 0.12;

        // Groupe conteneur pour les anneaux
        const metricsGroup = new THREE.Group();
        metricsGroup.name = 'metrics';

        // === Anneau CPU (horizontal, dessus) ===
        // Background ring (gris)
        const cpuBgGeom = new THREE.TorusGeometry(ringRadius, tubeRadius, 8, 32);
        const cpuBgMat = new THREE.MeshBasicMaterial({
            color: 0x333344,
            transparent: true,
            opacity: 0.4,
        });
        const cpuBg = new THREE.Mesh(cpuBgGeom, cpuBgMat);
        cpuBg.rotation.x = Math.PI / 2;
        cpuBg.position.y = baseSize * 0.7;
        metricsGroup.add(cpuBg);

        // Arc CPU (cyan) - initialement vide
        const cpuArc = this._createArc(ringRadius, tubeRadius, 0, 0x00ffff);
        cpuArc.rotation.x = Math.PI / 2;
        cpuArc.position.y = baseSize * 0.7;
        metricsGroup.add(cpuArc);

        // === Anneau RAM (vertical, côté) ===
        // Background ring (gris)
        const ramBgGeom = new THREE.TorusGeometry(ringRadius * 0.9, tubeRadius, 8, 32);
        const ramBgMat = new THREE.MeshBasicMaterial({
            color: 0x333344,
            transparent: true,
            opacity: 0.4,
        });
        const ramBg = new THREE.Mesh(ramBgGeom, ramBgMat);
        ramBg.rotation.y = Math.PI / 2;
        metricsGroup.add(ramBg);

        // Arc RAM (vert) - initialement vide
        const ramArc = this._createArc(ringRadius * 0.9, tubeRadius, 0, 0x00ff88);
        ramArc.rotation.y = Math.PI / 2;
        metricsGroup.add(ramArc);

        group.add(metricsGroup);

        // Stocker les références
        this.metricsRings.set(nodeId, {
            group: metricsGroup,
            cpuArc,
            ramArc,
            cpuBg,
            ramBg,
            ringRadius,
            tubeRadius,
        });
    }

    /**
     * Crée un arc de cercle (portion de torus)
     */
    _createArc(radius, tubeRadius, percent, color) {
        // Si percent est 0, créer un arc minimal invisible
        const angle = Math.max(0.01, (percent / 100) * Math.PI * 2);

        // Utiliser un tube le long d'une courbe
        const curve = new THREE.EllipseCurve(
            0, 0,
            radius, radius,
            0, angle,
            false,
            0
        );

        const points = curve.getPoints(32);
        const path = new THREE.CatmullRomCurve3(
            points.map(p => new THREE.Vector3(p.x, 0, p.y))
        );

        const geometry = new THREE.TubeGeometry(path, 32, tubeRadius, 8, false);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: percent > 0 ? 0.9 : 0,
        });

        return new THREE.Mesh(geometry, material);
    }

    /**
     * Met à jour un arc de métriques
     */
    _updateArc(oldArc, radius, tubeRadius, percent, color, parent, rotation, position) {
        // Supprimer l'ancien arc
        parent.remove(oldArc);
        oldArc.geometry.dispose();
        oldArc.material.dispose();

        // Créer le nouvel arc
        const newArc = this._createArc(radius, tubeRadius, percent, color);
        newArc.rotation.copy(rotation);
        newArc.position.copy(position);
        parent.add(newArc);

        return newArc;
    }

    /**
     * Met à jour les métriques d'une machine
     */
    updateMetrics(nodeId, metrics) {
        const rings = this.metricsRings.get(nodeId);
        if (!rings || !this.metricsVisible) return;

        const { group, cpuArc, ramArc, ringRadius, tubeRadius } = rings;

        const cpuPercent = metrics.cpu_percent || 0;
        const ramPercent = metrics.ram_percent || 0;

        // Mettre à jour l'arc CPU
        if (cpuPercent !== cpuArc.userData.percent) {
            const rotation = cpuArc.rotation.clone();
            const position = cpuArc.position.clone();
            rings.cpuArc = this._updateArc(cpuArc, ringRadius, tubeRadius, cpuPercent, 0x00ffff, group, rotation, position);
            rings.cpuArc.userData.percent = cpuPercent;
        }

        // Mettre à jour l'arc RAM
        if (ramPercent !== ramArc.userData.percent) {
            const rotation = ramArc.rotation.clone();
            const position = ramArc.position.clone();
            rings.ramArc = this._updateArc(ramArc, ringRadius * 0.9, tubeRadius, ramPercent, 0x00ff88, group, rotation, position);
            rings.ramArc.userData.percent = ramPercent;
        }
    }

    /**
     * Toggle la visibilité des métriques
     */
    toggleMetrics() {
        this.metricsVisible = !this.metricsVisible;

        this.metricsRings.forEach((rings) => {
            rings.group.visible = this.metricsVisible;
        });

        return this.metricsVisible;
    }

    updateMachine(nodeId, updates) {
        const mesh = this.meshes.get(nodeId);
        if (!mesh) return;

        // Update status/color
        if (updates.status) {
            mesh.userData.status = updates.status;
            const color = getMachineColor(mesh.userData.type, updates.status);

            // Update all children materials (for groups)
            mesh.traverse((child) => {
                if (child.material) {
                    if (child.material.color) child.material.color.setHex(color);
                    if (child.material.emissive) child.material.emissive.setHex(color);
                    // Adjust opacity for DOWN status
                    if (child.material.opacity !== undefined && !child.material.wireframe) {
                        const baseOpacity = child.material.side === THREE.BackSide ? 0.12 : 0.7;
                        child.material.opacity = updates.status === 'DOWN' ? baseOpacity * 0.4 : baseOpacity;
                    }
                }
            });
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

    getAllMeshes() {
        return this.meshes;
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
        this.metricsRings.clear();
        physics.clear();
    }

    // Create all machines from state
    createAllMachines(machines) {
        console.log('MachineRenderer.createAllMachines called with', machines.length, 'machines');
        this.clear();

        // Sort: core first, then forge, then hearts, then proxy_target, then network
        const sorted = [...machines].sort((a, b) => {
            const order = { core: 0, forge: 1, heart: 2, proxy_target: 3, network: 4 };
            return (order[a.machine_type] || 4) - (order[b.machine_type] || 4);
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
