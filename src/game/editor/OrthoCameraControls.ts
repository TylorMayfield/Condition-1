import * as THREE from 'three';

/**
 * OrthoCameraControls - Handles Pan (Middle/Right Mouse) and Zoom (Wheel) for Orthographic Cameras.
 */
export class OrthoCameraControls {
    private camera: THREE.OrthographicCamera;
    private domElement: HTMLElement;

    private isPanning: boolean = false;
    private panStart = new THREE.Vector2();
    private panStartCamPos = new THREE.Vector3();

    private zoomSpeed: number = 0.001;
    private panSpeed: number = 1.0;

    // Bindings
    private boundMouseDown: (e: MouseEvent) => void;
    private boundMouseMove: (e: MouseEvent) => void;
    private boundMouseUp: (e: MouseEvent) => void;
    private boundWheel: (e: WheelEvent) => void;
    private boundContextMenu: (e: MouseEvent) => void;

    private isEnabled: boolean = false;

    constructor(camera: THREE.OrthographicCamera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.boundMouseDown = this.onMouseDown.bind(this);
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        this.boundWheel = this.onWheel.bind(this);
        this.boundContextMenu = (e) => e.preventDefault();
    }

    public enable() {
        if (this.isEnabled) return;
        this.isEnabled = true;

        this.domElement.addEventListener('mousedown', this.boundMouseDown);
        window.addEventListener('mousemove', this.boundMouseMove); // Window for smooth drag outside
        window.addEventListener('mouseup', this.boundMouseUp);
        this.domElement.addEventListener('wheel', this.boundWheel, { passive: false });
        this.domElement.addEventListener('contextmenu', this.boundContextMenu);
    }

    public disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;

        this.domElement.removeEventListener('mousedown', this.boundMouseDown);
        window.removeEventListener('mousemove', this.boundMouseMove);
        window.removeEventListener('mouseup', this.boundMouseUp);
        this.domElement.removeEventListener('wheel', this.boundWheel);
        this.domElement.removeEventListener('contextmenu', this.boundContextMenu);
        this.isPanning = false;
    }

    private onMouseDown(event: MouseEvent) {
        // Middle (1) or Right (2) button for panning
        if (event.button === 1 || event.button === 2) {
            this.isPanning = true;
            this.panStart.set(event.clientX, event.clientY);
            this.panStartCamPos.copy(this.camera.position);
            this.domElement.style.cursor = 'grab';
            event.preventDefault();
        }
    }

    private onMouseMove(event: MouseEvent) {
        if (!this.isPanning) return;

        const deltaX = (event.clientX - this.panStart.x) * this.panSpeed / this.camera.zoom;
        const deltaY = (event.clientY - this.panStart.y) * this.panSpeed / this.camera.zoom;

        // Calculate Right and Up vectors of the camera
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

        // Move camera opposite to drag
        const offset = new THREE.Vector3()
            .addScaledVector(right, -deltaX)
            .addScaledVector(up, deltaY); // Screen Y is down, usually? Wait. clientY increases down.
        // If I drag mouse DOWN (positive deltaY), I want to see content ABOVE. Camera moves DOWN.
        // So camera moves +Up * deltaY? No, if camera moves Up, content moves Down.
        // Correct: Camera moves +Up * deltaY (moves down in screen space??)
        // Let's verify: Mouse Down (+Y). I want to see upper content. Camera should move Up.
        // Yes.

        this.camera.position.copy(this.panStartCamPos).add(offset);
    }

    private onMouseUp(event: MouseEvent) {
        if (this.isPanning) {
            this.isPanning = false;
            this.domElement.style.cursor = 'default';
        }
    }

    private onWheel(event: WheelEvent) {
        event.preventDefault();

        // Zoom logic for Ortho: adjust .zoom prop
        const zoomDelta = event.deltaY * -this.zoomSpeed;

        // Multiplicative Zoom is smoother
        const scale = Math.pow(0.95, Math.sign(event.deltaY));

        this.camera.zoom *= scale;
        this.camera.zoom = Math.max(0.1, Math.min(50, this.camera.zoom));
        this.camera.updateProjectionMatrix();
    }
}
