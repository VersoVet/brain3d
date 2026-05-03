/**
 * Brain3D - Main Application
 */

class Brain3DApp {
    constructor() {
        this.state = null;
        this.initialized = false;
    }

    async init() {
        console.log('Initializing Brain3D...');

        // Initialize scene
        const container = document.getElementById('canvas-container');
        scene3d = new Brain3DScene(container);

        // Initialize renderers
        machineRenderer = new MachineRenderer(scene3d);
        connectionRenderer = new ConnectionRenderer(scene3d);
        internalRenderer = new InternalViewRenderer(scene3d);

        // Initialize managers
        navigation = new NavigationManager(scene3d, this);
        ui = new UIManager();
        viewManager = new ViewManager(scene3d, this.getState.bind(this));

        // Start animations
        animationManager.start();

        // Setup WebSocket callbacks
        this._setupWebSocketCallbacks();

        // Connect WebSocket
        wsClient.connect();

        // Setup view buttons
        this._setupViewButtons();

        // Start physics update loop
        this._startPhysicsLoop();

        this.initialized = true;
        console.log('Brain3D initialized');
    }

    _setupViewButtons() {
        document.getElementById('btn-view-network')?.addEventListener('click', () => {
            viewManager?.switchTo('network');
        });
        document.getElementById('btn-view-machine')?.addEventListener('click', () => {
            viewManager?.switchTo('machine');
        });
        document.getElementById('btn-view-area')?.addEventListener('click', () => {
            viewManager?.switchTo('area');
        });
    }

    _setupWebSocketCallbacks() {
        // Initial state
        wsClient.on('onRefresh', (state) => {
            console.log('Received state:', state);
            this.state = state;
            this._renderState(state);
            if (viewManager) {
                viewManager.updateState(state);
            }
        });

        // Status updates
        wsClient.on('onStatusUpdate', (data) => {
            console.log('Status update:', data);
            this._handleStatusUpdate(data);
            if (viewManager) {
                viewManager.handleStatusUpdate(data);
            }
        });

        // Metrics updates
        wsClient.on('onMetricsUpdate', (data) => {
            console.log('Metrics update:', data);
            this._handleMetricsUpdate(data);
        });

        // Topology changes
        wsClient.on('onTopologyChange', (data) => {
            console.log('Topology change:', data);
            this._handleTopologyChange(data);
        });

        // Redis Message Bus events - for particle visualization
        wsClient.on('onRedisEvent', (data) => {
            // Forward to connection renderer for particle animation
            if (connectionRenderer) {
                connectionRenderer.handleRedisEvent(data);
            }
            if (viewManager) {
                viewManager.handleRedisEvent(data);
            }
        });
    }

    _renderState(state) {
        if (!state) return;

        console.log('Rendering state:', state);
        console.log('Machines count:', state.machines?.length);

        // Update stats
        ui?.updateStats(state);

        // Render machines
        if (state.machines) {
            console.log('Creating machines:', state.machines.map(m => m.hostname));
            machineRenderer.createAllMachines(state.machines);

            // Setup animations and initial metrics based on status
            state.machines.forEach(machine => {
                animationManager.updateFromStatus(machine.node_id, machine.status);

                // Apply initial metrics if available
                if (machine.metrics && machine.has_heart) {
                    machineRenderer.updateMetrics(machine.node_id, machine.metrics);
                }
            });

            // Create connections
            connectionRenderer.createAllConnections(state.machines);
        }
    }

    _handleStatusUpdate(data) {
        const { target, id, status } = data;

        if (target === 'machine' || target === 'skill') {
            // Update machine visual
            machineRenderer.updateMachine(id, { status });

            // Update animation
            animationManager.updateFromStatus(id, status);
        }

        // Update stats if we have full state
        if (this.state) {
            // Recalculate stats
            const machines = Object.values(this.state.machines || {});
            const skills = Object.values(this.state.skills || {});

            ui?.updateStats({
                total_machines: machines.length,
                total_skills: skills.length,
                skills_up: skills.filter(s => s.status === 'UP').length,
                skills_working: skills.filter(s => s.status === 'WORKING').length,
                skills_error: skills.filter(s => s.status === 'ERROR').length,
            });
        }
    }

    _handleMetricsUpdate(data) {
        const { node_id, metrics } = data;

        // Update machine data
        if (this.state?.machines) {
            const machine = this.state.machines.find(m => m.node_id === node_id);
            if (machine) {
                machine.metrics = metrics;

                // Update 3D metrics rings
                machineRenderer?.updateMetrics(node_id, metrics);

                // If this machine is selected, update info panel
                if (navigation?.selectedMachine === node_id) {
                    ui?.showMachineInfo(machine);
                }
            }
        }
    }

    _handleTopologyChange(data) {
        const { action, entity_type, entity } = data;

        if (entity_type === 'machine') {
            if (action === 'add') {
                machineRenderer.createMachine(entity);
                // Find core and create connection
                const core = this.state?.machines?.find(m => m.machine_type === 'core');
                if (core) {
                    connectionRenderer.createConnection(entity.node_id, core.node_id, {
                        dashed: entity.machine_type === 'network',
                    });
                }
            } else if (action === 'remove') {
                machineRenderer.removeMachine(entity.node_id);
            }
        }
    }

    _startPhysicsLoop() {
        let lastTime = performance.now();

        const update = () => {
            const now = performance.now();
            const deltaTime = (now - lastTime) / 1000;
            lastTime = now;

            // Only run physics for network view
            if (!viewManager || viewManager.currentView === 'network') {
                physics.update();
                machineRenderer.updateAllPositions();
                connectionRenderer.updateAllConnections();
                connectionRenderer.updateParticles(deltaTime);
            }

            requestAnimationFrame(update);
        };

        update();
    }

    // Public API for debugging
    getState() {
        return this.state;
    }

    refresh() {
        wsClient.requestRefresh();
    }
}

// Initialize app when DOM is ready
let app = null;

document.addEventListener('DOMContentLoaded', () => {
    app = new Brain3DApp();
    app.init();
});
