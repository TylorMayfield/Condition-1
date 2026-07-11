import * as THREE from 'three';
import type { IAIStateHandler } from '../AIStateMachine';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';

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
