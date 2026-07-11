import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';

export class AlertState implements IAIStateHandler {
    public readonly stateId = AIStateId.Alert;

    enter(ai: EnemyAI): void {
        ai.movement.setRunning(false);
    }

    update(ai: EnemyAI, dt: number): AIStateId | null {
        if (ai.target && ai.senses.canSee(ai.target)) {
            if (ai.blackboard.isAcquiringTarget(ai.target)) {
                return null;
            }
            ai.blackboard.sawTarget(
                new THREE.Vector3(ai.target.body!.position.x, ai.target.body!.position.y, ai.target.body!.position.z)
            );
            return AIStateId.Chase;
        }

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
