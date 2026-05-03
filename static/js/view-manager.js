/**
 * ViewManager - Orchestrate switching between 3 visualization views.
 *
 * Controls the three views:
 * - 'network': force-directed graph of all machines
 * - 'machine': machines with skills as satellites
 * - 'area': brain areas with skills in orbit
 */

class ViewManager {
    constructor(scene3d, getStateFn) {
        this.scene3d = scene3d;
        this.getStateFn = getStateFn;
        this.currentView = 'network';
        this.state = null;
        this.activeRenderer = null;
        this.renderers = {};
    }

    /**
     * Switch to a different view.
     *
     * Args:
     *     viewName: 'network' | 'machine' | 'area'
     */
    async switchTo(viewName) {
        if (!['network', 'machine', 'area'].includes(viewName)) {
            console.warn(`Invalid view: ${viewName}`);
            return;
        }

        if (this.currentView === viewName) return;

        // Dispose current view
        if (this.activeRenderer && this.activeRenderer.dispose) {
            this.activeRenderer.dispose();
        }

        // Clear groups
        while (this.scene3d.machinesGroup.children.length > 0) {
            this.scene3d.machinesGroup.remove(this.scene3d.machinesGroup.children[0]);
        }
        while (this.scene3d.connectionsGroup.children.length > 0) {
            this.scene3d.connectionsGroup.remove(this.scene3d.connectionsGroup.children[0]);
        }

        this.currentView = viewName;

        // Get latest state
        if (this.getStateFn) {
            this.state = this.getStateFn();
        }

        // Init new view
        if (viewName === 'network') {
            // Network view handled by existing renderers in app.js
            this.activeRenderer = null;
        } else if (viewName === 'machine') {
            if (!this.renderers.machine) {
                this.renderers.machine = new MachineViewRenderer(this.scene3d);
            }
            this.activeRenderer = this.renderers.machine;
            if (this.state) {
                this.activeRenderer.init(this.state);
            }
        } else if (viewName === 'area') {
            if (!this.renderers.area) {
                this.renderers.area = new AreaViewRenderer(this.scene3d);
            }
            this.activeRenderer = this.renderers.area;
            if (this.state) {
                this.activeRenderer.init(this.state);
            }
        }

        this._resetCamera(viewName);
        this._updateViewButton(viewName);
    }

    /**
     * Handle status update event from WebSocket.
     *
     * Args:
     *     data: {target, id, status}
     */
    handleStatusUpdate(data) {
        if (!this.activeRenderer || !this.activeRenderer.handleStatusUpdate) {
            return;
        }
        this.activeRenderer.handleStatusUpdate(data);
    }

    /**
     * Handle Redis event from WebSocket.
     *
     * Args:
     *     data: {event_type, node, data}
     */
    handleRedisEvent(data) {
        if (!this.activeRenderer || !this.activeRenderer.handleRedisEvent) {
            return;
        }
        this.activeRenderer.handleRedisEvent(data);
    }

    /**
     * Update state and refresh active view.
     *
     * Args:
     *     state: NetworkState object
     */
    updateState(state) {
        this.state = state;
        if (
            this.currentView !== 'network' &&
            this.activeRenderer &&
            this.activeRenderer.init
        ) {
            // Reinitialize renderer with new state
            this.activeRenderer.dispose();
            this.activeRenderer.init(state);
        }
    }

    /**
     * Reset camera position for the view.
     *
     * Args:
     *     viewName: view name
     */
    _resetCamera(viewName) {
        let pos, target;
        if (viewName === 'machine') {
            pos = new THREE.Vector3(0, 60, 90);
            target = new THREE.Vector3(0, 0, 0);
        } else if (viewName === 'area') {
            pos = new THREE.Vector3(0, 20, 80);
            target = new THREE.Vector3(0, 0, 0);
        } else {
            // network view - default
            pos = new THREE.Vector3(0, 30, 80);
            target = new THREE.Vector3(0, 0, 0);
        }

        this.scene3d.camera.position.copy(pos);
        this.scene3d.controls.target.copy(target);
        this.scene3d.controls.update();
    }

    /**
     * Update active button in UI.
     *
     * Args:
     *     viewName: view name
     */
    _updateViewButton(viewName) {
        document.querySelectorAll('#view-selector .view-btn').forEach((btn) => {
            btn.classList.remove('active');
        });
        const btnId = `btn-view-${viewName}`;
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.add('active');
        }
    }
}
