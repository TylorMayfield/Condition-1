import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';

export class AdvanceState implements IAIStateHandler {
    public readonly stateId = AIStateId.Advance;

    enter(ai: EnemyAI): void {
        // No sprinting - tactical advance only
        ai.movement.setRunning(false);
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
