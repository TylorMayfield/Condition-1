import * as THREE from 'three';
import type { EnemyAI } from '../components/EnemyAI';
import type { FireContext } from '../components/EnemyWeapon';
import { AITactics } from './AITactics';

/** Synchronize body/head/weapon aim toward a world position. */
export function aimAtPosition(ai: EnemyAI, targetPos: THREE.Vector3): void {
    const owner = ai.owner;
    if (!owner.body || !owner.mesh) return;

    const headPos = owner.head
        ? owner.head.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(owner.body.position.x, owner.body.position.y + 1.5, owner.body.position.z);

    const dx = targetPos.x - headPos.x;
    const dz = targetPos.z - headPos.z;
    const dy = targetPos.y - headPos.y;
    const distH = Math.sqrt(dx * dx + dz * dz);

    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.max(distH, 0.01));

    owner.setLookAngles(yaw, pitch);
    owner.weapon?.aimAt(targetPos);
}

/** Aim at predicted target location, then fire along look direction. */
export function aimAndFireAtTarget(ai: EnemyAI, leadTime: number, context: FireContext = {}): void {
    const target = ai.target;
    if (!target?.body || !ai.senses.canSee(target)) return;

    const targetPos = new THREE.Vector3(
        target.body.position.x,
        target.body.position.y + 0.4,
        target.body.position.z,
    );
    const aimPos = ai.blackboard.predictTargetPosition(leadTime) ?? targetPos;

    aimAtPosition(ai, aimPos);

    const tactics = AITactics.getPersonality(ai);
    ai.owner.fireAtLookDirection({
        ...context,
        personality: ai.personality,
        distance: ai.getDistanceToTarget(),
        accuracyScale: tactics.accuracyBonus * ai.difficultyAccuracyScale,
    });
}
