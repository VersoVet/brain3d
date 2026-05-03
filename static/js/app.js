/**
 * Brain3D - Main Application (v5.0 - Single network view)
 */

class Brain3DApp {
    constructor() {
        this.state = null;
    }

    async init() {
        console.log('Initializing Brain3D...');

        const container = document.getElementById('canvas-container');
        scene3d = new Brain3DScene(container);
        window.networkView = new NetworkView(scene3d);
        ui = new UIManager();

        this._setupWebSocketCallbacks();
        this._setupControls();
        wsClient.connect();

        console.log('Brain3D initialized');
    }

    _setupControls() {
        // Click on canvas
        scene3d.renderer.domElement.addEventListener('click', (e) => {
            window.networkView?.onClick(e);
        });

        // Touch: single tap
        let lastTap = 0;
        let lastTapPos = { x: 0, y: 0 };
        let tapTimer = null;

        scene3d.renderer.domElement.addEventListener('touchend', (e) => {
            if (e.changedTouches.length !== 1) return;
            const touch = e.changedTouches[0];
            const now = Date.now();
            const dt = now - lastTap;
            const dx = touch.clientX - lastTapPos.x;
            const dy = touch.clientY - lastTapPos.y;

            if (dt < 350 && Math.sqrt(dx * dx + dy * dy) < 40) {
                // Double-tap — ignore, just prevent zoom
                clearTimeout(tapTimer);
                lastTap = 0;
                return;
            }

            lastTap = now;
            lastTapPos = { x: touch.clientX, y: touch.clientY };

            clearTimeout(tapTimer);
            tapTimer = setTimeout(() => {
                window.networkView?.onClick({ clientX: touch.clientX, clientY: touch.clientY });
            }, 350);
        }, { passive: true });
    }

    _setupWebSocketCallbacks() {
        wsClient.on('onRefresh', (state) => {
            console.log('State received:', state.total_machines, 'machines,', state.total_skills, 'skills');
            this.state = state;
            window.networkView?.init(state);
            ui?.updateStats(state);
        });

        wsClient.on('onStatusUpdate', (data) => {
            window.networkView?.handleStatusUpdate(data);
            ui?.updateSkillStatus(data.id, data.status);
        });

        wsClient.on('onMetricsUpdate', (data) => {
            if (this.state?.machines) {
                const machine = this.state.machines.find((m) => m.node_id === data.node_id);
                if (machine) machine.metrics = data.metrics;
            }
        });

        wsClient.on('onRedisEvent', (data) => {
            window.networkView?.handleRedisEvent(data);
        });
    }

    getState() {
        return this.state;
    }
}

let app = null;
let scene3d = null;
let ui = null;

document.addEventListener('DOMContentLoaded', () => {
    app = new Brain3DApp();
    app.init();
});
