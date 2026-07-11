import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';
import { aimAndFireAtTarget } from '../AICombat';
import { AITactics } from '../AITactics';
import { AITeamCoordinator } from '../AITeamCoordinator';

export class FlankState implements IAIStateHandler {
    public readonly stateId = AIStateId.Flank;
    private flankTarget: THREE.Vector3 | null = null;

    enter(ai: EnemyAI): void {
        this.findFlankPosition(ai);
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

        const pos = ai.getOwnerPosition();
        if (pos && pos.distanceTo(this.flankTarget) < 2.5) {
            return AIStateId.Attack;
        }

        ai.movement.moveTo(this.flankTarget);

        // Suppress while flanking — only snap shots if exposed with clear angle
        if (ai.senses.canSee(target) && ai.blackboard.canPeekFire() && ai.getDistanceToTarget() < 25) {
            ai.blackboard.markPeekFire();
            aimAndFireAtTarget(ai, 0.05, {
                moving: true,
                suppressed: false,
                distance: ai.getDistanceToTarget(),
            });
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
        const preferred = ai.entityId % 2 === 0 ? 'left' : 'right';
        const side = AITeamCoordinator.reserveFlank(ai, preferred);
        if (!side) return;
        const flankPos = ai.cover.findFlankPosition(threatPos, side);

        if (flankPos) {
            this.flankTarget = AITactics.snapToNavMesh(ai.game, flankPos);
        }
    }
}
