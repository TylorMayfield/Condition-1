import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { Enemy } from '../Enemy';
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
    
    // Pathfinding
    private currentPath: THREE.Vector3[] = [];
    private pathIndex: number = 0;

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

        // Apply obstacle avoidance (walls)
        const avoidanceDir = this.getThrottledAvoidance(ownerPos, dir);
        
        // Apply bot-to-bot separation
        const separationForce = this.calculateBotSeparation(ownerPos);
        
        // Combine: movement direction + separation force
        const finalDir = avoidanceDir.add(separationForce).normalize();

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
    /**
     * Calculate avoidance direction using multiple weighted whiskers
     */
    private calculateAvoidance(currentPos: THREE.Vector3, desiredDir: THREE.Vector3): THREE.Vector3 {
        // Whiskers configuration: [angle (deg), length, weight]
        const whiskers = [
            [0, this.avoidanceRadius + 1.0, 1.0],     // Center (Long)
            [15, this.avoidanceRadius, 0.8],         // Narrow Left
            [-15, this.avoidanceRadius, 0.8],        // Narrow Right
            [45, this.avoidanceRadius * 0.7, 0.5],   // Wide Left
            [-45, this.avoidanceRadius * 0.7, 0.5]   // Wide Right
        ];

        const avoidanceForce = new THREE.Vector3();
        let hitCount = 0;

        for (const [angle, length, weight] of whiskers) {
            // Calculate ray direction
            const rayDir = desiredDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle * (Math.PI / 180));
            
            // Raycast
            const start = new CANNON.Vec3(currentPos.x, currentPos.y + 0.5, currentPos.z);
            const endPos = currentPos.clone().add(rayDir.clone().multiplyScalar(length));
            const end = new CANNON.Vec3(endPos.x, endPos.y + 0.5, endPos.z);

            const ray = new CANNON.Ray(start, end);
            const result = new CANNON.RaycastResult();
            
            // Note: intersectWorld is expensive, maybe we can optimize by only checking static bodies?
            // For now, this is fine.
            ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

            if (result.hasHit && result.hitPointWorld && result.hitNormalWorld) {
                // Check normal to ignore floor/slopes
                // If normal is pointing up (> 0.5), it's walkable
                if (result.hitNormalWorld.y > 0.5) continue;

                // Wall detected
                hitCount++;

                const hitNormal = new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z);
                
                // Repulsion force: Normal * weight
                // Increased force from 2.0 to 12.0 for stronger reaction
                avoidanceForce.add(hitNormal.multiplyScalar(weight * 12.0));
            }
        }

        if (hitCount === 0) {
            return desiredDir;
        }

        // Blend avoidance with desired direction
        const blendFactor = 1.0 / (1.0 + hitCount); 
        const finalDir = desiredDir.clone().multiplyScalar(blendFactor).add(avoidanceForce);

        return finalDir.normalize();
    }
    
    // Throttling state
    private frameCount: number = 0;
    private lastAvoidanceResult: THREE.Vector3 | null = null;

    private getThrottledAvoidance(currentPos: THREE.Vector3, desiredDir: THREE.Vector3): THREE.Vector3 {
        this.frameCount++;
        
        // Update every 3rd frame (20fps effective for avoidance)
        // Also update if we don't have a result yet
        if (this.frameCount % 3 === 0 || !this.lastAvoidanceResult) {
            this.lastAvoidanceResult = this.calculateAvoidance(currentPos, desiredDir);
        }
        
        // If we have a cached result, we should probably blend it with the NEW desiredDir?
        // calculateAvoidance takes desiredDir into account. 
        // If we return the old Vector3, it points in the old direction.
        // This might cause "laggy" steering. 
        // But for 3 frames (50ms) it should be fine.
        return this.lastAvoidanceResult!;
    }

    /**
     * Calculate separation force from nearby bots to prevent clustering
     */
    private calculateBotSeparation(currentPos: THREE.Vector3): THREE.Vector3 {
        const separationForce = new THREE.Vector3();
        const separationRadius = 2.5; // Check bots within 2.5m
        const separationStrength = 3.0; // How strongly to push apart
        
        // Get all game objects and check for nearby enemies
        const gameObjects = this.game.getGameObjects();
        
        for (const obj of gameObjects) {
            // Skip self and non-Enemy objects
            if (obj === this.owner) continue;
            if (!obj.body) continue;
            
            // Calculate distance
            const dx = currentPos.x - obj.body.position.x;
            const dz = currentPos.z - obj.body.position.z;
            const distSq = dx * dx + dz * dz;
            
            if (distSq < separationRadius * separationRadius && distSq > 0.01) {
                // Within separation radius - add repulsion force
                const dist = Math.sqrt(distSq);
                const strength = (separationRadius - dist) / separationRadius * separationStrength;
                
                // Normalize direction and scale by strength
                separationForce.x += (dx / dist) * strength;
                separationForce.z += (dz / dist) * strength;
            }
        }
        
        return separationForce;
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
        
        // Calculate direction to target
        const dx = targetPos.x - this.owner.mesh.position.x;
        const dz = targetPos.z - this.owner.mesh.position.z;
        
        // Prevent looking at self (causes undefined angle)
        if (dx*dx + dz*dz < 0.01) return;

        // Calculate Y-axis rotation only (yaw) - this CANNOT flip the mesh
        // atan2 gives angle in radians, but we need to offset because Three.js 
        // default forward is -Z (looking towards negative Z)
        const angle = Math.atan2(dx, dz);
        
        // Set ONLY the Y rotation, preserve X and Z at 0
        this.owner.mesh.rotation.set(0, angle, 0);
    }

    public getCurrentTarget(): THREE.Vector3 | null {
        return this.currentTarget;
    }

    public setPath(path: THREE.Vector3[]) {
        this.currentPath = path;
        
        // Smart Path Update: Find closest point on new path to preserve momentum
        // preventing backtracking when the path is refreshed.
        if (this.currentPath.length > 0 && this.owner.body) {
             const pos = this.owner.body.position;
             let closestDist = Infinity;
             let closestIndex = 0;

             // Scan path for closest node
             // Optimization: If path is long, we might only check the first 5-10 nodes? 
             // But usually paths are < 50 nodes, so linear scan is cheap (distance squared).
             for(let i=0; i<this.currentPath.length; i++) {
                 const p = this.currentPath[i];
                 const dist = (pos.x - p.x)**2 + (pos.z - p.z)**2;
                 if (dist < closestDist) {
                     closestDist = dist;
                     closestIndex = i;
                 }
             }

             // We are at 'closestIndex'. We should head to 'closestIndex + 1'
             this.pathIndex = closestIndex + 1;
             
             // Safety: If closest was the last node, just go to it (finish)
             if (this.pathIndex >= this.currentPath.length) {
                 this.pathIndex = this.currentPath.length - 1;
             }
        } else {
             this.pathIndex = 0;
        }

        if (this.pathIndex < this.currentPath.length) {
            this.moveTowards(this.currentPath[this.pathIndex]);
        }
    }

    public updatePathFollowing() {
        if (this.currentPath.length === 0) return;

        // check close to current node
        const target = this.currentPath[this.pathIndex];
        // Use 2D distance (ignore Y) for waypoint completion to handle stairs/ramps better
        const dx = this.owner.body!.position.x - target.x;
        const dz = this.owner.body!.position.z - target.z;
        const distSq = dx*dx + dz*dz;

        // 0.5m radius squared = 0.25
        if (distSq < 0.25) {
            this.pathIndex++;
            if (this.pathIndex >= this.currentPath.length) {
                this.currentPath = []; // Done
                this.stop();
            }
        }

        if (this.pathIndex < this.currentPath.length) {
            this.moveTowards(this.currentPath[this.pathIndex]);
        }
    }

    public hasPath(): boolean {
        return this.currentPath.length > 0;
    }

    public isMoving(): boolean {
        if (!this.owner.body) return false;
        const v = this.owner.body.velocity;
        return (v.x * v.x + v.z * v.z) > 0.1;
    }

    public isGrounded(): boolean {
        if (!this.owner.body) return false;
        // Simple velocity check or contact check?
        // Raycast down 1.0 unit (center to feet + margin)
        const start = new CANNON.Vec3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z);
        const end = new CANNON.Vec3(start.x, start.y - 1.1, start.z); // Sphere radius 0.4, so 1.1 is plenty
        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });
        return result.hasHit;
    }

    public jump() {
        if (!this.owner.body) return;
        this.owner.body.velocity.y = 5; // Jump impulse
    }

    public moveDirection(dir: THREE.Vector3) {
        if (!this.owner.body) return;
        const speed = this.moveSpeed * 10; // Strong shove
        this.owner.body.velocity.x += dir.x * speed * 0.1;
        this.owner.body.velocity.z += dir.z * speed * 0.1;
    }
}
