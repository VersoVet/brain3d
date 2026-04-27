/**
 * Brain3D - Animations (pulse, blink based on status)
 */

class AnimationManager {
    constructor() {
        this.animations = new Map(); // nodeId -> animationData
        this.time = 0;
        this.running = false;
    }

    start() {
        this.running = true;
        this._animate();
    }

    stop() {
        this.running = false;
    }

    _animate() {
        if (!this.running) return;

        this.time += 0.016; // ~60fps

        // Animate status-based animations (pulse, blink)
        this.animations.forEach((anim, nodeId) => {
            const mesh = machineRenderer?.getMesh(nodeId);
            if (!mesh) return;

            switch (anim.type) {
                case 'pulse-slow':
                    this._pulseSlow(mesh);
                    break;
                case 'pulse-fast':
                    this._pulseFast(mesh);
                    break;
                case 'blink':
                    this._blink(mesh);
                    break;
            }
        });

        // Animate warning rings on incoherent machines
        if (machineRenderer) {
            machineRenderer.animateWarnings(this.time);
        }

        // Animate Core electrons
        this._animateElectrons();

        requestAnimationFrame(() => this._animate());
    }

    _getMainMesh(mesh) {
        // Retourne le mesh principal (pour accéder au material)
        return mesh.userData?.mainMesh || mesh;
    }

    _pulseSlow(mesh) {
        const scale = 1 + Math.sin(this.time * CONFIG.ANIMATIONS.pulseSlowSpeed) * 0.05;
        mesh.scale.setScalar(scale);

        const mainMesh = this._getMainMesh(mesh);
        if (mainMesh.material) {
            const intensity = 0.2 + Math.sin(this.time * CONFIG.ANIMATIONS.pulseSlowSpeed) * 0.1;
            mainMesh.material.emissiveIntensity = intensity;
        }
    }

    _pulseFast(mesh) {
        const scale = 1 + Math.sin(this.time * CONFIG.ANIMATIONS.pulseFastSpeed) * 0.1;
        mesh.scale.setScalar(scale);

        const mainMesh = this._getMainMesh(mesh);
        if (mainMesh.material) {
            const intensity = 0.3 + Math.sin(this.time * CONFIG.ANIMATIONS.pulseFastSpeed) * 0.2;
            mainMesh.material.emissiveIntensity = intensity;
        }
    }

    _blink(mesh) {
        const mainMesh = this._getMainMesh(mesh);
        if (mainMesh.material) {
            const opacity = 0.5 + Math.abs(Math.sin(this.time * CONFIG.ANIMATIONS.blinkSpeed)) * 0.5;
            mainMesh.material.opacity = opacity;
        }
    }

    /**
     * Anime les électrons orbitant autour du Core (OnyxSoma)
     */
    _animateElectrons() {
        const coreMesh = machineRenderer?.getMesh('OnyxSoma');
        if (!coreMesh || !coreMesh.userData.electronGroup) return;

        const electronGroup = coreMesh.userData.electronGroup;

        electronGroup.children.forEach(child => {
            // Only animate the electron spheres, not the trail torus
            if (child.userData && child.userData.orbitRadius) {
                const { orbitRadius, speed, tiltX, tiltZ } = child.userData;
                child.userData.angle += speed * 0.02;

                const angle = child.userData.angle;
                child.position.x = Math.cos(angle) * orbitRadius;
                child.position.y = Math.sin(angle) * orbitRadius * Math.cos(tiltX);
                child.position.z = Math.sin(angle) * orbitRadius * Math.sin(tiltZ);
            }
        });

        // Rotation lente du groupe entier
        electronGroup.rotation.y += 0.002;
    }

    setAnimation(nodeId, type) {
        if (type === 'none' || !type) {
            this.animations.delete(nodeId);
            // Reset mesh
            const mesh = machineRenderer?.getMesh(nodeId);
            if (mesh) {
                mesh.scale.setScalar(1);
                const mainMesh = this._getMainMesh(mesh);
                if (mainMesh.material) {
                    mainMesh.material.emissiveIntensity = 0.2;
                    mainMesh.material.opacity = 1;
                }
            }
        } else {
            this.animations.set(nodeId, { type });
        }
    }

    updateFromStatus(nodeId, status) {
        const animationType = {
            'UP': 'pulse-slow',
            'WORKING': 'pulse-fast',
            'ERROR': 'blink',
            'DOWN': 'none',
            'UNKNOWN': 'none',
        }[status] || 'none';

        this.setAnimation(nodeId, animationType);
    }

    clear() {
        this.animations.clear();
    }
}

// Global instance
const animationManager = new AnimationManager();
