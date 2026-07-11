import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';

export class PatrolState implements IAIStateHandler {
    public readonly stateId = AIStateId.Patrol;
    private patrolQueue: THREE.Vector3[] = [];  // Queue of up to 10 points
    private currentTarget: THREE.Vector3 | null = null;
    private readonly maxQueueSize = 10;
    private readonly refillThreshold = 5;  // Refill when queue drops below this
    private failedAttempts: number = 0;
    private readonly maxFailedAttempts = 5;
    private pauseTimer: number = 0;
    private scanDirection: number = 1; // 1 = left-to-right, -1 = right-to-left
    private scanAngle: number = 0; // Current scan angle

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
        this.patrolQueue = [];
        this.currentTarget = null;
        this.failedAttempts = 0;
        // Pre-fill the queue on entry
        this.refillQueue(ai);
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        // Wait for Recast agent to be registered
        if (!ai.useRecast) {
            return null;
        }

        // Game-mode squad orders take priority over free-roaming patrol behavior.
        if (ai.blackboard.objectiveDestination) {
            const pos = ai.getOwnerPosition();
            if (pos && pos.distanceTo(ai.blackboard.objectiveDestination) > 1.5) {
                this.clearQueue();
                ai.movement.moveTo(ai.blackboard.objectiveDestination);
            } else {
                ai.movement.stop();
            }
            return null;
        }

        // Target engagement handled by EnemyAI acquisition
        if (ai.target && ai.senses.canSee(ai.target)) {
            if (ai.blackboard.isAcquiringTarget(ai.target)) {
                return null;
            }
            this.clearQueue();
            return AIStateId.Chase;
        }

        // Check for sounds (interrupt)
        const sound = ai.blackboard.getMostImportantSound();
        if (sound) {
            ai.alertParams = { pos: sound.pos.clone(), timer: 3000 };
            ai.blackboard.heardSounds = [];
            this.clearQueue();
            return AIStateId.Alert;
        }

        // Refill queue if running low
        if (this.patrolQueue.length < this.refillThreshold) {
            this.refillQueue(ai);
        }

        // If no current target, get next from queue
        if (!this.currentTarget) {
            if (this.patrolQueue.length > 0) {
                this.currentTarget = this.patrolQueue.shift()!;
                ai.blackboard.setDestination(this.currentTarget);
                ai.movement.moveTo(this.currentTarget);
                this.failedAttempts = 0;
            } else {
                // Queue empty and can't refill - wait briefly
                this.failedAttempts++;
                if (this.failedAttempts >= this.maxFailedAttempts) {
                    console.warn(`[PatrolState] ${ai.owner.name} can't find patrol points, going idle`);
                    return AIStateId.Idle;
                }
                return null;
            }
        }

        const pos = ai.getOwnerPosition();
        if (!pos || !this.currentTarget) return null;

        const distToTarget = pos.distanceTo(this.currentTarget);

        // Check if we've arrived - pause and perform methodical room sweep
        if (distToTarget < 2.0) {
            ai.blackboard.reachedDestination();

            // Methodical: Long pause with deliberate sweeping at each point
            if (this.pauseTimer <= 0) {
                // Longer pauses for careful room clearing (4-7 seconds)
                this.pauseTimer = 4.0 + Math.random() * 3.0;
                this.scanAngle = 0;
                this.scanDirection = Math.random() > 0.5 ? 1 : -1; // Randomize initial sweep direction
                ai.movement.stop();
            } else {
                this.pauseTimer -= dt;

                // Methodical sweeping: slow, deliberate left-to-right-to-left scanning
                // Wider angle (120 degrees total) and slower speed for thorough coverage
                const sweepSpeed = 0.5; // Slow sweep
                const maxSweepAngle = Math.PI * 0.65; // ~120 degrees total sweep

                // Increment scan angle
                this.scanAngle += this.scanDirection * sweepSpeed * dt;

                // Reverse direction at sweep limits (like a security cam)
                if (Math.abs(this.scanAngle) > maxSweepAngle / 2) {
                    this.scanDirection *= -1;
                    this.scanAngle = Math.sign(this.scanAngle) * maxSweepAngle / 2;
                }

                if (ai.owner.mesh) {
                    // Calculate look direction based on current sweep angle
                    const baseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(ai.owner.mesh.quaternion);

                    // Apply scan rotation around Y axis
                    const lookDir = baseForward.clone()
                        .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.scanAngle);
                    const lookTarget = pos.clone().add(lookDir.multiplyScalar(8));
                    ai.movement.lookAt(lookTarget);
                }

                if (this.pauseTimer <= 0) {
                    // Done sweeping, move to next point
                    if (this.patrolQueue.length > 0) {
                        this.currentTarget = this.patrolQueue.shift()!;
                        ai.blackboard.setDestination(this.currentTarget);
                        ai.movement.moveTo(this.currentTarget);
                    } else {
                        this.currentTarget = null;
                    }
                }
            }
            return null;
        }

        // Check for stuck - only if we've been trying to move for a while AND barely moving
        // Check velocity to confirm AI is actually stuck (not just on a long patrol route)
        const velocity = ai.owner.body?.velocity;
        const speed = velocity ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) : 0;
        const isStuck = ai.blackboard.moveTime > 15 && speed < 0.3;

        if (isStuck) {
            console.log(`[PatrolState] ${ai.owner.name} stuck (speed: ${speed.toFixed(2)}), recalculating queue`);
            ai.blackboard.moveFailed();
            this.clearQueue();
            this.refillQueue(ai);
        }

        return null;
    }

    exit(_ai: EnemyAI): void {
        this.clearQueue();
    }

    private clearQueue(): void {
        this.patrolQueue = [];
        this.currentTarget = null;
    }

    private refillQueue(ai: EnemyAI): void {
        const currentPos = ai.getOwnerPosition();
        if (!currentPos || !ai.game.recastNav || !ai.game.recastNav.getCrowd()) {
            return;
        }

        // Fill queue up to max size
        const toAdd = this.maxQueueSize - this.patrolQueue.length;
        let lastPos = this.patrolQueue.length > 0
            ? this.patrolQueue[this.patrolQueue.length - 1]
            : (this.currentTarget || currentPos);

        for (let i = 0; i < toAdd; i++) {
            const pt = this.findNextPatrolPoint(ai, lastPos);
            if (pt) {
                this.patrolQueue.push(pt);
                lastPos = pt;
            }
        }
    }

    private findNextPatrolPoint(ai: EnemyAI, fromPos: THREE.Vector3): THREE.Vector3 | null {
        if (!ai.game.recastNav) return null;

        // Try to use strategic patrol points if available
        const strategicPoints = ai.game.recastNav.strategicPoints?.patrolPoints;
        if (strategicPoints && strategicPoints.length > 0) {
            // Pick a random strategic point that isn't too close to where we're coming from
            const candidates = strategicPoints.filter(p => {
                const dist = fromPos.distanceTo(new THREE.Vector3(...p.position));
                return dist > 8; // At least 8m away
            });

            if (candidates.length > 0) {
                // Weighted random selection by score
                const totalScore = candidates.reduce((sum, p) => sum + p.score, 0);
                let random = Math.random() * totalScore;
                for (const pt of candidates) {
                    random -= pt.score;
                    if (random <= 0) {
                        return new THREE.Vector3(...pt.position);
                    }
                }
                // Fallback to first candidate
                return new THREE.Vector3(...candidates[0].position);
            }
        }

        // Fallback: sample random points
        let bestPoint: THREE.Vector3 | null = null;
        let bestScore = -Infinity;

        for (let i = 0; i < 4; i++) {
            const radius = 15 + Math.random() * 25;
            const pt = ai.game.recastNav.getRandomPointAround(fromPos, radius);
            if (pt) {
                const score = fromPos.distanceTo(pt);
                if (score > bestScore) {
                    bestScore = score;
                    bestPoint = pt;
                }
            }
        }

        return bestPoint;
    }
}

/**
 * ChaseState - AI has detected a target and is pursuing TACTICALLY
 * 
 * Behaviors:
 * - Walk toward target carefully (no running/charging)
 * - Seek cover when possible
 * - Transition to Attack when in range
 * - Prefer flanking and cover over direct assault
 */
