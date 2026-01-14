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

        // Render unified Heart view (same for all types)
        this._renderHeartCentral(machine, state);

        console.log('Internal view shown for:', machine.hostname);
    }

    /**
     * Vue interne unifiée: Heart (cube) au centre, aires autour, skills par aire
     */
    _renderHeartCentral(machine, state) {
        const group = this.internalGroup;
        const areas = state.areas || [];
        const skills = state.skills || [];
        const type = machine.machine_type || 'heart';

        // === HEART CENTRAL (CUBE) ===
        const heartSize = 4;
        const typeColors = {
            core: 0x00d4aa,    // Cyan
            forge: 0xaa44ff,   // Violet
            heart: 0x00ff88,   // Vert
        };
        const heartColor = typeColors[type] || typeColors.heart;

        // Cube central
        const heartGeom = new THREE.BoxGeometry(heartSize, heartSize, heartSize);
        const heartMat = new THREE.MeshPhongMaterial({
            color: heartColor,
            emissive: heartColor,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.9,
        });
        this.heartMesh = new THREE.Mesh(heartGeom, heartMat);
        this.heartMesh.name = 'heart-center';
        this.heartMesh.userData = {
            type: 'heart',
            nodeId: machine.node_id,
            hostname: machine.hostname,
            machineType: type,
        };
        group.add(this.heartMesh);

        // Wireframe
        const wireGeom = new THREE.BoxGeometry(heartSize * 1.05, heartSize * 1.05, heartSize * 1.05);
        const wireMat = new THREE.MeshBasicMaterial({
            color: heartColor,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
        });
        this.heartMesh.add(new THREE.Mesh(wireGeom, wireMat));

        // Glow
        const glowGeom = new THREE.BoxGeometry(heartSize * 1.4, heartSize * 1.4, heartSize * 1.4);
        const glowMat = new THREE.MeshBasicMaterial({
            color: heartColor,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide,
        });
        this.heartMesh.add(new THREE.Mesh(glowGeom, glowMat));

        // Label hostname
        this._addLabel(this.heartMesh, machine.hostname, 4);

        // === AIRES EN CERCLE ===
        const areaRadius = 18;
        const displayAreas = areas.length > 0 ? areas : [{ id: 'default', name: 'Skills' }];

        displayAreas.forEach((area, index) => {
            const angle = (index / displayAreas.length) * Math.PI * 2 - Math.PI / 2;
            const ax = Math.cos(angle) * areaRadius;
            const az = Math.sin(angle) * areaRadius;

            // Torus pour représenter l'aire
            const areaGeom = new THREE.TorusGeometry(2.5, 0.5, 16, 32);
            const areaColor = this._parseColor(area.color || '#00d4aa');
            const areaStatus = this._getAreaStatus(area, skills);
            const statusColor = getStatusColor(areaStatus);

            const areaMat = new THREE.MeshPhongMaterial({
                color: statusColor,
                emissive: statusColor,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 0.8,
            });

            const areaMesh = new THREE.Mesh(areaGeom, areaMat);
            areaMesh.position.set(ax, 0, az);
            areaMesh.rotation.x = Math.PI / 2;
            areaMesh.name = area.id;
            areaMesh.userData = { type: 'area', areaId: area.id, areaName: area.name };
            group.add(areaMesh);
            this.areaMeshes.set(area.id, areaMesh);

            // Connexion Heart -> Aire
            const lineGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(ax, 0, az),
            ]);
            const lineMat = new THREE.LineBasicMaterial({
                color: heartColor,
                transparent: true,
                opacity: 0.3,
            });
            group.add(new THREE.Line(lineGeom, lineMat));

            // Label aire
            this._addLabel(areaMesh, area.name, 3.5);

            // === SKILLS AUTOUR DE L'AIRE ===
            const areaSkills = area.id === 'default'
                ? skills.filter(s =>
                    s.deployed_on?.includes(machine.hostname) ||
                    s.deployed_on?.includes(machine.node_id) ||
                    machine.skills?.includes(s.name)
                  )
                : skills.filter(s => s.brain_area === area.id);

            const skillRadius = 6;
            areaSkills.forEach((skill, si) => {
                const sAngle = (si / Math.max(areaSkills.length, 1)) * Math.PI * 2;
                const sx = ax + Math.cos(sAngle) * skillRadius;
                const sz = az + Math.sin(sAngle) * skillRadius;

                const skillGeom = new THREE.SphereGeometry(1.2, 16, 16);
                const skillColor = getStatusColor(skill.status);
                const skillMat = new THREE.MeshPhongMaterial({
                    color: skillColor,
                    emissive: skillColor,
                    emissiveIntensity: 0.3,
                });

                const skillMesh = new THREE.Mesh(skillGeom, skillMat);
                skillMesh.position.set(sx, 0, sz);
                skillMesh.name = skill.name;
                skillMesh.userData = {
                    type: 'skill',
                    skillName: skill.name,
                    status: skill.status,
                };
                group.add(skillMesh);
                this.skillMeshes.set(skill.name, skillMesh);

                // Connexion Aire -> Skill
                const sLineGeom = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(ax, 0, az),
                    new THREE.Vector3(sx, 0, sz),
                ]);
                const sLineMat = new THREE.LineBasicMaterial({
                    color: skillColor,
                    transparent: true,
                    opacity: 0.5,
                });
                group.add(new THREE.Line(sLineGeom, sLineMat));

                // Label skill
                this._addLabel(skillMesh, skill.name, 2);
            });
        });
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
