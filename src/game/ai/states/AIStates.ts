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
        this.waitTime = 1 + Math.random() * 2; // Wait 1-3 seconds before patrol
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
 * - Navigate to random points on navmesh
 * - Score points for openness (avoid corners)
 * - Scan for targets while moving
 */
export class PatrolState implements IAIStateHandler {
    public readonly stateId = AIStateId.Patrol;
    private patrolTarget: THREE.Vector3 | null = null;
    private waitTimer: number = 0;
    private patrolPointAttempts: number = 0;
    private readonly maxAttempts = 5;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
        this.patrolTarget = null;
        this.waitTimer = 0;
        this.patrolPointAttempts = 0;
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        // Priority: Check for targets
        if (ai.target && ai.senses.canSee(ai.target)) {
            ai.blackboard.sawTarget(
                new THREE.Vector3(ai.target.body!.position.x, ai.target.body!.position.y, ai.target.body!.position.z)
            );
            return AIStateId.Chase;
        }

        // Check for sounds
        const sound = ai.blackboard.getMostImportantSound();
        if (sound) {
            ai.alertParams = { pos: sound.pos.clone(), timer: 5000 };
            ai.blackboard.heardSounds = [];
            return AIStateId.Alert;
        }

        // If no patrol target, find one
        if (!this.patrolTarget) {
            this.waitTimer -= dt;
            if (this.waitTimer <= 0) {
                this.patrolTarget = this.findPatrolPoint(ai);
                if (this.patrolTarget) {
                    console.log(`[PatrolState] ${ai.owner.name} found patrol target: ${this.patrolTarget.toArray()}`);
                    ai.blackboard.setDestination(this.patrolTarget);
                    ai.movement.moveTo(this.patrolTarget);
                    this.patrolPointAttempts = 0;
                } else {
                    this.patrolPointAttempts++;
                    this.waitTimer = 0.5; // Try again soon
                    console.log(`[PatrolState] ${ai.owner.name} failed to find patrol point (attempt ${this.patrolPointAttempts}/${this.maxAttempts})`);

                    if (this.patrolPointAttempts >= this.maxAttempts) {
                        console.warn(`[PatrolState] ${ai.owner.name} giving up after ${this.maxAttempts} attempts`);
                        return AIStateId.Idle;
                    }
                }
            }
            return null;
        }

        // Check if we've arrived
        const pos = ai.getOwnerPosition();
        if (pos && pos.distanceTo(this.patrolTarget) < 2.0) {
            this.patrolTarget = null;
            ai.blackboard.reachedDestination();
            this.waitTimer = 2 + Math.random() * 2; // Wait 2-4s before next point
            return AIStateId.Idle; // Brief idle before next patrol
        }

        // Check for stuck
        if (ai.blackboard.moveTime > 10) {
            // Been moving too long without arriving
            ai.blackboard.moveFailed();
            this.patrolTarget = null;
            this.waitTimer = 0.5;
        }

        return null;
    }

    exit(_ai: EnemyAI): void {
        this.patrolTarget = null;
    }

    private findPatrolPoint(ai: EnemyAI): THREE.Vector3 | null {
        const currentPos = ai.getOwnerPosition();
        if (!currentPos) {
            console.log(`[PatrolState] ${ai.owner.name} - no owner position`);
            return null;
        }
        if (!ai.game.recastNav) {
            console.log(`[PatrolState] ${ai.owner.name} - no recastNav`);
            return null;
        }
        if (!ai.game.recastNav.getCrowd()) {
            console.log(`[PatrolState] ${ai.owner.name} - no recast crowd`);
            return null;
        }

        let bestPoint: THREE.Vector3 | null = null;
        let bestScore = -Infinity;

        // Sample 3-5 candidates
        for (let i = 0; i < 4; i++) {
            const radius = 15 + Math.random() * 25; // 15-40m range
            const pt = ai.game.recastNav.getRandomPointAround(currentPos, radius);
            if (pt) {
                const score = this.evaluatePoint(ai, pt);
                if (score > bestScore) {
                    bestScore = score;
                    bestPoint = pt;
                }
            }
        }

        return bestPoint;
    }

    private evaluatePoint(ai: EnemyAI, pt: THREE.Vector3): number {
        // Prefer open areas (less likely to get stuck)
        // Use the existing evaluatePatrolPoint from EnemyAI if available
        // For now, simple distance from current pos as tiebreaker
        const currentPos = ai.getOwnerPosition();
        if (!currentPos) return 0;

        return currentPos.distanceTo(pt);
    }
}

/**
 * ChaseState - AI has detected a target and is pursuing
 * 
 * Behaviors:
 * - Run toward target's last known position
 * - Update position if target is visible
 * - Transition to Attack when in range
 * - Consider cover if taking damage
 */
export class ChaseState implements IAIStateHandler {
    public readonly stateId = AIStateId.Chase;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(true);
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

        // Taking damage? Consider cover
        if (ai.blackboard.timeSinceDamaged < 2 && ai.owner.health < ai.healthThreshold) {
            return AIStateId.TakeCover;
        }

        // Personality-based tactical decisions
        if (ai.personality === 2 && distance > 15 && Math.random() < 0.01) { // Tactical
            return AIStateId.Flank;
        }

        // Lost sight for too long?
        if (!canSee && ai.blackboard.timeSinceTargetSeen > 5) {
            return AIStateId.Search;
        }

        // Move toward target (or last known position)
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
        ai.movement.setRunning(true);
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
        ai.movement.setRunning(true);
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
