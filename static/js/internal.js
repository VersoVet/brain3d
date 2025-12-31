/**
 * Brain3D - Internal View Renderer (Areas, Skills, Heart)
 * Affiche la vue interne d'une machine: aires cérébrales et skills
 */

class InternalViewRenderer {
    constructor(scene) {
        this.scene = scene;
        this.internalGroup = null;
        this.currentNodeId = null;
        this.areaMeshes = new Map();
        this.skillMeshes = new Map();
        this.heartMesh = null;
        this.visible = false;
    }

    _ensureGroup() {
        if (!this.internalGroup) {
            this.internalGroup = new THREE.Group();
            this.internalGroup.name = 'internal-view';
            this.scene.scene.add(this.internalGroup);
        }
        return this.internalGroup;
    }

    /**
     * Affiche la vue interne d'une machine
     * @param {string} nodeId - ID de la machine
     * @param {object} state - État complet (machines, skills, areas)
     */
    show(nodeId, state) {
        this.hide(); // Clear previous

        const machine = state.machines?.find(m => m.node_id === nodeId);
        if (!machine) {
            console.error('Machine not found:', nodeId);
            return;
        }

        this.currentNodeId = nodeId;
        this.visible = true;

        const group = this._ensureGroup();
        group.visible = true;

        // Hide main network view
        this.scene.machinesGroup.visible = false;
        this.scene.connectionsGroup.visible = false;

        // Determine view type based on machine type
        if (machine.machine_type === 'core') {
            this._renderCoreInternal(machine, state);
        } else {
            this._renderHeartInternal(machine, state);
        }

        console.log('Internal view shown for:', machine.hostname);
    }

    /**
     * Vue interne du Core: toutes les aires avec leurs skills
     */
    _renderCoreInternal(machine, state) {
        const group = this.internalGroup;
        const areas = state.areas || [];
        const skills = state.skills || [];

        // Central Core representation (cyan dodecahedron)
        const coreGeom = new THREE.DodecahedronGeometry(4);
        const coreMat = new THREE.MeshPhongMaterial({
            color: 0x00d4aa,
            emissive: 0x00d4aa,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.8,
            wireframe: false,
        });
        const coreMesh = new THREE.Mesh(coreGeom, coreMat);
        coreMesh.name = 'core-center';
        coreMesh.userData = { type: 'core', nodeId: machine.node_id };
        group.add(coreMesh);

        // Add wireframe overlay
        const wireGeom = new THREE.DodecahedronGeometry(4.1);
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
        });
        const wireMesh = new THREE.Mesh(wireGeom, wireMat);
        coreMesh.add(wireMesh);

        // Heart representation (red icosahedron) - next to Core
        const heartGeom = new THREE.IcosahedronGeometry(2);
        const heartMat = new THREE.MeshPhongMaterial({
            color: 0xff3333,
            emissive: 0xff3333,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.9,
        });
        const heartMesh = new THREE.Mesh(heartGeom, heartMat);
        heartMesh.position.set(8, 0, 0); // À droite du Core
        heartMesh.name = 'heart';
        heartMesh.userData = { type: 'heart', nodeId: machine.node_id };
        group.add(heartMesh);

        // Heart glow
        const heartGlowGeom = new THREE.IcosahedronGeometry(2.3);
        const heartGlowMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
        });
        heartMesh.add(new THREE.Mesh(heartGlowGeom, heartGlowMat));

        // Label for Heart
        this._addLabel(heartMesh, 'Heart', 3);

        // Connection Core <-> Heart
        const coreHeartLine = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(8, 0, 0),
        ]);
        const coreHeartMat = new THREE.LineBasicMaterial({
            color: 0xff6666,
            transparent: true,
            opacity: 0.5,
        });
        group.add(new THREE.Line(coreHeartLine, coreHeartMat));

        // Place areas around the core in a circle
        const areaRadius = 20;
        const areaCount = areas.length || 1;

        areas.forEach((area, index) => {
            const angle = (index / areaCount) * Math.PI * 2;
            const x = Math.cos(angle) * areaRadius;
            const z = Math.sin(angle) * areaRadius;

            // Create area sphere
            const areaGeom = new THREE.SphereGeometry(3, 32, 32);
            const areaColor = this._parseColor(area.color || '#00d4aa');
            const areaStatus = this._getAreaStatus(area, skills);
            const statusColor = getStatusColor(areaStatus);

            const areaMat = new THREE.MeshPhongMaterial({
                color: statusColor,
                emissive: statusColor,
                emissiveIntensity: 0.2,
                transparent: true,
                opacity: 0.9,
            });

            const areaMesh = new THREE.Mesh(areaGeom, areaMat);
            areaMesh.position.set(x, 0, z);
            areaMesh.name = area.id;
            areaMesh.userData = {
                type: 'area',
                areaId: area.id,
                areaName: area.name,
                status: areaStatus,
            };
            group.add(areaMesh);
            this.areaMeshes.set(area.id, areaMesh);

            // Create connection line to core
            const lineGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(x, 0, z),
            ]);
            const lineMat = new THREE.LineBasicMaterial({
                color: 0x00d4aa,
                transparent: true,
                opacity: 0.3,
            });
            const line = new THREE.Line(lineGeom, lineMat);
            group.add(line);

            // Add label
            this._addLabel(areaMesh, area.name, 4);

            // Place skills around the area
            const areaSkills = skills.filter(s => s.brain_area === area.id);
            const skillRadius = 6;
            const skillCount = areaSkills.length || 1;

            areaSkills.forEach((skill, skillIndex) => {
                const skillAngle = (skillIndex / skillCount) * Math.PI * 2;
                const sx = x + Math.cos(skillAngle) * skillRadius;
                const sz = z + Math.sin(skillAngle) * skillRadius;

                const skillGeom = new THREE.SphereGeometry(1, 16, 16);
                const skillStatusColor = getStatusColor(skill.status);
                const skillMat = new THREE.MeshPhongMaterial({
                    color: skillStatusColor,
                    emissive: skillStatusColor,
                    emissiveIntensity: 0.3,
                });

                const skillMesh = new THREE.Mesh(skillGeom, skillMat);
                skillMesh.position.set(sx, 0, sz);
                skillMesh.name = skill.name;
                skillMesh.userData = {
                    type: 'skill',
                    skillName: skill.name,
                    status: skill.status,
                    brainArea: skill.brain_area,
                };
                group.add(skillMesh);
                this.skillMeshes.set(skill.name, skillMesh);

                // Connection to area
                const skillLineGeom = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(x, 0, z),
                    new THREE.Vector3(sx, 0, sz),
                ]);
                const skillLineMat = new THREE.LineBasicMaterial({
                    color: skillStatusColor,
                    transparent: true,
                    opacity: 0.5,
                });
                const skillLine = new THREE.Line(skillLineGeom, skillLineMat);
                group.add(skillLine);
            });
        });
    }

    /**
     * Vue interne d'un Heart: Heart central + skills connectés
     */
    _renderHeartInternal(machine, state) {
        const group = this.internalGroup;
        const skills = state.skills || [];

        // Central Heart representation (red icosahedron)
        const heartGeom = new THREE.IcosahedronGeometry(3);
        const heartColor = 0xff3333; // Rouge vif pour le Heart

        const heartMat = new THREE.MeshPhongMaterial({
            color: heartColor,
            emissive: heartColor,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.9,
        });

        this.heartMesh = new THREE.Mesh(heartGeom, heartMat);
        this.heartMesh.name = 'heart-center';

        // Add pulsing glow effect
        const glowGeom = new THREE.IcosahedronGeometry(3.5);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
        });
        const glowMesh = new THREE.Mesh(glowGeom, glowMat);
        this.heartMesh.add(glowMesh);
        this.heartMesh.userData = {
            type: 'heart',
            nodeId: machine.node_id,
            hostname: machine.hostname,
            status: machine.status || 'UP',
        };
        group.add(this.heartMesh);

        // Add label
        this._addLabel(this.heartMesh, machine.hostname, 4);

        // Filter skills on this machine
        const machineSkills = skills.filter(s =>
            s.deployed_on?.includes(machine.hostname) ||
            s.deployed_on?.includes(machine.node_id) ||
            machine.skills?.includes(s.name)
        );

        // If no specific skills, show all with unknown deployment
        const displaySkills = machineSkills.length > 0 ? machineSkills :
            skills.filter(s => !s.deployed_on || s.deployed_on.length === 0).slice(0, 5);

        // Place skills around the heart
        const skillRadius = 12;
        const skillCount = displaySkills.length || 1;

        displaySkills.forEach((skill, index) => {
            const angle = (index / skillCount) * Math.PI * 2;
            const x = Math.cos(angle) * skillRadius;
            const z = Math.sin(angle) * skillRadius;

            const skillGeom = new THREE.SphereGeometry(1.5, 16, 16);
            const skillStatusColor = getStatusColor(skill.status);
            const skillMat = new THREE.MeshPhongMaterial({
                color: skillStatusColor,
                emissive: skillStatusColor,
                emissiveIntensity: 0.3,
            });

            const skillMesh = new THREE.Mesh(skillGeom, skillMat);
            skillMesh.position.set(x, 0, z);
            skillMesh.name = skill.name;
            skillMesh.userData = {
                type: 'skill',
                skillName: skill.name,
                status: skill.status,
                brainArea: skill.brain_area,
            };
            group.add(skillMesh);
            this.skillMeshes.set(skill.name, skillMesh);

            // Connection to heart
            const lineGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(x, 0, z),
            ]);
            const lineMat = new THREE.LineBasicMaterial({
                color: skillStatusColor,
                transparent: true,
                opacity: 0.5,
            });
            const line = new THREE.Line(lineGeom, lineMat);
            group.add(line);

            // Add skill label
            this._addLabel(skillMesh, skill.name, 2.5);
        });

        // Add connection tube going "up" to represent network connection
        const tubePoints = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 15, 0),
        ];
        const tubeCurve = new THREE.CatmullRomCurve3(tubePoints);
        const tubeGeom = new THREE.TubeGeometry(tubeCurve, 20, 0.3, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
            color: 0x00d4aa,
            transparent: true,
            opacity: 0.3,
        });
        const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
        group.add(tubeMesh);
    }

    _addLabel(mesh, text, yOffset = 3) {
        // Create canvas for text
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(8, 2, 1);
        sprite.position.set(0, yOffset, 0);
        mesh.add(sprite);
    }

    _parseColor(color) {
        if (typeof color === 'number') return color;
        return parseInt(color.replace('#', ''), 16);
    }

    _getAreaStatus(area, skills) {
        const areaSkills = skills.filter(s => s.brain_area === area.id);
        if (areaSkills.length === 0) return 'UNKNOWN';

        // Priority: ERROR > WORKING > UP > DOWN
        if (areaSkills.some(s => s.status === 'ERROR')) return 'ERROR';
        if (areaSkills.some(s => s.status === 'WORKING')) return 'WORKING';
        if (areaSkills.some(s => s.status === 'UP')) return 'UP';
        return 'DOWN';
    }

    /**
     * Cache la vue interne et restore la vue réseau
     */
    hide() {
        if (this.internalGroup) {
            // Remove all children
            while (this.internalGroup.children.length > 0) {
                const child = this.internalGroup.children[0];
                this.internalGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
            this.internalGroup.visible = false;
        }

        this.areaMeshes.clear();
        this.skillMeshes.clear();
        this.heartMesh = null;
        this.currentNodeId = null;
        this.visible = false;

        // Show main network view
        if (this.scene.machinesGroup) {
            this.scene.machinesGroup.visible = true;
        }
        if (this.scene.connectionsGroup) {
            this.scene.connectionsGroup.visible = true;
        }

        console.log('Internal view hidden');
    }

    /**
     * Met à jour le statut d'un skill dans la vue interne
     */
    updateSkillStatus(skillName, status) {
        const mesh = this.skillMeshes.get(skillName);
        if (mesh) {
            const color = getStatusColor(status);
            mesh.material.color.setHex(color);
            mesh.material.emissive.setHex(color);
            mesh.userData.status = status;
        }
    }

    isVisible() {
        return this.visible;
    }

    getCurrentNodeId() {
        return this.currentNodeId;
    }
}

// Global instance
let internalRenderer = null;
