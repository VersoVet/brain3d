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

        requestAnimationFrame(() => this._animate());
    }

    _pulseSlow(mesh) {
        const scale = 1 + Math.sin(this.time * CONFIG.ANIMATIONS.pulseSlowSpeed) * 0.05;
        mesh.scale.setScalar(scale);

        const intensity = 0.2 + Math.sin(this.time * CONFIG.ANIMATIONS.pulseSlowSpeed) * 0.1;
        mesh.material.emissiveIntensity = intensity;
    }

    _pulseFast(mesh) {
        const scale = 1 + Math.sin(this.time * CONFIG.ANIMATIONS.pulseFastSpeed) * 0.1;
        mesh.scale.setScalar(scale);

        const intensity = 0.3 + Math.sin(this.time * CONFIG.ANIMATIONS.pulseFastSpeed) * 0.2;
        mesh.material.emissiveIntensity = intensity;
    }

    _blink(mesh) {
        const opacity = 0.5 + Math.abs(Math.sin(this.time * CONFIG.ANIMATIONS.blinkSpeed)) * 0.5;
        mesh.material.opacity = opacity;
    }

    setAnimation(nodeId, type) {
        if (type === 'none' || !type) {
            this.animations.delete(nodeId);
            // Reset mesh
            const mesh = machineRenderer?.getMesh(nodeId);
            if (mesh) {
                mesh.scale.setScalar(1);
                mesh.material.emissiveIntensity = 0.2;
                mesh.material.opacity = 1;
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
