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
        const canvas = scene3d.renderer.domElement;
        let downPos = { x: 0, y: 0 };
        let lastUpTime = 0;
        let lastUpPos = { x: 0, y: 0 };
        const DBL_DELAY = 300; // ms
        const DBL_DIST = 20;   // px

        // OrbitControls calls preventDefault() on pointerdown which suppresses
        // mousedown/mouseup/click/dblclick — use pointerdown/pointerup instead.
        canvas.addEventListener('pointerdown', (e) => {
            downPos = { x: e.clientX, y: e.clientY };
        });

        canvas.addEventListener('pointerup', (e) => {
            const dx = e.clientX - downPos.x;
            const dy = e.clientY - downPos.y;
            if (Math.sqrt(dx * dx + dy * dy) >= 5) return; // was a drag

            const now = Date.now();
            const dtLast = now - lastUpTime;
            const dxLast = e.clientX - lastUpPos.x;
            const dyLast = e.clientY - lastUpPos.y;

            if (dtLast < DBL_DELAY && Math.sqrt(dxLast * dxLast + dyLast * dyLast) < DBL_DIST) {
                // Double-click detected
                window.networkView?.onClick(e);
                lastUpTime = 0;
            } else {
                lastUpTime = now;
                lastUpPos = { x: e.clientX, y: e.clientY };
            }
        });
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

// scene3d declared in scene.js, ui declared in ui.js
let app = null;

document.addEventListener('DOMContentLoaded', () => {
    app = new Brain3DApp();
    app.init();
});
