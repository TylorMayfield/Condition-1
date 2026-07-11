import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';
import { AITactics } from '../AITactics';
import type * as THREE from 'three';

export class RetreatState implements IAIStateHandler {
    public readonly stateId = AIStateId.Retreat;
    private retreatTarget: THREE.Vector3 | null = null;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
        this.retreatTarget = AITactics.findRetreatPosition(ai);
    }

    update(ai: EnemyAI, _dt: number): AIStateId | null {
        if (!this.retreatTarget) {
            return ai.blackboard.canSeekCover() ? AIStateId.TakeCover : AIStateId.Chase;
        }

        const pos = ai.getOwnerPosition();
        if (pos && pos.distanceTo(this.retreatTarget) < 2.0) {
            return AIStateId.TakeCover;
        }

        ai.movement.moveTo(this.retreatTarget);

        // Keep eyes on threat while backing out
        return null;
    }

    exit(_ai: EnemyAI): void {
        this.retreatTarget = null;
    }
}
