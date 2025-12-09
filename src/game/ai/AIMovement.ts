import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Enemy } from '../Enemy';
import { Game } from '../../engine/Game';

export class AIMovement {
    private owner: Enemy;
    private game: Game;
    private moveSpeed: number = 5; // Base walk speed (increased from 3)
    private runSpeed: number = 8; // Run speed
    private acceleration: number = 25; // Force-based acceleration
    private isRunning: boolean = false;
    private currentTarget: THREE.Vector3 | null = null;
    private avoidanceRadius: number = 1.5; // How far to check for obstacles

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
    }

    public moveTowards(targetPos: THREE.Vector3) {
        if (!this.owner.body) return;
        this.currentTarget = targetPos.clone();

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

        if (distance < 0.1) {
            this.stop();
            return;
        }

        dir.normalize();

        // Apply obstacle avoidance
        const avoidanceDir = this.calculateAvoidance(ownerPos, dir);
        const finalDir = avoidanceDir.normalize();

        const targetSpeed = this.isRunning ? this.runSpeed : this.moveSpeed;

        // Calculate desired velocity
        const desiredVelX = finalDir.x * targetSpeed;
        const desiredVelZ = finalDir.z * targetSpeed;

        // Calculate velocity difference
        const velDiffX = desiredVelX - this.owner.body.velocity.x;
        const velDiffZ = desiredVelZ - this.owner.body.velocity.z;

        // Apply force to reach desired velocity (physics-based acceleration)
        const forceX = velDiffX * this.acceleration;
        const forceZ = velDiffZ * this.acceleration;

        this.owner.body.applyForce(
            new CANNON.Vec3(forceX, 0, forceZ),
            this.owner.body.position
        );
    }

    /**
     * Calculate avoidance direction to navigate around obstacles
     */
    private calculateAvoidance(currentPos: THREE.Vector3, desiredDir: THREE.Vector3): THREE.Vector3 {
        const avoidanceForce = new THREE.Vector3(0, 0, 0);
        const checkDistance = this.avoidanceRadius + 0.5;

        // Check for obstacles ahead
        const aheadPos = currentPos.clone().add(desiredDir.clone().multiplyScalar(checkDistance));

        // Raycast forward to detect obstacles
        const ray = new CANNON.Ray(
            new CANNON.Vec3(currentPos.x, currentPos.y + 0.5, currentPos.z),
            new CANNON.Vec3(aheadPos.x, aheadPos.y + 0.5, aheadPos.z)
        );
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

        if (result.hasHit && result.hitPointWorld) {
            const hitPos = new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z);
            const distToHit = currentPos.distanceTo(hitPos);

            if (distToHit < checkDistance) {
                // Obstacle detected, calculate avoidance
                const toObstacle = new THREE.Vector3().subVectors(hitPos, currentPos).normalize();

                // Calculate perpendicular direction (steer around obstacle)
                const perp = new THREE.Vector3(-toObstacle.z, 0, toObstacle.x);

                // Choose direction that's closer to desired direction
                const perp1 = perp.clone();
                const perp2 = perp.clone().multiplyScalar(-1);

                const dot1 = perp1.dot(desiredDir);
                const dot2 = perp2.dot(desiredDir);

                const avoidanceDir = dot1 > dot2 ? perp1 : perp2;

                // Blend avoidance with desired direction
                const avoidanceWeight = 1.0 - (distToHit / checkDistance);
                avoidanceForce.add(avoidanceDir.multiplyScalar(avoidanceWeight * 2.0));
                avoidanceForce.add(desiredDir.multiplyScalar(1.0 - avoidanceWeight));

                return avoidanceForce;
            }
        }

        // Also check left and right for nearby obstacles
        const leftCheck = currentPos.clone().add(
            new THREE.Vector3(-desiredDir.z, 0, desiredDir.x).multiplyScalar(this.avoidanceRadius)
        );
        const rightCheck = currentPos.clone().add(
            new THREE.Vector3(desiredDir.z, 0, -desiredDir.x).multiplyScalar(this.avoidanceRadius)
        );

        // Simple obstacle check using raycasts
        const leftRay = new CANNON.Ray(
            new CANNON.Vec3(currentPos.x, currentPos.y + 0.5, currentPos.z),
            new CANNON.Vec3(leftCheck.x, leftCheck.y + 0.5, leftCheck.z)
        );
        const rightRay = new CANNON.Ray(
            new CANNON.Vec3(currentPos.x, currentPos.y + 0.5, currentPos.z),
            new CANNON.Vec3(rightCheck.x, rightCheck.y + 0.5, rightCheck.z)
        );

        const leftResult = new CANNON.RaycastResult();
        const rightResult = new CANNON.RaycastResult();
        leftRay.intersectWorld(this.game.world, { skipBackfaces: true, result: leftResult });
        rightRay.intersectWorld(this.game.world, { skipBackfaces: true, result: rightResult });

        // Prefer direction with more space
        if (leftResult.hasHit && leftResult.hitPointWorld && rightResult.hasHit && rightResult.hitPointWorld) {
            const leftDist = currentPos.distanceTo(new THREE.Vector3(leftResult.hitPointWorld.x, leftResult.hitPointWorld.y, leftResult.hitPointWorld.z));
            const rightDist = currentPos.distanceTo(new THREE.Vector3(rightResult.hitPointWorld.x, rightResult.hitPointWorld.y, rightResult.hitPointWorld.z));

            if (rightDist > leftDist) {
                avoidanceForce.add(new THREE.Vector3(desiredDir.z, 0, -desiredDir.x).multiplyScalar(0.3));
            } else {
                avoidanceForce.add(new THREE.Vector3(-desiredDir.z, 0, desiredDir.x).multiplyScalar(0.3));
            }
        } else if (leftResult.hasHit && leftResult.hitPointWorld) {
            avoidanceForce.add(new THREE.Vector3(desiredDir.z, 0, -desiredDir.x).multiplyScalar(0.3));
        } else if (rightResult.hasHit && rightResult.hitPointWorld) {
            avoidanceForce.add(new THREE.Vector3(-desiredDir.z, 0, desiredDir.x).multiplyScalar(0.3));
        }

        // If no obstacles, return desired direction
        if (avoidanceForce.length() < 0.1) {
            return desiredDir;
        }

        return avoidanceForce.normalize();
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

    public stop() {
        if (!this.owner.body) return;
        this.currentTarget = null;

        // Apply deceleration force instead of instantly stopping
        const decelForce = 20;
        const forceX = -this.owner.body.velocity.x * decelForce;
        const forceZ = -this.owner.body.velocity.z * decelForce;

        this.owner.body.applyForce(
            new CANNON.Vec3(forceX, 0, forceZ),
            this.owner.body.position
        );
    }

    public lookAt(targetPos: THREE.Vector3) {
        if (!this.owner.mesh) return;
        this.owner.mesh.lookAt(targetPos.x, this.owner.mesh.position.y, targetPos.z);
    }

    public getCurrentTarget(): THREE.Vector3 | null {
        return this.currentTarget;
    }
}
