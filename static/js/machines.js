/**
 * Brain3D - Machine Rendering (Cubes, Spheres, Dodecahedron, Icosahedron)
 */

class MachineRenderer {
    constructor(scene) {
        this.scene = scene;
        this.meshes = new Map(); // nodeId -> mesh
        this.specialMeshes = new Map(); // nodeId -> {satellites, particles, etc.}
    }

    createMachine(machine) {
        const type = machine.machine_type || 'network';
        const status = machine.status || 'UNKNOWN';

        let mesh;

        // Create special representations for Core and Forge
        if (type === 'core') {
            mesh = this._createCoreMesh(machine, status);
        } else if (type === 'forge') {
            mesh = this._createForgeMesh(machine, status);
        } else {
            mesh = this._createStandardMesh(machine, type, status);
        }

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
     * Core: Dodécaèdre tournant avec satellites en orbite
     */
    _createCoreMesh(machine, status) {
        const group = new THREE.Group();
        const color = getMachineColor('core', status);

        // Central dodecahedron
        const coreGeom = new THREE.DodecahedronGeometry(CONFIG.SIZES.core);
        const coreMat = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.9,
        });
        const coreMesh = new THREE.Mesh(coreGeom, coreMat);
        coreMesh.userData.isCore = true;
        group.add(coreMesh);

        // Wireframe overlay
        const wireGeom = new THREE.DodecahedronGeometry(CONFIG.SIZES.core * 1.05);
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc,
            wireframe: true,
            transparent: true,
            opacity: 0.4,
        });
        const wireMesh = new THREE.Mesh(wireGeom, wireMat);
        group.add(wireMesh);

        // Glow
        const glowGeom = new THREE.DodecahedronGeometry(CONFIG.SIZES.core * 1.4);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide,
        });
        group.add(new THREE.Mesh(glowGeom, glowMat));

        // Orbiting satellites (small spheres representing connected services)
        const satellites = [];
        const numSatellites = 6;
        for (let i = 0; i < numSatellites; i++) {
            const satGeom = new THREE.SphereGeometry(0.4, 16, 16);
            const satMat = new THREE.MeshPhongMaterial({
                color: 0x00ff88,
                emissive: 0x00ff88,
                emissiveIntensity: 0.5,
            });
            const sat = new THREE.Mesh(satGeom, satMat);
            sat.userData.orbitAngle = (i / numSatellites) * Math.PI * 2;
            sat.userData.orbitRadius = CONFIG.SIZES.core * 1.8;
            sat.userData.orbitSpeed = 0.5 + Math.random() * 0.3;
            sat.userData.orbitTilt = (Math.random() - 0.5) * 0.5;
            satellites.push(sat);
            group.add(sat);
        }

        // Store for animation
        this.specialMeshes.set(machine.node_id, {
            type: 'core',
            satellites,
            coreMesh,
            wireMesh
        });

        // Stocker référence au mesh principal pour animations
        group.userData.mainMesh = coreMesh;

        return group;
    }

    /**
     * Forge: Torus knot avec particules de création
     */
    _createForgeMesh(machine, status) {
        const group = new THREE.Group();
        const color = getMachineColor('forge', status);

        // Torus knot (forme créative)
        const knotGeom = new THREE.TorusKnotGeometry(
            CONFIG.SIZES.forge * 0.6,  // radius
            CONFIG.SIZES.forge * 0.2,  // tube
            64,   // tubular segments
            8,    // radial segments
            2,    // p
            3     // q
        );
        const knotMat = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.9,
        });
        const knotMesh = new THREE.Mesh(knotGeom, knotMat);
        knotMesh.userData.isForge = true;
        group.add(knotMesh);

        // Outer ring (anneau de création)
        const ringGeom = new THREE.TorusGeometry(
            CONFIG.SIZES.forge * 1.2,
            0.15,
            16,
            64
        );
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xaa44ff,
            transparent: true,
            opacity: 0.5,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        // Second ring (perpendicular)
        const ring2 = new THREE.Mesh(ringGeom.clone(), ringMat.clone());
        ring2.rotation.z = Math.PI / 2;
        group.add(ring2);

        // Sparkle particles
        const particles = [];
        const numParticles = 20;
        for (let i = 0; i < numParticles; i++) {
            const pGeom = new THREE.OctahedronGeometry(0.2);
            const pMat = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.5 ? 0xff44ff : 0xaa88ff,
                transparent: true,
                opacity: 0.8,
            });
            const p = new THREE.Mesh(pGeom, pMat);
            p.userData.angle = Math.random() * Math.PI * 2;
            p.userData.radius = CONFIG.SIZES.forge * (0.8 + Math.random() * 1.2);
            p.userData.speed = 0.3 + Math.random() * 0.5;
            p.userData.yOffset = (Math.random() - 0.5) * 3;
            p.userData.phase = Math.random() * Math.PI * 2;
            particles.push(p);
            group.add(p);
        }

        // Glow
        const glowGeom = new THREE.SphereGeometry(CONFIG.SIZES.forge * 1.5, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide,
        });
        group.add(new THREE.Mesh(glowGeom, glowMat));

        // Store for animation
        this.specialMeshes.set(machine.node_id, {
            type: 'forge',
            particles,
            knotMesh,
            ring,
            ring2
        });

        // Stocker référence au mesh principal pour animations
        group.userData.mainMesh = knotMesh;

        return group;
    }

    /**
     * Standard machines (Heart, Network, Proxy Target)
     */
    _createStandardMesh(machine, type, status) {
        const group = new THREE.Group();
        const baseSize = CONFIG.SIZES.machine * 1.5; // Taille augmentée
        let geometry;
        let color = getMachineColor(type, status);

        switch (type) {
            case 'heart':
                // Cube avec transparence
                geometry = new THREE.BoxGeometry(baseSize, baseSize, baseSize);
                break;
            case 'proxy_target':
                // Cube pointillé (machine sans Heart, via Heart Proxy)
                geometry = new THREE.BoxGeometry(baseSize * 0.9, baseSize * 0.9, baseSize * 0.9);
                break;
            case 'network':
            default:
                // Sphère de même taille que les cubes
                geometry = new THREE.SphereGeometry(baseSize * 0.5, 32, 32);
                break;
        }

        // Opacité selon le type et statut
        let opacity = status === 'DOWN' ? 0.3 : 0.7;
        if (type === 'proxy_target') {
            opacity = status === 'DOWN' ? 0.15 : 0.35; // Plus transparent (via proxy)
        }

        // Matériau principal avec transparence
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: type === 'proxy_target' ? 0.15 : 0.25,
            transparent: true,
            opacity: opacity,
        });

        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);

        // Stocker référence au mesh principal pour animations
        group.userData.mainMesh = mesh;

        // Wireframe pour les cubes (heart et proxy_target)
        if (type === 'heart') {
            const wireGeom = new THREE.BoxGeometry(baseSize * 1.02, baseSize * 1.02, baseSize * 1.02);
            const wireMat = new THREE.MeshBasicMaterial({
                color: color,
                wireframe: true,
                transparent: true,
                opacity: 0.5,
            });
            group.add(new THREE.Mesh(wireGeom, wireMat));
        } else if (type === 'proxy_target') {
            // Wireframe pointillé pour proxy_target
            const wireGeom = new THREE.BoxGeometry(baseSize * 0.95, baseSize * 0.95, baseSize * 0.95);
            const wireMat = new THREE.LineDashedMaterial({
                color: color,
                dashSize: 0.3,
                gapSize: 0.2,
                transparent: true,
                opacity: 0.6,
            });
            // Utiliser EdgesGeometry pour les lignes
            const edges = new THREE.EdgesGeometry(wireGeom);
            const wireframe = new THREE.LineSegments(edges, wireMat);
            wireframe.computeLineDistances(); // Requis pour le dashed
            group.add(wireframe);

            // Ajouter un petit indicateur "proxy"
            const indicatorGeom = new THREE.RingGeometry(baseSize * 0.15, baseSize * 0.2, 16);
            const indicatorMat = new THREE.MeshBasicMaterial({
                color: 0x88aaff,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide,
            });
            const indicator = new THREE.Mesh(indicatorGeom, indicatorMat);
            indicator.position.y = baseSize * 0.6;
            indicator.rotation.x = Math.PI / 2;
            group.add(indicator);
        }

        // Glow externe
        const glowGeom = (type === 'heart' || type === 'proxy_target')
            ? new THREE.BoxGeometry(baseSize * 1.3, baseSize * 1.3, baseSize * 1.3)
            : new THREE.SphereGeometry(baseSize * 0.65, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: type === 'proxy_target' ? 0.06 : 0.12,
            side: THREE.BackSide,
        });
        group.add(new THREE.Mesh(glowGeom, glowMat));

        return group;
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

    /**
     * Anime les éléments spéciaux (Core satellites, Forge particles)
     */
    animateSpecial(time) {
        this.specialMeshes.forEach((data, nodeId) => {
            if (data.type === 'core') {
                // Rotate core
                if (data.coreMesh) {
                    data.coreMesh.rotation.y = time * 0.3;
                    data.coreMesh.rotation.x = Math.sin(time * 0.2) * 0.1;
                }
                if (data.wireMesh) {
                    data.wireMesh.rotation.y = -time * 0.2;
                }

                // Animate satellites
                data.satellites?.forEach(sat => {
                    const angle = sat.userData.orbitAngle + time * sat.userData.orbitSpeed;
                    const radius = sat.userData.orbitRadius;
                    const tilt = sat.userData.orbitTilt;

                    sat.position.x = Math.cos(angle) * radius;
                    sat.position.z = Math.sin(angle) * radius;
                    sat.position.y = Math.sin(angle * 2 + tilt) * radius * 0.3;

                    // Pulse satellites
                    const scale = 1 + Math.sin(time * 3 + sat.userData.orbitAngle) * 0.2;
                    sat.scale.setScalar(scale);
                });

            } else if (data.type === 'forge') {
                // Rotate torus knot
                if (data.knotMesh) {
                    data.knotMesh.rotation.x = time * 0.5;
                    data.knotMesh.rotation.y = time * 0.3;
                }

                // Rotate rings
                if (data.ring) {
                    data.ring.rotation.z = time * 0.8;
                }
                if (data.ring2) {
                    data.ring2.rotation.x = time * 0.6;
                }

                // Animate particles (spiral upward)
                data.particles?.forEach(p => {
                    const angle = p.userData.angle + time * p.userData.speed;
                    const radius = p.userData.radius;
                    const yBase = p.userData.yOffset;
                    const phase = p.userData.phase;

                    p.position.x = Math.cos(angle) * radius;
                    p.position.z = Math.sin(angle) * radius;
                    p.position.y = yBase + Math.sin(time * 2 + phase) * 1.5;

                    // Rotate particle
                    p.rotation.x = time * 2;
                    p.rotation.y = time * 3;

                    // Pulse opacity
                    p.material.opacity = 0.5 + Math.sin(time * 4 + phase) * 0.3;
                });
            }
        });
    }

    clear() {
        this.meshes.forEach((mesh, nodeId) => {
            this.scene.removeMachine(mesh);
        });
        this.meshes.clear();
        this.specialMeshes.clear();
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
