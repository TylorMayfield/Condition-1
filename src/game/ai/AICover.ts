import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy';


export interface CoverPoint {
    position: THREE.Vector3;
    quality: number; // 0-1, how good the cover is
    distance: number;
}

export class AICover {
    private game: Game;
    private owner: Enemy;
    private coverSearchRadius: number = 15;

    constructor(game: Game, owner: Enemy) {
        this.game = game;
        this.owner = owner;
    }

    /**
     * Find nearby cover positions that can protect from the threat
     */
    public findCover(threatPosition: THREE.Vector3): CoverPoint | null {
        if (!this.owner.body) return null;

        const ownerPos = new THREE.Vector3(
            this.owner.body.position.x,
            this.owner.body.position.y,
            this.owner.body.position.z
        );

        // First try strategic cover spots if available
        const strategicCover = this.findStrategicCover(ownerPos, threatPosition);
        if (strategicCover) return strategicCover;

        // Fallback: dynamic cover detection
        return this.findDynamicCover(ownerPos, threatPosition);
    }

    /**
     * Find cover from pre-computed strategic spots
     */
    private findStrategicCover(ownerPos: THREE.Vector3, threatPosition: THREE.Vector3): CoverPoint | null {
        const coverSpots = this.game.recastNav?.strategicPoints?.coverSpots;
        if (!coverSpots || coverSpots.length === 0) return null;

        let bestCover: CoverPoint | null = null;
        let bestScore = -1;

        for (const spot of coverSpots) {
            const coverPos = new THREE.Vector3(...spot.position);
            const coverDir = new THREE.Vector3(...spot.coverDirection);
            
            // Check if this cover direction faces away from threat
            const threatDir = new THREE.Vector3().subVectors(threatPosition, coverPos).normalize();
            const alignment = -coverDir.dot(threatDir);  // Cover should block threat direction
            
            if (alignment < 0.3) continue;  // Cover doesn't help against this threat

            const distance = ownerPos.distanceTo(coverPos);
            if (distance > this.coverSearchRadius) continue;

            // Score: quality * alignment, penalized by distance
            const score = spot.quality * alignment * (1 - distance / this.coverSearchRadius);

            if (score > bestScore) {
                bestScore = score;
                bestCover = {
                    position: coverPos,
                    quality: spot.quality,
                    distance
                };
            }
        }

        return bestCover;
    }

    /**
     * Fallback: Find cover through runtime scene analysis
     */
    private findDynamicCover(ownerPos: THREE.Vector3, threatPosition: THREE.Vector3): CoverPoint | null {
        let _bestCover: CoverPoint | null = null;
        let bestScore = -1;

        const potentialCovers: CoverPoint[] = [];

        for (const obj of this.game.getGameObjects()) {
            if (!obj.body || obj === this.owner) continue;
            if (obj === this.game.player || obj instanceof Enemy) continue;

            const objPos = new THREE.Vector3(
                obj.body.position.x,
                obj.body.position.y,
                obj.body.position.z
            );

            const distance = ownerPos.distanceTo(objPos);
            if (distance > this.coverSearchRadius) continue;

            const bounds = obj.body.shapes[0];
            if (bounds && 'halfExtents' in bounds) {
                const halfExtents = (bounds as CANNON.Box).halfExtents;
                if (halfExtents.y < 0.5) continue;
            }

            const coverPositions = this.findCoverPositionsAroundObstacle(objPos, threatPosition, ownerPos);

            for (const coverPos of coverPositions) {
                const quality = this.evaluateCoverQuality(coverPos, objPos, threatPosition);
                if (quality > 0.3) {
                    potentialCovers.push({
                        position: coverPos,
                        quality: quality,
                        distance: ownerPos.distanceTo(coverPos)
                    });
                }
            }
        }

        for (const cover of potentialCovers) {
            const score = cover.quality * 0.7 + (1 - Math.min(cover.distance / this.coverSearchRadius, 1)) * 0.3;

            if (score > bestScore) {
                bestScore = score;
                return cover;
            }
        }

        return null;
    }

    /**
     * Find potential cover positions around an obstacle
     */
    private findCoverPositionsAroundObstacle(
        obstaclePos: THREE.Vector3,
        threatPos: THREE.Vector3,
        ownerPos: THREE.Vector3
    ): THREE.Vector3[] {
        const positions: THREE.Vector3[] = [];

        // Vector from threat to obstacle (we want to be on the opposite side)
        const threatToObstacle = new THREE.Vector3().subVectors(obstaclePos, threatPos).normalize();

        // Find positions around the obstacle, favoring the side away from threat
        const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        const radius = 1.5; // Distance from obstacle center

        for (const angle of angles) {
            const offset = new THREE.Vector3(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            );

            // Rotate offset to align with threat-obstacle vector
            const perp = new THREE.Vector3(-threatToObstacle.z, 0, threatToObstacle.x);
            const finalOffset = offset.applyAxisAngle(new THREE.Vector3(0, 1, 0),
                Math.atan2(perp.z, perp.x));

            const coverPos = obstaclePos.clone().add(finalOffset);
            coverPos.y = ownerPos.y; // Keep same height

            // Check if position is valid (not inside obstacle, has line of sight to obstacle)
            if (this.isValidCoverPosition(coverPos, obstaclePos)) {
                positions.push(coverPos);
            }
        }

        return positions;
    }

    /**
     * Check if a cover position is valid
     */
    private isValidCoverPosition(coverPos: THREE.Vector3, obstaclePos: THREE.Vector3): boolean {
        // Raycast from cover position to obstacle to ensure we can reach it
        const start = new CANNON.Vec3(coverPos.x, coverPos.y + 0.5, coverPos.z);
        const end = new CANNON.Vec3(obstaclePos.x, obstaclePos.y, obstaclePos.z);

        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

        // Should hit the obstacle
        return result.hasHit;
    }

    /**
     * Evaluate how good a cover position is
     */
    private evaluateCoverQuality(
        coverPos: THREE.Vector3,
        obstaclePos: THREE.Vector3,
        threatPos: THREE.Vector3,
    ): number {
        let quality = 0;

        // 1. Check if obstacle blocks line of sight from threat
        const threatToCover = new THREE.Vector3().subVectors(coverPos, threatPos);
        const threatToObstacle = new THREE.Vector3().subVectors(obstaclePos, threatPos);

        // If obstacle is between threat and cover, that's good
        const dot = threatToObstacle.normalize().dot(threatToCover.normalize());
        if (dot > 0.7) { // Obstacle is in the way
            quality += 0.5;
        }

        // 2. Check distance from obstacle (closer is better, but not too close)
        const distToObstacle = coverPos.distanceTo(obstaclePos);
        if (distToObstacle > 0.8 && distToObstacle < 2.5) {
            quality += 0.3;
        }

        // 3. Check if we can still see the threat (for shooting back)
        const _coverToThreat = new THREE.Vector3().subVectors(threatPos, coverPos);
        const ray = new CANNON.Ray(
            new CANNON.Vec3(coverPos.x, coverPos.y + 0.5, coverPos.z),
            new CANNON.Vec3(threatPos.x, threatPos.y + 0.5, threatPos.z)
        );
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

        // If we can peek around the cover, that's good
        if (result.hasHit && result.body && result.hitPointWorld) {
            const hitPos = new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z);
            const distToHit = coverPos.distanceTo(hitPos);
            if (distToHit > 1.0) { // Can peek around
                quality += 0.2;
            }
        }

        return Math.min(quality, 1.0);
    }

    /**
     * Check if current position has cover from threat
     */
    public hasCoverFrom(threatPosition: THREE.Vector3): boolean {
        if (!this.owner.body) return false;

        const ownerPos = new THREE.Vector3(
            this.owner.body.position.x,
            this.owner.body.position.y + 0.5,
            this.owner.body.position.z
        );

        // Raycast from threat to owner
        const ray = new CANNON.Ray(
            new CANNON.Vec3(threatPosition.x, threatPosition.y + 0.5, threatPosition.z),
            new CANNON.Vec3(ownerPos.x, ownerPos.y, ownerPos.z)
        );
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

        if (!result.hasHit || !result.hitPointWorld) return false;

        // Check if something is blocking the line of sight
        const hitPos = new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z);
        const distToHit = ownerPos.distanceTo(hitPos);

        // If hit point is close to owner, we might not have cover
        // If hit point is far, something is blocking
        return distToHit > 0.5;
    }

    /**
     * Find a flanking position to approach the threat from the side
     */
    public findFlankPosition(threatPosition: THREE.Vector3): THREE.Vector3 | null {
        if (!this.owner.body) return null;

        const ownerPos = new THREE.Vector3(
            this.owner.body.position.x,
            this.owner.body.position.y,
            this.owner.body.position.z
        );

        // Calculate perpendicular direction to threat
        const toThreat = new THREE.Vector3().subVectors(threatPosition, ownerPos).normalize();
        const perp = new THREE.Vector3(-toThreat.z, 0, toThreat.x);

        // Try positions to the left and right of threat
        const flankDistance = 8;
        const positions = [
            threatPosition.clone().add(perp.clone().multiplyScalar(flankDistance)),
            threatPosition.clone().add(perp.clone().multiplyScalar(-flankDistance))
        ];

        // Find the position that's closer to owner and has a clear path
        for (const pos of positions) {
            pos.y = ownerPos.y;

            // Check if path is relatively clear
            const ray = new CANNON.Ray(
                new CANNON.Vec3(ownerPos.x, ownerPos.y + 0.5, ownerPos.z),
                new CANNON.Vec3(pos.x, pos.y + 0.5, pos.z)
            );
            const result = new CANNON.RaycastResult();
            ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

            if (!result.hasHit || !result.hitPointWorld || ownerPos.distanceTo(new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z)) > 5) {
                return pos;
            }
        }

        return positions[0]; // Fallback to first position
    }
}

