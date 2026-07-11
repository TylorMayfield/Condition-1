import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';

export class IdleState implements IAIStateHandler {
    public readonly stateId = AIStateId.Idle;
    private waitTime: number = 0;

    enter(ai: EnemyAI): void {
        ai.movement.stop();
        this.waitTime = 0.5 + Math.random() * 1.0; // Wait 0.5-1.5 seconds before patrol
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        // Target engagement handled by EnemyAI acquisition — don't snap to Chase here
        if (ai.target && ai.senses.canSee(ai.target) && ai.blackboard.isAcquiringTarget(ai.target)) {
            return null;
        }

        if (ai.blackboard.objectiveDestination) return AIStateId.Patrol;

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
