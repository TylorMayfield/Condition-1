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
    private isProne: boolean = false; // New Prone state
    private crouchAmount: number = 0; // 0 = standing, 1 = crouching/prone
    private proneAmount: number = 0; // 0 = not prone, 1 = fully prone
    private targetCrouch: number = 0;
    private lastCrouchTime: number = 0; // For double-tap detection
    private lean: number = 0;
    private targetLean: number = 0;
    private isNoclip: boolean = false;
    private flashlight: THREE.SpotLight | null = null;
    private flashlightOn: boolean = false;
    private footstepTimer: number = 0; // Timer for footstep sounds

    constructor(game: Game, gameObject: GameObject) {
        this.game = game;
        this.gameObject = gameObject;
        this.initFlashlight();
    }

    public updatePhysics(dt: number) {
        this.handleMovement();
        this.handleCrouching(dt);
    }

    public updateLook(dt: number) {
        this.handleRotation();
        this.handleLeaning(dt);
        this.handleFlashlightToggle();
        this.handleInputToggles();
        this.syncCamera(dt);
    }

    private handleInputToggles() {
        const body = this.gameObject.body;
        if (!body) return;

        // Toggle Noclip
        if (this.game.input.getKeyDown('KeyV')) {
            this.isNoclip = !this.isNoclip;
            if (this.isNoclip) {
                console.log('Noclip ENABLED');
                body.type = CANNON.Body.KINEMATIC; // Disable gravity/forces
                body.collisionResponse = false; // Disable solver response
                body.velocity.set(0, 0, 0);
            } else {
                console.log('Noclip DISABLED');
                body.type = CANNON.Body.DYNAMIC; // Re-enable physics
                body.collisionResponse = true; // Re-enable solver response
                body.mass = 1; // Ensure mass is restored
                body.updateMassProperties(); // Recalculate inertia
                body.velocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);
                body.wakeUp(); // Ensure it wakes up
            }
        }
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
        if (!this.game.gameMode.canPlayerMove()) {
            this.targetLean = 0;
            // Allow smoothing back to 0
        } else {
            this.targetLean = 0;
            if (this.game.input.getKey('KeyQ')) this.targetLean = 1; // Left
            if (this.game.input.getKey('KeyE')) this.targetLean = -1; // Right
        }

        // Smoothly interpolate lean

        // Smoothly interpolate lean
        const leanSpeed = 5;
        this.lean += (this.targetLean - this.lean) * leanSpeed * dt;
    }

    private handleMovement() {
        // Round Start Check
        if (!this.game.gameMode.canPlayerMove()) {
            // Apply zero velocity to stop any rigid body momentum immediately if needed, 
            // or just return to let friction take over (but updating velocity to 0 checks input).
            // If we just return, momentum might carry us.
            // Better to explicitly damping or just zero out horizontal velocity if ground based.
            if (this.gameObject.body && this.checkGrounded()) {
                this.gameObject.body.velocity.x = 0;
                this.gameObject.body.velocity.z = 0;
            }
            return;
        }

        const body = this.gameObject.body;
        if (!body) return;



        if (this.isNoclip) {
            this.handleNoclipMovement(body);
            return;
        }

        // Mode Input Handling
        // DEBUG: Trace movement lock
        if (this.game.input.getAction('MoveForward') || this.game.input.getKey('KeyW')) {
            // console.log("Attempting MoveForward", { isNoclip: this.isNoclip, canMove: this.game.gameMode.canPlayerMove() });
        }
        if (this.game.input.getActionDown('Crouch')) {
            const now = performance.now();
            if (now - this.lastCrouchTime < 300) {
                // Double Tap -> Toggle Prone
                if (this.isProne) {
                    this.isProne = false;
                    this.targetCrouch = 1; // Go to crouch
                } else {
                    this.isProne = true;
                    this.targetCrouch = 1; // Prone implies low height
                }
            } else {
                // Single Tap -> Toggle Crouch
                if (this.isProne) {
                    // If prone, pressing input goes to Crouch
                    this.isProne = false;
                    this.targetCrouch = 1;
                } else {
                    if (this.targetCrouch > 0.5) {
                        // Stand up if clear
                        if (!this.checkCeiling()) this.targetCrouch = 0;
                    } else {
                        this.targetCrouch = 1;
                    }
                }
            }
            this.lastCrouchTime = now;
        }

        // Sprint cancels Prone/Crouch (if possible)
        if (this.game.input.getAction('Sprint')) {
            if (this.isProne) this.isProne = false;
            // Optional: cancel crouch on sprint? Usually yes.
            // if (this.targetCrouch > 0 && !this.checkCeiling()) this.targetCrouch = 0;
        }

        // Remove legacy hardcoded keys
        // if (this.game.input.getKeyDown('KeyZ')) ... 

        this.isCrouching = this.targetCrouch > 0.5 && !this.isProne;
        const currentSpeed = this.isProne ? 1.5 : (this.isCrouching ? this.crouchSpeed : (this.game.input.getAction('Sprint') ? this.runSpeed : this.speed));

        // Direction
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);

        const velocity = new THREE.Vector3();
        if (this.game.input.getAction('MoveForward')) velocity.add(forward);
        if (this.game.input.getAction('MoveBackward')) velocity.sub(forward);
        if (this.game.input.getAction('MoveRight')) velocity.add(right);
        if (this.game.input.getAction('MoveLeft')) velocity.sub(right); // Settings says A is Left

        // DEBUG: Trace movement inputs
        // if (this.game.input.getAction('MoveForward')) {
             // console.log(`[PlayerMovement] Input Active. Locked: ${this.game.input.isPointerLocked} CanMove: ${this.game.gameMode.canPlayerMove()} Velocity: ${velocity.length()}`);
        // }

        if (velocity.length() > 0) velocity.normalize().multiplyScalar(currentSpeed);

        // Apply X/Z velocity
        body.velocity.x = velocity.x;
        body.velocity.z = velocity.z;

        // Footstep sounds with proper timing
        if (velocity.length() > 0 && this.checkGrounded()) {
            // Calculate footstep interval based on speed
            const isRunning = currentSpeed > this.speed;
            const footstepInterval = this.isCrouching ? 0.6 : (isRunning ? 0.3 : 0.45);

            this.footstepTimer += 1 / 60; // Assume ~60fps, adjust if needed
            if (this.footstepTimer >= footstepInterval) {
                this.footstepTimer = 0;
                const pos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
                const volume = this.isCrouching ? 0.15 : (isRunning ? 0.5 : 0.3);
                this.game.soundManager.playFootstep(pos, volume);
            }
        } else {
            this.footstepTimer = 0; // Reset when not moving
        }

        // Jump
        // Jump
        if (this.game.input.getAction('Jump')) {
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
        const crouchSpeed = 8;
        this.crouchAmount += (this.targetCrouch - this.crouchAmount) * crouchSpeed * dt;
        this.crouchAmount = Math.max(0, Math.min(1, this.crouchAmount));

        // Smoothly interpolate prone
        const targetProne = this.isProne ? 1 : 0;
        this.proneAmount += (targetProne - this.proneAmount) * crouchSpeed * dt;
        this.proneAmount = Math.max(0, Math.min(1, this.proneAmount));
    }

    private checkCeiling(): boolean {
        // Check if there's a ceiling above preventing standing up
        if (!this.gameObject.body) return false;

        const start = this.gameObject.body.position.clone();
        // Start ray OUTSIDE the body sphere to avoid self-collision
        // Sphere radius is 0.5.
        start.y += 0.6;

        const end = start.clone();
        end.y += 1.0; // Check up to standing height + buffer relative to start

        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

        return result.hasHit;
    }

    private initFlashlight() {
        this.flashlight = new THREE.SpotLight(0xffffff, 2, 80, Math.PI / 4, 0.5, 1);
        this.flashlight.position.set(0, 0, 0);
        this.flashlight.castShadow = true;
        this.game.scene.add(this.flashlight);
        this.flashlight.target = this.game.camera;
    }

    private handleFlashlightToggle() {
        if (this.game.input.getActionDown('Flashlight') || this.game.input.getKeyDown('KeyF')) { // KeyF legacy check
            this.flashlightOn = !this.flashlightOn;
            if (this.flashlight) {
                this.flashlight.intensity = this.flashlightOn ? 2 : 0;
            }
        }

        // Update flashlight position/direction to match camera
        if (this.flashlight && this.flashlightOn) {
            this.flashlight.position.copy(this.game.camera.position);
            // Move it slightly offset?
            this.flashlight.position.add(new THREE.Vector3(0.2, -0.2, 0).applyQuaternion(this.game.camera.quaternion));

            // Set target
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.game.camera.quaternion);
            this.flashlight.target.position.copy(this.flashlight.position).add(forward);
            this.flashlight.target.updateMatrixWorld();
        }
    }


    private syncCamera(_dt: number) {
        if (!this.gameObject.body) return;

        // Lerp height offset based on crouch amount
        // Body Center is at ~0.5m (radius). 
        // Eye level target: ~1.7m (Standing), ~1.0m (Crouch), ~0.3m (Prone)
        // Offsets from body center:
        const standingHeight = 1.2; // 0.5 + 1.2 = 1.7m
        const crouchingHeight = 0.5; // 0.5 + 0.5 = 1.0m
        const proneHeight = -0.2; // 0.5 - 0.2 = 0.3m

        // Blend: First Stand -> Crouch, then Crouch -> Prone
        let currentHeight = standingHeight;
        if (this.proneAmount > 0) {
            currentHeight = crouchingHeight - (crouchingHeight - proneHeight) * this.proneAmount;
        } else {
            currentHeight = standingHeight - (standingHeight - crouchingHeight) * this.crouchAmount;
        }

        const heightOffset = currentHeight;

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

    public setSensitivity(value: number) {
        this.sensitivity = value;
    }

    public dispose() {
        // Stop any active effects or listeners
        // For now, no specific cleanup needed as inputs are global, 
        // but this allows Player.ts to call it without error.
    }
}
