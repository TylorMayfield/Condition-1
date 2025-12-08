import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';

export class PlayerController {
    private game: Game;
    private gameObject: GameObject;

    // Settings
    private speed: number = 5;
    private runSpeed: number = 10;
    private crouchSpeed: number = 2.5;
    private jumpForce: number = 5;
    private sensitivity: number = 0.002;

    // State
    // State
    private rotation: { x: number, y: number } = { x: 0, y: 0 };
    private isCrouching: boolean = false;
    private lean: number = 0; // -1 (left) to 1 (right)
    private targetLean: number = 0;

    constructor(game: Game, gameObject: GameObject) {
        this.game = game;
        this.gameObject = gameObject;
    }

    public update(dt: number) {
        this.handleRotation();
        this.handleMovement();
        this.handleLeaning(dt);
        this.syncCamera(dt);
    }

    public applyRecoil(x: number, y: number) {
        this.rotation.x += x;
        this.rotation.y += y;
    }

    private handleRotation() {
        if (!this.game.input.isPointerLocked) return;

        const md = this.game.input.mouseDelta;
        this.rotation.y -= md.x * this.sensitivity;
        this.rotation.x -= md.y * this.sensitivity;
        this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));
    }

    private handleLeaning(dt: number) {
        this.targetLean = 0;
        if (this.game.input.getKey('KeyQ')) this.targetLean = 1; // Left (Positive Roll usually tilts left in some coord systems, let's test)
        if (this.game.input.getKey('KeyE')) this.targetLean = -1; // Right

        // Smoothly interpolate lean
        const leanSpeed = 5;
        this.lean += (this.targetLean - this.lean) * leanSpeed * dt;
    }

    private handleMovement() {
        const body = this.gameObject.body;
        if (!body) return;

        // Crouch Toggle
        if (this.game.input.getKey('ControlLeft') || this.game.input.getKey('KeyC')) {
            this.isCrouching = true;
        } else {
            this.isCrouching = false;
        }

        const isSprinting = this.game.input.getKey('ShiftLeft') && !this.isCrouching;
        const currentSpeed = this.isCrouching ? this.crouchSpeed : (isSprinting ? this.runSpeed : this.speed);

        // Direction
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);

        const velocity = new THREE.Vector3();
        if (this.game.input.getKey('KeyW')) velocity.add(forward);
        if (this.game.input.getKey('KeyS')) velocity.sub(forward);
        if (this.game.input.getKey('KeyD')) velocity.add(right);
        if (this.game.input.getKey('KeyA')) velocity.sub(right);

        if (velocity.length() > 0) velocity.normalize().multiplyScalar(currentSpeed);

        // Apply X/Z velocity
        body.velocity.x = velocity.x;
        body.velocity.z = velocity.z;

        // Emit Sound if moving and not crouching
        if (velocity.length() > 0) {
            const soundRadius = this.isCrouching ? 2 : (currentSpeed > this.speed ? 20 : 10); // Crouch=2, Walk=10, Run=20
            // Throttle this? SoundManager runs every frame or on event?
            // emitting every frame is fine for simple distance check, but might flood logs.
            // Ideally we do this on interval or just let it flood for POC.
            // Let's add a random chance to avoid constant spam in log
            if (Math.random() < 0.05) {
                this.game.soundManager.emitSound(
                    new THREE.Vector3(body.position.x, body.position.y, body.position.z),
                    soundRadius
                );
            }
        }

        // Jump
        if (this.game.input.getKey('Space')) {
            if (this.checkGrounded()) {
                body.velocity.y = this.jumpForce;
            }
        }
    }

    private checkGrounded(): boolean {
        // Robust check: collision with objects below
        // Raycast is good, but contact check is better for physics engines often.
        // For this POC, let's stick to Raycast but make it forgiving.
        if (!this.gameObject.body) return false;

        const start = this.gameObject.body.position.clone();
        const end = start.clone();
        end.y -= 0.6; // Slightly below the 0.5 radius

        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        // Mask: Everything (for now)
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

        return result.hasHit;
    }

    private syncCamera(_dt: number) {
        if (!this.gameObject.body) return;

        const heightOffset = this.isCrouching ? 0.2 : 0.6;

        // Base head position
        const headPos = new THREE.Vector3(
            this.gameObject.body.position.x,
            this.gameObject.body.position.y + heightOffset,
            this.gameObject.body.position.z
        );

        // Apply Lean Offset (Right vector * lean amount)
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
        const leanOffsetAmount = 0.5; // How far to lean
        headPos.add(right.multiplyScalar(-this.lean * leanOffsetAmount)); // -1 is Left(Q) -> Positive displacement? Wait.
        // If Q (target 1) is Left, we want to move LEFT.
        // Right vector is (1,0,0) world.
        // If we want LEFT, we sub right logic.
        // let's say Q -> lean=1. We want Left. Left is -Right.
        // So lean=1 should produce -Right.
        // current logic: right * (-1 * 1) = -Right. Correct.

        this.game.camera.position.set(headPos.x, headPos.y, headPos.z);

        // Apply Lean Rotation (Roll)
        // Check order 'YXZ'
        const rollAmount = 0.2; // Radians
        this.game.camera.rotation.set(
            this.rotation.x,
            this.rotation.y,
            this.lean * rollAmount, // Roll
            'YXZ'
        );
    }

    public getRotation() {
        return this.rotation;
    }

    public isMoving(): boolean {
        if (!this.gameObject.body) return false;
        return this.gameObject.body.velocity.length() > 0.1; // Threshold
    }

    public isSprinting(): boolean {
        return this.game.input.getKey('ShiftLeft') && !this.isCrouching && this.isMoving();
    }
}
