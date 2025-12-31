/**
 * Brain3D - Three.js Scene Setup
 */

class Brain3DScene {
    constructor(container) {
        this.container = container;

        // Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Groups
        this.machinesGroup = null;
        this.connectionsGroup = null;
        this.labelsGroup = null;

        // State
        this.autoRotate = false;

        this._init();
    }

    _init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.SCENE.background);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            CONFIG.CAMERA.fov,
            window.innerWidth / window.innerHeight,
            CONFIG.CAMERA.near,
            CONFIG.CAMERA.far
        );
        this.camera.position.set(
            CONFIG.CAMERA.position.x,
            CONFIG.CAMERA.position.y,
            CONFIG.CAMERA.position.z
        );

        // Renderer - optimized for mobile
        this.renderer = new THREE.WebGLRenderer({
            antialias: window.devicePixelRatio < 2, // Disable AA on high-DPI for performance
            alpha: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Cap pixel ratio at 2 for performance on mobile
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 20;
        this.controls.maxDistance = 500;

        // Lights
        this._setupLights();

        // Grid
        this._setupGrid();

        // Groups
        this.machinesGroup = new THREE.Group();
        this.machinesGroup.name = 'machines';
        this.scene.add(this.machinesGroup);

        this.connectionsGroup = new THREE.Group();
        this.connectionsGroup.name = 'connections';
        this.scene.add(this.connectionsGroup);

        this.labelsGroup = new THREE.Group();
        this.labelsGroup.name = 'labels';
        this.scene.add(this.labelsGroup);

        // Events
        window.addEventListener('resize', () => this._onResize());

        // Start render loop
        this._animate();
    }

    _setupLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(
            CONFIG.SCENE.ambientLight,
            CONFIG.SCENE.ambientIntensity
        );
        this.scene.add(ambient);

        // Directional light
        const directional = new THREE.DirectionalLight(
            CONFIG.SCENE.directionalLight,
            CONFIG.SCENE.directionalIntensity
        );
        directional.position.set(50, 100, 50);
        this.scene.add(directional);

        // Point light at center (cyan glow)
        const pointLight = new THREE.PointLight(0x00d4aa, 0.5, 100);
        pointLight.position.set(0, 0, 0);
        this.scene.add(pointLight);
    }

    _setupGrid() {
        const grid = new THREE.GridHelper(200, 50, CONFIG.SCENE.gridColor, CONFIG.SCENE.gridColor);
        grid.position.y = -10;
        this.scene.add(grid);
    }

    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        // Auto rotate
        if (this.autoRotate) {
            this.machinesGroup.rotation.y += CONFIG.ANIMATIONS.rotationSpeed;
            this.connectionsGroup.rotation.y += CONFIG.ANIMATIONS.rotationSpeed;
        }

        // Update controls
        this.controls.update();

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    // Public API

    addMachine(mesh) {
        this.machinesGroup.add(mesh);
    }

    removeMachine(mesh) {
        this.machinesGroup.remove(mesh);
    }

    addConnection(line) {
        this.connectionsGroup.add(line);
    }

    removeConnection(line) {
        this.connectionsGroup.remove(line);
    }

    clearMachines() {
        while (this.machinesGroup.children.length > 0) {
            this.machinesGroup.remove(this.machinesGroup.children[0]);
        }
    }

    clearConnections() {
        while (this.connectionsGroup.children.length > 0) {
            this.connectionsGroup.remove(this.connectionsGroup.children[0]);
        }
    }

    getMachineByName(name) {
        return this.machinesGroup.children.find(m => m.name === name);
    }

    resetView() {
        this.camera.position.set(
            CONFIG.CAMERA.position.x,
            CONFIG.CAMERA.position.y,
            CONFIG.CAMERA.position.z
        );
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    focusOn(position, distance = 30) {
        // Smooth camera transition to focus on a position
        const target = new THREE.Vector3(position.x, position.y, position.z);
        this.controls.target.copy(target);

        const direction = new THREE.Vector3()
            .subVectors(this.camera.position, target)
            .normalize();

        this.camera.position.copy(
            target.clone().add(direction.multiplyScalar(distance))
        );

        this.controls.update();
    }

    toggleAutoRotate() {
        this.autoRotate = !this.autoRotate;
        return this.autoRotate;
    }

    // Raycasting for click detection
    getIntersectedObject(event) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, this.camera);

        const intersects = raycaster.intersectObjects(this.machinesGroup.children, true);

        if (intersects.length > 0) {
            // Find the parent mesh with userData
            let obj = intersects[0].object;
            while (obj && !obj.userData?.nodeId) {
                obj = obj.parent;
            }
            return obj;
        }

        return null;
    }
}

// Global instance (created in app.js)
let scene3d = null;
