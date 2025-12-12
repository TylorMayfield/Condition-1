import * as THREE from 'three';
import { Game } from '../engine/Game';

/**
 * Editor Camera - "Fly Mode" camera control similar to Hammer/Unity.
 * WASD to move, Right-click + Mouse to look.
 */
export class EditorCamera {
    private camera: THREE.PerspectiveCamera;
    private domElement: HTMLElement;

    // Config
    private moveSpeed: number = 50;
    private fastMoveMultiplier: number = 3;
    private rotateSpeed: number = 0.002;

    // State
    private isEnabled: boolean = false;
    private isRightMouseDown: boolean = false;
    private moveState = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false
    };

    // Euler angles for rotation (Pitch/Yaw)
    private euler = new THREE.Euler(0, 0, 0, 'YXZ');
    private readonly PI_2 = Math.PI / 2;

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
    }

    public enable(): void {
        if (this.isEnabled) return;
        this.isEnabled = true;

        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        this.domElement.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('mousemove', this.onMouseMove);
        this.domElement.addEventListener('contextmenu', this.onContextMenu);

        // Initial rotation
        this.euler.setFromQuaternion(this.camera.quaternion);
    }

    public disable(): void {
        if (!this.isEnabled) return;
        this.isEnabled = false;

        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        this.domElement.removeEventListener('contextmenu', this.onContextMenu);

        this.isRightMouseDown = false;
    }

    public update(dt: number): void {
        if (!this.isEnabled) return;

        // Movement
        const speed = this.moveSpeed * (this.moveState.forward ? this.fastMoveMultiplier : 1) * dt; // Hold shift check? Na, simplified.
        // Actually lets add shift modifier

        const actualSpeed = this.moveSpeed * (this.moveState.forward || this.moveState.backward || this.moveState.left || this.moveState.right || this.moveState.up || this.moveState.down ? 1 : 0) * dt;

        if (actualSpeed === 0) return;

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0);

        // Flatten movement plane if preferred? Hammer flies freely.

        const velocity = new THREE.Vector3();

        if (this.moveState.forward) velocity.add(forward);
        if (this.moveState.backward) velocity.sub(forward);
        if (this.moveState.left) velocity.sub(right);
        if (this.moveState.right) velocity.add(right);
        if (this.moveState.up) velocity.add(up);
        if (this.moveState.down) velocity.sub(up);

        velocity.normalize().multiplyScalar(this.moveSpeed * dt);

        // Boost
        if (this.moveState.forward && this.moveState.backward) return; // Cancel out

        this.camera.position.add(velocity);
    }

    private onKeyDown(event: KeyboardEvent): void {
        switch (event.code) {
            case 'KeyW': this.moveState.forward = true; break;
            case 'KeyS': this.moveState.backward = true; break;
            case 'KeyA': this.moveState.left = true; break;
            case 'KeyD': this.moveState.right = true; break;
            case 'KeyE': this.moveState.up = true; break;
            case 'KeyQ': this.moveState.down = true; break;
            case 'ShiftLeft': this.moveSpeed = 150; break;
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        switch (event.code) {
            case 'KeyW': this.moveState.forward = false; break;
            case 'KeyS': this.moveState.backward = false; break;
            case 'KeyA': this.moveState.left = false; break;
            case 'KeyD': this.moveState.right = false; break;
            case 'KeyE': this.moveState.up = false; break;
            case 'KeyQ': this.moveState.down = false; break;
            case 'ShiftLeft': this.moveSpeed = 50; break;
        }
    }

    private onMouseDown(event: MouseEvent): void {
        if (event.button === 2) {
            this.isRightMouseDown = true;
            this.domElement.style.cursor = 'none';
        }
    }

    private onMouseUp(event: MouseEvent): void {
        if (event.button === 2) {
            this.isRightMouseDown = false;
            this.domElement.style.cursor = 'default';
        }
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isRightMouseDown) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        this.euler.setFromQuaternion(this.camera.quaternion);

        this.euler.y -= movementX * this.rotateSpeed;
        this.euler.x -= movementY * this.rotateSpeed;

        this.euler.x = Math.max(-this.PI_2, Math.min(this.PI_2, this.euler.x));

        this.camera.quaternion.setFromEuler(this.euler);
    }

    private onContextMenu(event: MouseEvent): void {
        event.preventDefault();
    }
}
