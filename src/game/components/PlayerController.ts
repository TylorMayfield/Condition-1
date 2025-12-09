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
    private crouchAmount: number = 0; // 0 = standing, 1 = fully crouched
    private targetCrouch: number = 0; // Target crouch value
    private lean: number = 0; // -1 (left) to 1 (right)
    private targetLean: number = 0;
    private isNoclip: boolean = false;

    constructor(game: Game, gameObject: GameObject) {
        this.game = game;
        this.gameObject = gameObject;
    }

    public update(dt: number) {
        this.handleRotation();
        this.handleMovement();
        this.handleLeaning(dt);
        this.handleCrouching(dt);
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

        // Toggle Noclip
        if (this.game.input.getKeyDown('KeyV')) {
            this.isNoclip = !this.isNoclip;
            if (this.isNoclip) {
                console.log('Noclip ENABLED');
                body.type = CANNON.Body.KINEMATIC; // Disable gravity/forces
                body.velocity.set(0, 0, 0);
            } else {
                console.log('Noclip DISABLED');
                body.type = CANNON.Body.DYNAMIC; // Re-enable physics
                body.mass = 1; // Ensure mass is restored (Kinematic might ignore mass)
                body.updateMassProperties(); // Recalculate inertia
                body.velocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);
            }
        }

        if (this.isNoclip) {
            this.handleNoclipMovement(body);
            return;
        }

        // Crouch Input (moved to handleCrouching method for smooth transition)
        // Just set the target state here
        if (this.game.input.getKey('KeyZ') || this.game.input.getKey('KeyC')) {
            this.targetCrouch = 1;
        } else {
            // Check for ceiling before allowing uncrouch
            if (this.crouchAmount > 0.5 && this.checkCeiling()) {
                // Can't stand up, keep crouching
                this.targetCrouch = 1;
            } else {
                this.targetCrouch = 0;
            }
        }

        this.isCrouching = this.crouchAmount > 0.5;

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

    private handleNoclipMovement(body: CANNON.Body) {
        const flySpeed = this.game.input.getKey('ShiftLeft') ? 50 : 20;

        // Use full camera rotation for flying (including pitch)
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.rotation.x, this.rotation.y, 0, 'YXZ'));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(this.rotation.x, this.rotation.y, 0, 'YXZ'));
        const up = new THREE.Vector3(0, 1, 0);

        const velocity = new THREE.Vector3();
        if (this.game.input.getKey('KeyW')) velocity.add(forward);
        if (this.game.input.getKey('KeyS')) velocity.sub(forward);
        if (this.game.input.getKey('KeyD')) velocity.add(right);
        if (this.game.input.getKey('KeyA')) velocity.sub(right);

        // Vertical strafe
        if (this.game.input.getKey('Space')) velocity.add(up);
        if (this.game.input.getKey('ControlLeft')) velocity.sub(up);

        if (velocity.length() > 0) velocity.normalize().multiplyScalar(flySpeed);

        // Override physics completely
        body.velocity.set(velocity.x, velocity.y, velocity.z);
        // Cancel gravity effect roughly by setting force to 0? 
        // Or just let velocity override happen after step... 
        // Cannon applies gravity as force. If we set velocity *after* step, it might be jittery.
        // But we are setting it here effectively "before" step if update is called before step.
        // Actually best is to set velocity and Maybe cancel gravity force if accessible.
        // But velocity overwrite is usually fine for simple noclip.
    }

    private checkGrounded(): boolean {
        if (!this.gameObject.body) return false;

        // Robust check: Use actual physics contacts
        const world = this.game.world;
        let isGrounded = false;
        const playerBody = this.gameObject.body;

        // Iterate over all contacts in the world
        for (const contact of world.contacts) {
            let normalY = 0;

            // Check if this contact involves the player
            if (contact.bi === playerBody) {
                // contact.ni points from bi to bj.
                // If bi is player, ni points AWAY from player (towards ground).
                // So reliable ground has ni.y < 0 (e.g. -1 for flat ground).
                normalY = -contact.ni.y;
            } else if (contact.bj === playerBody) {
                // contact.ni points from bi to bj.
                // If bj is player, ni points TOWARDS player (from ground).
                // So reliable ground has ni.y > 0 (e.g. 1 for flat ground).
                normalY = contact.ni.y;
            } else {
                continue; // Contact doesn't involve player
            }

            // Threshold: 0.5 means slope up to ~60 degrees is "ground"
            if (normalY > 0.5) {
                isGrounded = true;
                break;
            }
        }

        return isGrounded;
    }

    private handleCrouching(dt: number) {
        // Smoothly interpolate crouch
        const crouchSpeed = 8; // Faster than lean for responsive feel
        this.crouchAmount += (this.targetCrouch - this.crouchAmount) * crouchSpeed * dt;

        // Clamp to avoid overshoot
        this.crouchAmount = Math.max(0, Math.min(1, this.crouchAmount));
    }

    private checkCeiling(): boolean {
        // Check if there's a ceiling above preventing standing up
        if (!this.gameObject.body) return false;

        const start = this.gameObject.body.position.clone();
        const end = start.clone();
        end.y += 1.2; // Check ~standing height

        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

        return result.hasHit;
    }

    private syncCamera(_dt: number) {
        if (!this.gameObject.body) return;

        // Lerp height offset based on crouch amount (0.6 standing, 0.2 crouched)
        const standingHeight = 0.6;
        const crouchingHeight = 0.2;
        const heightOffset = standingHeight - (standingHeight - crouchingHeight) * this.crouchAmount;

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
