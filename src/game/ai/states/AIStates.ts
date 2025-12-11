import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';

/**
 * IdleState - AI is stationary, waiting for something to happen
 * 
 * Behaviors:
 * - Stop movement
 * - Scan for targets
 * - Listen for sounds
 * - Auto-transition to Patrol after short wait
 */
export class IdleState implements IAIStateHandler {
    public readonly stateId = AIStateId.Idle;
    private waitTime: number = 0;

    enter(ai: EnemyAI): void {
        ai.movement.stop();
        this.waitTime = 0.5 + Math.random() * 1.0; // Wait 0.5-1.5 seconds before patrol
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        // Check for visible targets
        if (ai.target && ai.senses.canSee(ai.target)) {
            ai.blackboard.sawTarget(
                new THREE.Vector3(ai.target.body!.position.x, ai.target.body!.position.y, ai.target.body!.position.z)
            );
            return AIStateId.Chase;
        }

        // Check for sounds to investigate
        const sound = ai.blackboard.getMostImportantSound();
        if (sound) {
            ai.alertParams = { pos: sound.pos.clone(), timer: 5000 };
            ai.blackboard.heardSounds = []; // Clear processed sounds
            return AIStateId.Alert;
        }

        // Wait before transitioning to patrol
        this.waitTime -= dt;
        if (this.waitTime <= 0) {
            return AIStateId.Patrol;
        }

        return null;
    }

    exit(_ai: EnemyAI): void {
        // Nothing to clean up
    }
}

/**
 * PatrolState - AI moves between waypoints looking for threats
 * 
 * Behaviors:
 * - Maintain a queue of 10 anticipated patrol points
 * - Seamlessly move from one point to the next
 * - Continuously replenish queue while moving
 * - Interrupts: target spotted, sounds, damage -> override and recalculate
 */
export class PatrolState implements IAIStateHandler {
    public readonly stateId = AIStateId.Patrol;
    private patrolQueue: THREE.Vector3[] = [];  // Queue of up to 10 points
    private currentTarget: THREE.Vector3 | null = null;
    private readonly maxQueueSize = 10;
    private readonly refillThreshold = 5;  // Refill when queue drops below this
    private failedAttempts: number = 0;
    private readonly maxFailedAttempts = 5;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
        this.patrolQueue = [];
        this.currentTarget = null;
        this.failedAttempts = 0;
        // Pre-fill the queue on entry
        this.refillQueue(ai);
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        // Wait for Recast agent to be registered
        if (!ai.useRecast) {
            return null;
        }

        // Priority: Check for targets (interrupt - clears queue)
        if (ai.target && ai.senses.canSee(ai.target)) {
            ai.blackboard.sawTarget(
                new THREE.Vector3(ai.target.body!.position.x, ai.target.body!.position.y, ai.target.body!.position.z)
            );
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

        // Check if we've arrived - immediately transition to next
        if (distToTarget < 2.0) {
            ai.blackboard.reachedDestination();
            // Get next target immediately
            if (this.patrolQueue.length > 0) {
                this.currentTarget = this.patrolQueue.shift()!;
                ai.blackboard.setDestination(this.currentTarget);
                ai.movement.moveTo(this.currentTarget);
            } else {
                this.currentTarget = null;
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
export class ChaseState implements IAIStateHandler {
    public readonly stateId = AIStateId.Chase;

    enter(ai: EnemyAI): void {
        // TACTICAL: Walk, don't run - be careful and methodical
        ai.movement.setRunning(false);
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        const target = ai.target;

        // If no target at all, search or go idle
        if (!target || !target.body) {
            if (ai.blackboard.lastKnownTargetPos) {
                return AIStateId.Search;
            }
            return AIStateId.Idle;
        }

        const targetPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
        const canSee = ai.senses.canSee(target);
        const distance = ai.getDistanceToTarget();

        // Update memory if visible
        if (canSee) {
            ai.blackboard.sawTarget(targetPos);
        }

        // In attack range and can see?
        if (distance < ai.attackRange && canSee) {
            return AIStateId.Attack;
        }

        // TACTICAL: Seek cover more aggressively
        // - If recently damaged (within 5s)
        // - If health is low
        // - 30% chance at medium range to be cautious
        const shouldSeekCover = 
            (ai.blackboard.timeSinceDamaged < 5) ||
            (ai.owner.health < ai.healthThreshold) ||
            (distance > 10 && distance < 25 && Math.random() < 0.005); // Random caution check per frame
        
        if (shouldSeekCover) {
            return AIStateId.TakeCover;
        }

        // TACTICAL: Prefer flanking over direct assault at medium-long range
        if (distance > 12 && Math.random() < 0.02) {
            return AIStateId.Flank;
        }

        // Lost sight for too long?
        if (!canSee && ai.blackboard.timeSinceTargetSeen > 5) {
            return AIStateId.Search;
        }

        // Move toward target CAREFULLY (or last known position)
        const moveTarget = canSee ? targetPos : ai.blackboard.lastKnownTargetPos;
        if (moveTarget) {
            // Use tactical offset to avoid all AI bunching up
            const tacticalPos = this.getTacticalPosition(ai, moveTarget);
            ai.movement.moveTo(tacticalPos);
        }

        return null;
    }

    exit(ai: EnemyAI): void {
        ai.movement.setRunning(false);
    }

    private getTacticalPosition(ai: EnemyAI, targetPos: THREE.Vector3): THREE.Vector3 {
        // Offset based on entity ID to create spread
        const angle = (ai.entityId % 8) * (Math.PI / 4);
        const offset = 2.0;

        return new THREE.Vector3(
            targetPos.x + Math.cos(angle) * offset,
            targetPos.y,
            targetPos.z + Math.sin(angle) * offset
        );
    }
}

/**
 * AttackState - AI is actively engaging a target
 * 
 * Behaviors:
 * - Fire at target
 * - Movement based on personality
 * - Consider cover when damaged
 */
export class AttackState implements IAIStateHandler {
    public readonly stateId = AIStateId.Attack;

    enter(_ai: EnemyAI): void {
        // Ready to attack
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        const target = ai.target;

        if (!target || !target.body) {
            return AIStateId.Chase;
        }

        const targetPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
        const canSee = ai.senses.canSee(target);
        const distance = ai.getDistanceToTarget();

        // Update memory
        if (canSee) {
            ai.blackboard.sawTarget(targetPos);
        }

        // Can't see or out of range?
        if (!canSee || distance > ai.attackRange * 1.2) {
            return AIStateId.Chase;
        }

        // Low health? Take cover
        if (ai.owner.health < ai.healthThreshold * 0.7) {
            return AIStateId.TakeCover;
        }

        // Fire weapon
        ai.owner.weapon.pullTrigger(targetPos);
        ai.movement.lookAt(targetPos);

        // Movement based on personality
        this.handleMovement(ai, targetPos, distance);

        return null;
    }

    exit(_ai: EnemyAI): void {
        // Stop firing
    }

    private handleMovement(ai: EnemyAI, targetPos: THREE.Vector3, _distance: number): void {
        switch (ai.personality) {
            case 0: // Rusher - keep advancing
                ai.movement.setRunning(true);
                ai.movement.moveTo(targetPos);
                break;
            case 1: // Sniper - stop and aim
                ai.movement.stop();
                break;
            case 2: // Tactical - strafe
                if (Math.random() < 0.3 && ai.owner.body) {
                    const perpendicular = new THREE.Vector3(
                        -(targetPos.z - ai.owner.body.position.z),
                        0,
                        targetPos.x - ai.owner.body.position.x
                    ).normalize();
                    ai.movement.strafe(perpendicular, 0.5);
                }
                break;
        }
    }
}

/**
 * AlertState - AI is investigating a sound or other stimulus
 */
export class AlertState implements IAIStateHandler {
    public readonly stateId = AIStateId.Alert;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        // Check for targets while investigating
        if (ai.target && ai.senses.canSee(ai.target)) {
            ai.blackboard.sawTarget(
                new THREE.Vector3(ai.target.body!.position.x, ai.target.body!.position.y, ai.target.body!.position.z)
            );
            return AIStateId.Chase;
        }

        // Move toward alert position
        if (ai.alertParams) {
            const pos = ai.getOwnerPosition();
            if (pos && pos.distanceTo(ai.alertParams.pos) > 2.0) {
                ai.movement.moveTo(ai.alertParams.pos);
            } else {
                // Reached location, look around
                ai.movement.stop();
            }

            ai.alertParams.timer -= dt * 1000;
            if (ai.alertParams.timer <= 0) {
                ai.alertParams = null;
                return AIStateId.Patrol;
            }
        } else {
            return AIStateId.Idle;
        }

        return null;
    }

    exit(ai: EnemyAI): void {
        ai.alertParams = null;
    }
}

/**
 * SearchState - AI is searching for a lost target
 */
export class SearchState implements IAIStateHandler {
    public readonly stateId = AIStateId.Search;
    private searchPoints: THREE.Vector3[] = [];
    private currentSearchIndex: number = 0;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
        this.generateSearchPoints(ai);
        this.currentSearchIndex = 0;
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        // Found target?
        if (ai.target && ai.senses.canSee(ai.target)) {
            ai.blackboard.sawTarget(
                new THREE.Vector3(ai.target.body!.position.x, ai.target.body!.position.y, ai.target.body!.position.z)
            );
            return AIStateId.Chase;
        }

        // Move through search points
        if (this.currentSearchIndex < this.searchPoints.length) {
            const target = this.searchPoints[this.currentSearchIndex];
            const pos = ai.getOwnerPosition();

            if (pos && pos.distanceTo(target) < 2.0) {
                this.currentSearchIndex++;
            } else {
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
export class TakeCoverState implements IAIStateHandler {
    public readonly stateId = AIStateId.TakeCover;
    private coverTarget: THREE.Vector3 | null = null;
    private inCover: boolean = false;

    enter(ai: EnemyAI): void {
        this.findCover(ai);
        // TACTICAL: Walk to cover, don't sprint
        ai.movement.setRunning(false);
        this.inCover = false;
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        const target = ai.target;

        // No target? Go idle
        if (!target || !target.body) {
            return AIStateId.Idle;
        }

        const targetPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);

        // If no cover found, just attack
        if (!this.coverTarget) {
            return AIStateId.Attack;
        }

        // Move to cover
        const pos = ai.getOwnerPosition();
        if (pos && !this.inCover) {
            if (pos.distanceTo(this.coverTarget) < 1.0) {
                this.inCover = true;
                ai.movement.stop();
                ai.blackboard.setCover(this.coverTarget);
            } else {
                ai.movement.moveTo(this.coverTarget);
            }
        }

        // In cover behavior
        if (this.inCover) {
            // Recovered enough? Return to attack
            if (ai.owner.health > ai.healthThreshold) {
                return AIStateId.Attack;
            }

            // Occasional peek attack
            if (Math.random() < 0.02 && ai.senses.canSee(target)) {
                ai.owner.weapon.pullTrigger(targetPos);
                ai.movement.lookAt(targetPos);
            }
        }

        return null;
    }

    exit(ai: EnemyAI): void {
        this.coverTarget = null;
        this.inCover = false;
        ai.blackboard.clearCover();
    }

    private findCover(ai: EnemyAI): void {
        const target = ai.target;
        if (!target || !target.body) return;

        const threatPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
        const cover = ai.cover.findCover(threatPos);

        if (cover) {
            this.coverTarget = cover.position;
        }
    }
}

/**
 * FlankState - AI is attempting to flank the target
 */
export class FlankState implements IAIStateHandler {
    public readonly stateId = AIStateId.Flank;
    private flankTarget: THREE.Vector3 | null = null;

    enter(ai: EnemyAI): void {
        this.findFlankPosition(ai);
        // TACTICAL: Walk to flank, stay quiet
        ai.movement.setRunning(false);
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        const target = ai.target;

        if (!target || !target.body) {
            return AIStateId.Idle;
        }

        if (!this.flankTarget) {
            return AIStateId.Attack;
        }

        // Move to flank position
        const pos = ai.getOwnerPosition();
        if (pos && pos.distanceTo(this.flankTarget) < 2.0) {
            // Reached flank, attack!
            return AIStateId.Attack;
        }

        ai.movement.moveTo(this.flankTarget);

        // Opportunity fire while moving
        if (ai.senses.canSee(target) && Math.random() < 0.05) {
            const targetPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
            ai.owner.weapon.pullTrigger(targetPos);
        }

        return null;
    }

    exit(_ai: EnemyAI): void {
        this.flankTarget = null;
    }

    private findFlankPosition(ai: EnemyAI): void {
        const target = ai.target;
        if (!target || !target.body) return;

        const threatPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
        const flankPos = ai.cover.findFlankPosition(threatPos);

        if (flankPos) {
            this.flankTarget = flankPos;
        }
    }
}

/**
 * FollowState - AI follows the player (for squad members)
 */
export class FollowState implements IAIStateHandler {
    public readonly stateId = AIStateId.Follow;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        const player = ai.game.player;

        if (!player || !player.body) {
            return AIStateId.Idle;
        }

        // Check for enemies
        if (ai.target && ai.senses.canSee(ai.target)) {
            ai.blackboard.sawTarget(
                new THREE.Vector3(ai.target.body!.position.x, ai.target.body!.position.y, ai.target.body!.position.z)
            );
            return AIStateId.Chase;
        }

        const ownerPos = ai.getOwnerPosition();
        if (!ownerPos) return null;

        const playerPos = new THREE.Vector3(player.body.position.x, player.body.position.y, player.body.position.z);
        const distance = ownerPos.distanceTo(playerPos);

        // Follow logic
        if (distance > 5) {
            ai.movement.setRunning(distance > 10);
            ai.movement.moveTo(playerPos);
        } else if (distance < 3) {
            ai.movement.stop();
        } else {
            ai.movement.stop();
            ai.movement.lookAt(playerPos);
        }

        return null;
    }

    exit(_ai: EnemyAI): void {
        // Nothing
    }
}

/**
 * AdvanceState - AI advances toward target using cover
 */
export class AdvanceState implements IAIStateHandler {
    public readonly stateId = AIStateId.Advance;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(true);
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        const distance = ai.getDistanceToTarget();

        if (distance < ai.attackRange) {
            return AIStateId.Attack;
        }

        // Use TakeCover logic but with forward progress
        // For now, delegate to chase
        return AIStateId.Chase;
    }

    exit(_ai: EnemyAI): void {
        // Nothing
    }
}

/**
 * RetreatState - AI is falling back from threat
 */
export class RetreatState implements IAIStateHandler {
    public readonly stateId = AIStateId.Retreat;
    private retreatTarget: THREE.Vector3 | null = null;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(true);
        this.findRetreatPosition(ai);
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        if (!this.retreatTarget) {
            return AIStateId.TakeCover;
        }

        const pos = ai.getOwnerPosition();
        if (pos && pos.distanceTo(this.retreatTarget) < 2.0) {
            return AIStateId.TakeCover;
        }

        ai.movement.moveTo(this.retreatTarget);

        return null;
    }

    exit(_ai: EnemyAI): void {
        this.retreatTarget = null;
    }

    private findRetreatPosition(ai: EnemyAI): void {
        const pos = ai.getOwnerPosition();
        const target = ai.target;

        if (!pos || !target || !target.body || !ai.game.recastNav) return;

        // Move away from threat
        const threatDir = new THREE.Vector3(
            pos.x - target.body.position.x,
            0,
            pos.z - target.body.position.z
        ).normalize();

        const retreatPos = pos.clone().add(threatDir.multiplyScalar(10));
        const snappedPos = ai.game.recastNav.getRandomPointAround(retreatPos, 5);

        if (snappedPos) {
            this.retreatTarget = snappedPos;
        }
    }
}
