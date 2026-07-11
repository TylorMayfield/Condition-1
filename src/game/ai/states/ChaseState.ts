import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';
import { AIPersonality } from '../AIPersonality';
import { AITactics } from '../AITactics';

export class ChaseState implements IAIStateHandler {
    public readonly stateId = AIStateId.Chase;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        const target = ai.target;

        if (!target || !target.body) {
            if (ai.blackboard.lastKnownTargetPos) {
                return AIStateId.Search;
            }
            return AIStateId.Idle;
        }

        const targetPos = new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z);
        const canSee = ai.senses.canSee(target);
        const distance = ai.getDistanceToTarget();
        const tactics = AITactics.getPersonality(ai);

        if (canSee) {
            ai.blackboard.sawTarget(targetPos);
        }

        if (distance < ai.attackRange && canSee) {
            if (ai.minAttackRange > 0 && distance < ai.minAttackRange) {
                if (ai.personality === AIPersonality.Sniper) {
                    return AIStateId.Retreat;
                }
                if (ai.blackboard.canSeekCover()) {
                    return AIStateId.TakeCover;
                }
                return null;
            }
            return AIStateId.Attack;
        }

        if (ai.blackboard.canMakeTacticalDecision()) {
            ai.blackboard.markTacticalDecision(ai.tacticalDecisionInterval);
            const recentlyDamaged = ai.blackboard.timeSinceDamaged < 4;
            const lowHealth = ai.owner.health < ai.healthThreshold;
            const coverScore = (recentlyDamaged ? 0.4 : 0)
                + (lowHealth ? 0.35 : 0)
                + (ai.owner.isUnderFire ? 0.25 : 0)
                + tactics.coverEagerness * 0.15;

            if (coverScore >= 0.55 && ai.blackboard.canSeekCover() && distance > 5) {
                return AIStateId.TakeCover;
            }

            if (distance > tactics.flankDistance && ai.blackboard.canFlank() && canSee) {
                ai.blackboard.markFlank();
                return AIStateId.Flank;
            }
        }

        if (!canSee && ai.blackboard.timeSinceTargetSeen > 7) {
            return AIStateId.Search;
        }

        const moveTarget = canSee ? targetPos : ai.blackboard.lastKnownTargetPos;
        if (moveTarget) {
            const tacticalPos = AITactics.findChasePosition(ai, moveTarget);
            ai.movement.moveTo(tacticalPos);
        }

        return null;
    }

    exit(ai: EnemyAI): void {
        ai.movement.setRunning(false);
    }
}
