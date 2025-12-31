/**
 * Brain3D - Navigation (click, drill-down, drag & drop)
 */

class NavigationManager {
    constructor(scene, app = null) {
        this.scene = scene;
        this.app = app; // Reference to main app for state access
        this.currentView = 'network'; // network, internal
        this.selectedMachine = null;
        this.isDragging = false;
        this.draggedNode = null;

        // Touch state for double-tap detection
        this.lastTapTime = 0;
        this.lastTapPosition = { x: 0, y: 0 };
        this.doubleTapDelay = 300; // ms
        this.doubleTapDistance = 30; // px

        this._setupEvents();
    }

    _setupEvents() {
        const canvas = this.scene.renderer.domElement;

        // Click for selection
        canvas.addEventListener('click', (e) => this._onClick(e));

        // Double-click for drill-down
        canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));

        // Drag & drop
        canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));

        // Touch support with passive: false for preventDefault to work
        canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });

        // Back button
        document.getElementById('btn-back')?.addEventListener('click', () => {
            this.goBack();
        });

        // Prevent context menu on long press (mobile)
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _onClick(event) {
        const obj = this.scene.getIntersectedObject(event);

        if (obj && obj.userData?.nodeId) {
            this.selectMachine(obj.userData.nodeId);
        } else {
            this.deselectMachine();
        }
    }

    _onDoubleClick(event) {
        const obj = this.scene.getIntersectedObject(event);

        if (obj && obj.userData?.nodeId) {
            this.drillDown(obj.userData.nodeId);
        }
    }

    _onMouseDown(event) {
        const obj = this.scene.getIntersectedObject(event);

        if (obj && obj.userData?.nodeId) {
            this.isDragging = true;
            this.draggedNode = obj.userData.nodeId;

            // Fix node position while dragging
            physics.fixNode(this.draggedNode, true);

            // Disable orbit controls while dragging
            this.scene.controls.enabled = false;
        }
    }

    _onMouseMove(event) {
        if (!this.isDragging || !this.draggedNode) return;

        // Calculate 3D position from mouse
        const position = this._getMousePosition3D(event);
        if (position) {
            physics.setNodePosition(this.draggedNode, position);
        }
    }

    _onMouseUp(event) {
        if (this.isDragging && this.draggedNode) {
            // Unfix node (unless it's core)
            const node = physics.getNode(this.draggedNode);
            if (node && node.type !== 'core') {
                physics.fixNode(this.draggedNode, false);
            }
        }

        this.isDragging = false;
        this.draggedNode = null;

        // Re-enable orbit controls
        this.scene.controls.enabled = true;
    }

    _onTouchStart(event) {
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            const now = Date.now();
            const timeDiff = now - this.lastTapTime;
            const dx = touch.clientX - this.lastTapPosition.x;
            const dy = touch.clientY - this.lastTapPosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Check for double-tap (drill-down)
            if (timeDiff < this.doubleTapDelay && distance < this.doubleTapDistance) {
                event.preventDefault();
                this._onDoubleTap({ clientX: touch.clientX, clientY: touch.clientY });
                this.lastTapTime = 0; // Reset
                return;
            }

            this.lastTapTime = now;
            this.lastTapPosition = { x: touch.clientX, y: touch.clientY };

            // Start potential drag
            this._onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    _onTouchMove(event) {
        if (event.touches.length === 1 && this.isDragging) {
            event.preventDefault();
            const touch = event.touches[0];
            this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    _onTouchEnd(event) {
        if (!this.isDragging && event.changedTouches.length === 1) {
            // Single tap - select machine
            const touch = event.changedTouches[0];
            this._onClick({ clientX: touch.clientX, clientY: touch.clientY });
        }
        this._onMouseUp(event);
    }

    _onDoubleTap(event) {
        const obj = this.scene.getIntersectedObject(event);
        if (obj && obj.userData?.nodeId) {
            this.drillDown(obj.userData.nodeId);
        }
    }

    _getMousePosition3D(event) {
        // Project mouse to 3D plane at y=0
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, this.scene.camera);

        // Intersect with horizontal plane
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();

        if (raycaster.ray.intersectPlane(plane, intersection)) {
            return {
                x: intersection.x,
                y: 0,
                z: intersection.z,
            };
        }

        return null;
    }

    selectMachine(nodeId) {
        // Deselect previous
        if (this.selectedMachine) {
            const prevMesh = machineRenderer?.getMesh(this.selectedMachine);
            if (prevMesh) {
                prevMesh.material.emissiveIntensity = 0.2;
            }
        }

        this.selectedMachine = nodeId;

        // Highlight selected
        const mesh = machineRenderer?.getMesh(nodeId);
        if (mesh) {
            mesh.material.emissiveIntensity = 0.5;

            // Show info panel
            ui?.showMachineInfo(mesh.userData.machineData);
        }

        // Notify WebSocket
        wsClient.setFocus(this.currentView, nodeId);
    }

    deselectMachine() {
        if (this.selectedMachine) {
            const mesh = machineRenderer?.getMesh(this.selectedMachine);
            if (mesh) {
                mesh.material.emissiveIntensity = 0.2;
            }
        }

        this.selectedMachine = null;
        ui?.hideInfoPanel();
    }

    drillDown(nodeId) {
        const mesh = machineRenderer?.getMesh(nodeId);
        if (!mesh) return;

        // Get state from app
        const state = this.app?.getState();
        if (!state) {
            console.error('No state available for drill-down');
            return;
        }

        // Update view state
        this.currentView = 'internal';
        this.selectedMachine = nodeId;

        // Show internal view
        internalRenderer?.show(nodeId, state);

        // Reset camera to view internal scene
        this.scene.camera.position.set(0, 40, 60);
        this.scene.controls.target.set(0, 0, 0);
        this.scene.controls.update();

        // Show breadcrumb
        ui?.showBreadcrumb(mesh.userData.hostname || nodeId);

        // Notify WebSocket
        wsClient.setFocus('internal', nodeId);

        console.log('Drill down to:', nodeId, 'type:', mesh.userData.type);
    }

    goBack() {
        if (this.currentView === 'internal') {
            this.currentView = 'network';

            // Hide internal view
            internalRenderer?.hide();

            // Reset camera
            this.scene.resetView();

            // Update UI
            ui?.hideBreadcrumb();
            this.deselectMachine();

            // Notify WebSocket
            wsClient.setFocus('network');

            console.log('Back to network view');
        }
    }

    getCurrentView() {
        return this.currentView;
    }
}

// Global instance (created in app.js)
let navigation = null;
