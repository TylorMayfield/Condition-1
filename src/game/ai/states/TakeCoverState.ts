import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';
import { aimAndFireAtTarget } from '../AICombat';

export class TakeCoverState implements IAIStateHandler {
    public readonly stateId = AIStateId.TakeCover;
    private coverTarget: THREE.Vector3 | null = null;
    private inCover: boolean = false;
    private peekTimer: number = 0;
    private peekSide: number = 1;

    enter(ai: EnemyAI): void {
        ai.blackboard.recordCoverAttempt();
        this.findCover(ai);
        ai.movement.setRunning(false);
        this.inCover = false;
        this.peekTimer = 0.5 + Math.random() * 0.5;
        this.peekSide = ai.entityId % 2 === 0 ? 1 : -1;
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        const target = ai.target;

        if (!target || !target.body) {
            return AIStateId.Idle;
        }

        const targetPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);

        if (!this.coverTarget) {
            return AIStateId.Attack;
        }

        const pos = ai.getOwnerPosition();
        if (pos && !this.inCover) {
            if (pos.distanceTo(this.coverTarget) < 1.2) {
                this.inCover = true;
                ai.movement.stop();
                ai.blackboard.setCover(this.coverTarget);
                ai.owner.setCrouch(true);
            } else {
                ai.movement.moveTo(this.coverTarget);
            }
        }

        if (this.inCover) {
            // Hold cover until healed or timer elapsed — don't pop out immediately
            const healedEnough = ai.owner.health > ai.healthThreshold * 0.72;
            const heldLongEnough = ai.blackboard.timeInCover > 4;

            if (healedEnough && heldLongEnough && !ai.owner.isUnderFire) {
                ai.owner.setCrouch(false);
                return AIStateId.Attack;
            }

            this.peekTimer -= dt;

            // Controlled peek shots — not full exposure
            if (this.peekTimer <= 0 && ai.blackboard.canPeekFire()) {
                this.peekTimer = 1.8 + Math.random() * 1.5;
                ai.blackboard.markPeekFire();
                const pos = ai.getOwnerPosition();
                if (pos) {
                    const toThreat = targetPos.clone().sub(pos).setY(0).normalize();
                    const lateral = new THREE.Vector3(-toThreat.z, 0, toThreat.x)
                        .multiplyScalar(this.peekSide * 0.9);
                    ai.movement.moveTo(pos.clone().add(lateral));
                    this.peekSide *= -1;
                }
                if (ai.senses.canSee(target)) {
                    aimAndFireAtTarget(ai, 0.06, {
                        moving: false,
                        suppressed: ai.owner.isUnderFire,
                        inCover: true,
                        distance: ai.getDistanceToTarget(),
                    });
                }
            }
        }

        return null;
    }

    exit(ai: EnemyAI): void {
        this.coverTarget = null;
        this.inCover = false;
        ai.owner.setCrouch(false);
        ai.blackboard.clearCover();
    }

    private findCover(ai: EnemyAI): void {
        const target = ai.target;
        if (!target || !target.body) return;

        const threatPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
        const cover = ai.cover.findCover(threatPos, ai);

        if (cover) {
            this.coverTarget = cover.position;
        }
    }
}
