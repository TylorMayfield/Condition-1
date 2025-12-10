import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { Enemy } from '../Enemy';
import { Game } from '../../engine/Game';

export class AIMovement {
    private owner: Enemy;
    private game: Game;
    private moveSpeed: number = 5; // Base walk speed
    private runSpeed: number = 8; // Run speed
    private acceleration: number = 25; // Force-based acceleration
    private isRunning: boolean = false;
    private currentTarget: THREE.Vector3 | null = null;

    // Recast
    private useRecast: boolean = false;


    constructor(owner: Enemy) {
        this.owner = owner;
        this.game = owner.game; // Access game through owner
    }

    public setSpeed(speed: number) {
        this.moveSpeed = speed;
        this.runSpeed = speed * 1.6; // Run is 60% faster
    }

    public setRunning(running: boolean) {
        this.isRunning = running;

        // Update Recast Agent Speed
        if (this.useRecast && this.game.recastNav && this.owner.ai) {
            const speed = this.isRunning ? this.runSpeed : this.moveSpeed;
            this.game.recastNav.setAgentMaxSpeed(this.owner.ai.entityId, speed);
        }
    }

    public moveTo(targetPos: THREE.Vector3) {
        if (!this.owner.body) return;
        this.currentTarget = targetPos.clone();

        // Integrate with Recast
        if (this.owner.ai && this.owner.ai.useRecast && this.game.recastNav) {
            // Update target periodically or if changed significantly? 
            // Recast handles this efficiently, just call it.
            const success = this.game.recastNav.setAgentTarget(this.owner.ai.entityId, targetPos);
            if (success) {
                this.useRecast = true;
                // console.log(`[AIMovement] Set target for ${this.owner.ai.entityId} to ${targetPos.toArray()}`);
            } else {
                console.warn(`[AIMovement] Failed to set target for ${this.owner.ai.entityId}`);
                this.useRecast = false;
            }
        } else {
            this.useRecast = false;
            // console.log(`[AIMovement] Fallback: useRecast=${this.owner.ai?.useRecast}, recastNav=${!!this.game.recastNav}`);
        }
    }

    public stop() {
        if (!this.owner.body) return;
        this.currentTarget = null;

        // Stop Recast agent
        if (this.useRecast && this.game.recastNav && this.owner.ai) {
            const myPos = this.game.recastNav.getAgentPosition(this.owner.ai.entityId);
            if (myPos) {
                this.game.recastNav.setAgentTarget(this.owner.ai.entityId, myPos); // Set target to current pos to stop
            }
        }

        // Apply deceleration force
        const decelForce = 20;
        const forceX = -this.owner.body.velocity.x * decelForce;
        const forceZ = -this.owner.body.velocity.z * decelForce;

        this.owner.body.applyForce(
            new CANNON.Vec3(forceX, 0, forceZ),
            this.owner.body.position
        );
    }

    public update() {
        if (!this.owner.body) return;
        if (this.owner.body.sleepState === CANNON.Body.SLEEPING) this.owner.body.wakeUp();

        // If using Recast, get velocity from agent
        if (this.useRecast && this.game.recastNav && this.owner.ai) {
            const agentVel = this.game.recastNav.getAgentVelocity(this.owner.ai.entityId);
            if (agentVel) {
                // DEBUG: Log velocity occasionally
                if (Math.random() < 0.01 && agentVel.length() > 0.1) {
                    console.log(`[AIMovement] Agent ${this.owner.ai.entityId} Vel: ${agentVel.toArray()}`);
                }

                // Apply agent velocity to physics body
                // Recast Agent speed is already governed by its config, but we might want to override max speed based on run/walk?
                // Recast doesn't easily support dynamic max speed per frame without modifying agent params.
                // For now, trust Recast velocity direction, but maybe scale magnitude if we want to sprint?

                // Let's just use the velocity directly for smooth movement
                // But we need to apply it as force or set velocity?
                // Setting velocity directly overrides physics (collisions). 
                // Better to use ApplyForce to reach target velocity.

                const factor = this.isRunning ? 1.5 : 1.0;
                const desiredVelX = agentVel.x * factor;
                const desiredVelZ = agentVel.z * factor;

                const velDiffX = desiredVelX - this.owner.body.velocity.x;
                const velDiffZ = desiredVelZ - this.owner.body.velocity.z;

                const forceX = velDiffX * this.acceleration;
                const forceZ = velDiffZ * this.acceleration;

                this.owner.body.applyForce(
                    new CANNON.Vec3(forceX, 0, forceZ),
                    this.owner.body.position
                );

                // Look where we are going
                if (agentVel.lengthSq() > 0.1) {
                    const lookPos = new THREE.Vector3(
                        this.owner.body.position.x + agentVel.x,
                        this.owner.body.position.y,
                        this.owner.body.position.z + agentVel.z
                    );
                    this.lookAt(lookPos);
                }

                // CRITICAL: Sync agent position to physics body
                // If we don't do this, the Recast agent walks away from the physics body (ghosting).
                // But we only want to correct it if it drifts too far? 
                // Creating a feedback loop: Agent drives Body, Body constrains Agent.
                // Teleporting every frame might reset velocity?
                // Recast docs say teleport resets velocity.
                // So maybe we only teleport if error is large?
                // Or maybe we DONT teleport, but Recast should know where we are?
                // Actually, standard practice in Recast + Physics:
                // 1. Agent requests velocity.
                // 2. Physics applies force.
                // 3. Physics moves body.
                // 4. Update Agent position to Body position (so next frame starts correctly).

                // However, if teleport resets velocity, the agent will stop.
                // We want to update the agent's *position* without stopping it.
                // Does Recast have separate update position vs teleport?
                // CrowdAgent usually has `position` property but it might be read-only proxy.
                // We used `teleport` in RecastNavigation. 

                // Let's try syncing periodically or if distance is large.
                const navPos = this.game.recastNav.getAgentPosition(this.owner.ai.entityId);
                if (navPos) {
                    const distSq = navPos.distanceToSquared(this.owner.body.position as any);
                    if (distSq > 0.25) { // Tolerance 0.5m (0.25 sq)
                        // console.log("Drift detected, syncing agent...");
                        const physicsPos = new THREE.Vector3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z);
                        this.game.recastNav.updateAgentPosition(this.owner.ai.entityId, physicsPos);
                    }
                }
            } else {
                if (Math.random() < 0.01) console.log(`[AIMovement] Agent ${this.owner.ai.entityId} has NO velocity from Recast`);
            }
        } else if (this.currentTarget) {
            // Fallback direct movement (if Recast failed or not ready)
            this.moveDirectly(this.currentTarget);
        }
    }

    public strafe(direction: THREE.Vector3, speedMultiplier: number = 0.7) {
        if (!this.owner.body) return;

        const dir = direction.normalize();
        const targetSpeed = this.moveSpeed * speedMultiplier;

        const desiredVelX = dir.x * targetSpeed;
        const desiredVelZ = dir.z * targetSpeed;

        const velDiffX = desiredVelX - this.owner.body.velocity.x;
        const velDiffZ = desiredVelZ - this.owner.body.velocity.z;

        const forceX = velDiffX * this.acceleration;
        const forceZ = velDiffZ * this.acceleration;

        this.owner.body.applyForce(
            new CANNON.Vec3(forceX, 0, forceZ),
            this.owner.body.position
        );
    }

    private moveDirectly(targetPos: THREE.Vector3) {
        if (!this.owner.body) return;

        const ownerPos = new THREE.Vector3(
            this.owner.body.position.x,
            this.owner.body.position.y,
            this.owner.body.position.z
        );

        const dir = new THREE.Vector3(
            targetPos.x - ownerPos.x,
            0,
            targetPos.z - ownerPos.z
        );
        const distance = dir.length();

        if (distance < 1.0) {
            this.stop(); // Reached target
            return;
        }

        dir.normalize();

        // Simple obstacle avoidance could go here, but let's assume Recast is primary.

        const targetSpeed = this.isRunning ? this.runSpeed : this.moveSpeed;

        const desiredVelX = dir.x * targetSpeed;
        const desiredVelZ = dir.z * targetSpeed;

        const velDiffX = desiredVelX - this.owner.body.velocity.x;
        const velDiffZ = desiredVelZ - this.owner.body.velocity.z;

        const forceX = velDiffX * this.acceleration;
        const forceZ = velDiffZ * this.acceleration;

        this.owner.body.applyForce(
            new CANNON.Vec3(forceX, 0, forceZ),
            this.owner.body.position
        );

        this.lookAt(targetPos);
    }

    public lookAt(targetPos: THREE.Vector3) {
        if (!this.owner.mesh) return;

        const dx = targetPos.x - this.owner.mesh.position.x;
        const dz = targetPos.z - this.owner.mesh.position.z;

        if (dx * dx + dz * dz < 0.01) return;

        const angle = Math.atan2(dx, dz);
        this.owner.mesh.rotation.set(0, angle, 0);
    }

    public isMoving(): boolean {
        if (!this.owner.body) return false;
        const v = this.owner.body.velocity;
        return (v.x * v.x + v.z * v.z) > 0.1;
    }

    public isGrounded(): boolean {
        if (!this.owner.body) return false;
        const start = new CANNON.Vec3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z);
        const end = new CANNON.Vec3(start.x, start.y - 1.1, start.z);
        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });
        return result.hasHit;
    }

    public jump() {
        if (!this.owner.body) return;
        this.owner.body.velocity.y = 5;
    }
}
