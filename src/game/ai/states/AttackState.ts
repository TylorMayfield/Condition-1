import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';
import { AIPersonality } from '../AIPersonality';
import { aimAndFireAtTarget } from '../AICombat';
import { AITactics } from '../AITactics';

export class AttackState implements IAIStateHandler {
    public readonly stateId = AIStateId.Attack;
    private engagePause: number = 0;
    private burstMoveTimer: number = 0;
    private strafeDir: number = 1;

    enter(ai: EnemyAI): void {
        this.engagePause = 0.2 + Math.random() * 0.15;
        this.burstMoveTimer = 0;
        this.strafeDir = ai.entityId % 2 === 0 ? 1 : -1;
        ai.movement.setRunning(false);
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        const target = ai.target;

        if (!target || !target.body) {
            return AIStateId.Chase;
        }

        const targetPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
        const canSee = ai.senses.canSee(target);
        const distance = ai.getDistanceToTarget();
        const tactics = AITactics.getPersonality(ai);

        if (canSee) {
            ai.blackboard.sawTarget(targetPos);
        }

        if (!canSee || distance > ai.attackRange * 1.15) {
            return AIStateId.Chase;
        }

        if (ai.minAttackRange > 0 && distance < ai.minAttackRange) {
            return ai.personality === AIPersonality.Sniper ? AIStateId.Retreat : AIStateId.Chase;
        }

        if (ai.owner.health < ai.healthThreshold * 0.6 && ai.blackboard.canSeekCover()) {
            return AIStateId.TakeCover;
        }

        if (ai.owner.isUnderFire && ai.owner.health < ai.healthThreshold && ai.blackboard.canSeekCover()) {
            return AIStateId.TakeCover;
        }

        this.engagePause = Math.max(0, this.engagePause - dt);
        this.burstMoveTimer -= dt;

        // Fire in controlled bursts after brief settle — aim synced with look direction
        if (this.engagePause <= 0 && canSee) {
            const leadTime = 0.08 + distance * 0.004 + (ai.personality === AIPersonality.Sniper ? 0.06 : 0);
            aimAndFireAtTarget(ai, leadTime, {
                moving: ai.movement.isMoving(),
                suppressed: ai.owner.isUnderFire,
                distance,
            });
        }

        this.handleMovement(ai, targetPos, distance, tactics.strafeAggression, dt);

        return null;
    }

    exit(_ai: EnemyAI): void {
        // Stop firing
    }

    private handleMovement(
        ai: EnemyAI,
        targetPos: THREE.Vector3,
        distance: number,
        strafeAggression: number,
        _dt: number,
    ): void {
        const body = ai.owner.body;
        if (!body) return;

        switch (ai.personality) {
            case AIPersonality.Rusher: {
                ai.movement.setRunning(false);
                if (distance > ai.attackRange * 0.5) {
                    // Zigzag while closing
                    if (this.burstMoveTimer <= 0) {
                        this.strafeDir *= -1;
                        this.burstMoveTimer = 0.8 + Math.random() * 0.6;
                    }
                    const toTarget = targetPos.clone().sub(new THREE.Vector3(body.position.x, body.position.y, body.position.z)).normalize();
                    const perp = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(this.strafeDir * 0.35);
                    const moveGoal = targetPos.clone().add(perp);
                    ai.movement.moveTo(AITactics.snapToNavMesh(ai.game, moveGoal));
                } else {
                    ai.movement.stop();
                }
                break;
            }
            case AIPersonality.Sniper: {
                ai.movement.stop();
                if (distance < ai.minAttackRange * 1.1) {
                    const retreat = AITactics.findRetreatPosition(ai);
                    if (retreat) ai.movement.moveTo(retreat);
                }
                break;
            }
            case AIPersonality.Tactical:
            default: {
                // Burst-strafe: move briefly, plant feet, shoot (handled by engagePause)
                if (this.burstMoveTimer <= 0 && ai.blackboard.canStrafe() && distance < ai.attackRange * 0.9) {
                    this.burstMoveTimer = 1.0 + Math.random() * 0.8;
                    ai.blackboard.markStrafe();
                    const perp = new THREE.Vector3(
                        -(targetPos.z - body.position.z),
                        0,
                        targetPos.x - body.position.x,
                    ).normalize().multiplyScalar(this.strafeDir);
                    ai.movement.strafe(perp, 0.35 + strafeAggression * 0.3);
                    this.strafeDir *= -1;
                } else if (this.burstMoveTimer <= 0) {
                    ai.movement.stop();
                }
                break;
            }
        }
    }
}
