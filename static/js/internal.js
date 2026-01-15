/**
 * Brain3D - Internal View Renderer (Areas, Skills, Heart)
 * Affiche la vue interne d'une machine: skills LOCAUX du Heart
 * Compare avec Core pour afficher les incohérences
 */

class InternalViewRenderer {
    constructor(scene) {
        this.scene = scene;
        this.internalGroup = null;
        this.currentNodeId = null;
        this.areaMeshes = new Map();
        this.skillMeshes = new Map();
        this.missingSkillMeshes = new Map(); // Skills attendus mais absents
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
     * Vue interne unifiée: Heart (cube) au centre, aires autour, skills LOCAUX par aire
     * Utilise machine.local_skills (depuis Heart :8060) au lieu des skills du registre Core
     */
    _renderHeartCentral(machine, state) {
        const group = this.internalGroup;
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
            isCoherent: machine.is_coherent,
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

        // Anneau d'avertissement si incohérence
        if (machine.is_coherent === false && machine.incoherences?.length > 0) {
            const warningRing = this._createWarningRing(heartSize);
            this.heartMesh.add(warningRing);
        }

        // Label hostname + indicateur cohérence
        const label = machine.is_coherent === false
            ? `${machine.hostname} ⚠`
            : machine.hostname;
        this._addLabel(this.heartMesh, label, 4);

        // === GROUPER SKILLS LOCAUX PAR AIRE ===
        const localSkills = machine.local_skills || [];
        const skillsByArea = this._groupSkillsByArea(localSkills);

        // Incohérences pour afficher les skills manquants
        const incoherences = machine.incoherences || [];
        const missingSkills = incoherences
            .filter(i => i.type === 'missing_skill')
            .map(i => i.skill);
        const unexpectedSkills = new Set(
            incoherences.filter(i => i.type === 'unexpected_skill').map(i => i.skill)
        );

        // === AIRES EN CERCLE ===
        const areaRadius = 18;
        const areaIds = Object.keys(skillsByArea);
        const displayAreas = areaIds.length > 0 ? areaIds : ['external'];

        displayAreas.forEach((areaId, index) => {
            const angle = (index / displayAreas.length) * Math.PI * 2 - Math.PI / 2;
            const ax = Math.cos(angle) * areaRadius;
            const az = Math.sin(angle) * areaRadius;

            // Torus pour représenter l'aire
            const areaGeom = new THREE.TorusGeometry(2.5, 0.5, 16, 32);
            const areaSkills = skillsByArea[areaId] || [];
            const areaStatus = this._getLocalAreaStatus(areaSkills);
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
            areaMesh.name = areaId;
            areaMesh.userData = { type: 'area', areaId: areaId, areaName: this._formatAreaName(areaId) };
            group.add(areaMesh);
            this.areaMeshes.set(areaId, areaMesh);

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
            this._addLabel(areaMesh, this._formatAreaName(areaId), 3.5);

            // === SKILLS LOCAUX AUTOUR DE L'AIRE ===
            const skillRadius = 6;
            areaSkills.forEach((skill, si) => {
                const sAngle = (si / Math.max(areaSkills.length, 1)) * Math.PI * 2;
                const sx = ax + Math.cos(sAngle) * skillRadius;
                const sz = az + Math.sin(sAngle) * skillRadius;

                const skillGeom = new THREE.SphereGeometry(1.2, 16, 16);
                const skillColor = this._getLocalSkillColor(skill.status);
                const isUnexpected = unexpectedSkills.has(skill.name);

                const skillMat = new THREE.MeshPhongMaterial({
                    color: skillColor,
                    emissive: skillColor,
                    emissiveIntensity: 0.3,
                });

                const skillMesh = new THREE.Mesh(skillGeom, skillMat);
                skillMesh.position.set(sx, 0, sz);
                skillMesh.name = skill.name;
                skillMesh.userData = {
                    type: 'local_skill',
                    skillName: skill.name,
                    status: skill.status,
                    version: skill.version,
                    pid: skill.pid,
                    isUnexpected: isUnexpected,
                };
                group.add(skillMesh);
                this.skillMeshes.set(skill.name, skillMesh);

                // Anneau orange si skill inattendu (pas dans registre Core)
                if (isUnexpected) {
                    const warnRing = this._createSkillWarningRing(1.2);
                    skillMesh.add(warnRing);
                }

                // Connexion Aire -> Skill
                const sLineGeom = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(ax, 0, az),
                    new THREE.Vector3(sx, 0, sz),
                ]);
                const sLineMat = new THREE.LineBasicMaterial({
                    color: isUnexpected ? 0xff8800 : skillColor,
                    transparent: true,
                    opacity: 0.5,
                });
                group.add(new THREE.Line(sLineGeom, sLineMat));

                // Label skill
                const skillLabel = isUnexpected ? `${skill.name} ⚠` : skill.name;
                this._addLabel(skillMesh, skillLabel, 2);
            });
        });

        // === SKILLS MANQUANTS (fantômes) ===
        if (missingSkills.length > 0) {
            this._renderMissingSkills(group, missingSkills, areaRadius, displayAreas.length);
        }

        // Log cohérence
        console.log(`Internal view: ${localSkills.length} local skills, ${missingSkills.length} missing, ${unexpectedSkills.size} unexpected`);
    }

    /**
     * Groupe les skills locaux par brain_area
     */
    _groupSkillsByArea(localSkills) {
        const groups = {};
        for (const skill of localSkills) {
            const area = skill.brain_area || 'external';
            if (!groups[area]) groups[area] = [];
            groups[area].push(skill);
        }
        return groups;
    }

    /**
     * Calcule le statut d'une aire depuis les skills locaux
     */
    _getLocalAreaStatus(areaSkills) {
        if (areaSkills.length === 0) return 'UNKNOWN';

        // Priority: error > running > stopped
        if (areaSkills.some(s => s.status === 'error')) return 'ERROR';
        if (areaSkills.some(s => s.status === 'running')) return 'UP';
        if (areaSkills.some(s => s.status === 'loaded' || s.status === 'stopped')) return 'DOWN';
        return 'UNKNOWN';
    }

    /**
     * Convertit le statut local Heart en couleur
     */
    _getLocalSkillColor(status) {
        const statusMap = {
            'running': 0x00ff88,  // Vert - UP
            'loaded': 0x4488ff,   // Bleu - chargé mais pas actif
            'stopped': 0x555555,  // Gris - DOWN
            'error': 0xff8800,    // Orange - ERROR
        };
        return statusMap[status] || 0x4488ff;
    }

    /**
     * Formate le nom d'une aire (kebab-case -> Title Case)
     */
    _formatAreaName(areaId) {
        return areaId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Anneau rouge pulsant pour le Heart incohérent
     */
    _createWarningRing(baseSize) {
        const ringGeom = new THREE.TorusGeometry(baseSize * 0.9, 0.15, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.8,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.userData.isWarning = true;
        return ring;
    }

    /**
     * Anneau orange pour skill inattendu
     */
    _createSkillWarningRing(baseSize) {
        const ringGeom = new THREE.TorusGeometry(baseSize * 1.3, 0.08, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff8800,
            transparent: true,
            opacity: 0.7,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        return ring;
    }

    /**
     * Affiche les skills manquants comme sphères fantômes rouges
     */
    _renderMissingSkills(group, missingSkills, areaRadius, existingAreasCount) {
        // Position de la zone "manquants" (en bas)
        const missingAngle = Math.PI / 2; // En bas
        const mx = Math.cos(missingAngle) * (areaRadius + 8);
        const mz = Math.sin(missingAngle) * (areaRadius + 8);

        // Label zone
        const labelGeom = new THREE.SphereGeometry(0.5, 8, 8);
        const labelMat = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.5,
        });
        const labelMesh = new THREE.Mesh(labelGeom, labelMat);
        labelMesh.position.set(mx, 0, mz);
        group.add(labelMesh);
        this._addLabel(labelMesh, 'Manquants', 2);

        // Skills manquants en cercle
        const skillRadius = 5;
        missingSkills.forEach((skillName, si) => {
            const sAngle = (si / Math.max(missingSkills.length, 1)) * Math.PI * 2;
            const sx = mx + Math.cos(sAngle) * skillRadius;
            const sz = mz + Math.sin(sAngle) * skillRadius;

            // Sphère fantôme (wireframe rouge)
            const skillGeom = new THREE.SphereGeometry(1, 12, 12);
            const skillMat = new THREE.MeshBasicMaterial({
                color: 0xff4444,
                transparent: true,
                opacity: 0.3,
                wireframe: true,
            });

            const skillMesh = new THREE.Mesh(skillGeom, skillMat);
            skillMesh.position.set(sx, 0, sz);
            skillMesh.name = skillName;
            skillMesh.userData = {
                type: 'missing_skill',
                skillName: skillName,
                isMissing: true,
            };
            group.add(skillMesh);
            this.missingSkillMeshes.set(skillName, skillMesh);

            // Connexion pointillée vers le label
            const lineGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(mx, 0, mz),
                new THREE.Vector3(sx, 0, sz),
            ]);
            const lineMat = new THREE.LineDashedMaterial({
                color: 0xff4444,
                transparent: true,
                opacity: 0.5,
                dashSize: 0.5,
                gapSize: 0.3,
            });
            const line = new THREE.Line(lineGeom, lineMat);
            line.computeLineDistances();
            group.add(line);

            // Label skill manquant
            this._addLabel(skillMesh, skillName, 1.5);
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
        this.missingSkillMeshes.clear();
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
