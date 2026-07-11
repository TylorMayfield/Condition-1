import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';

export class SearchState implements IAIStateHandler {
    public readonly stateId = AIStateId.Search;
    private searchPoints: THREE.Vector3[] = [];
    private currentSearchIndex: number = 0;
    private scanTimer: number = 0;
    private scanPhase: number = 0; // 0=Move, 1=ScanLeft, 2=ScanRight

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
        this.generateSearchPoints(ai);
        this.currentSearchIndex = 0;
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        // Found target?
        if (ai.target && ai.senses.canSee(ai.target)) {
            if (ai.blackboard.isAcquiringTarget(ai.target)) {
                return null;
            }
            ai.blackboard.sawTarget(
                new THREE.Vector3(ai.target.body!.position.x, ai.target.body!.position.y, ai.target.body!.position.z)
            );
            return AIStateId.Chase;
        }

        // Move through search points with scanning
        if (this.currentSearchIndex < this.searchPoints.length) {
            const target = this.searchPoints[this.currentSearchIndex];
            const pos = ai.getOwnerPosition();

            if (pos && pos.distanceTo(target) < 1.5) {
                // Arrived at point, start scan
                if (this.scanPhase === 0) {
                    this.scanPhase = 1;
                    this.scanTimer = 1.0;
                    ai.movement.stop();
                }

                // Scan logic
                this.scanTimer -= dt;
                if (this.scanTimer <= 0) {
                    if (this.scanPhase === 1) {
                        this.scanPhase = 2; // Switch to scan right
                        this.scanTimer = 1.0;
                    } else if (this.scanPhase === 2) {
                        // Done scanning this point
                        this.currentSearchIndex++;
                        this.scanPhase = 0;
                    }
                } else {
                    // Scanning animation/rotation
                    if (ai.owner.mesh) {
                        const angleOffset = this.scanPhase === 1 ? -1 : 1;
                        // Rotate search vector
                        const lookTarget = pos.clone().add(new THREE.Vector3(Math.cos(angleOffset), 0, Math.sin(angleOffset)).multiplyScalar(5));
                        ai.movement.lookAt(lookTarget);
                    }
                }
            } else {
                this.scanPhase = 0; // Reset if moving
                ai.movement.moveTo(target);
            }
        } else {
            // Searched all points, give up
            return AIStateId.Patrol;
        }

        return null;
    }

    exit(_ai: EnemyAI): void {
        this.searchPoints = [];
    }

    private generateSearchPoints(ai: EnemyAI): void {
        const lastKnown = ai.blackboard.lastKnownTargetPos;
        if (!lastKnown || !ai.game.recastNav) return;

        // Generate 3 points around last known position
        for (let i = 0; i < 3; i++) {
            const pt = ai.game.recastNav.getRandomPointAround(lastKnown, 10);
            if (pt) {
                this.searchPoints.push(pt);
            }
        }
    }
}

/**
 * TakeCoverState - AI is moving to or in cover
 */
