import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { Game } from '../../../engine/Game';

/** Pick a spawn that avoids overlap and snaps to the nav mesh when available. */
export function getSafeSpawnPosition(
    game: Game,
    spawns: THREE.Vector3[],
    applyJitter: boolean = false,
): THREE.Vector3 {
    if (!spawns || spawns.length === 0) return new THREE.Vector3(0, 10, 0);

    const shuffled = [...spawns].sort(() => Math.random() - 0.5);

    for (const spawn of shuffled) {
        let candidate = spawn.clone();

        if (applyJitter) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 2.5;
            candidate.x += Math.sin(angle) * dist;
            candidate.z += Math.cos(angle) * dist;
        }

        if (game.recastNav) {
            const snapped = game.recastNav.closestPointTo(candidate);
            if (snapped) {
                candidate = snapped;
            } else if (applyJitter) {
                continue;
            }
        }

        let blocked = false;
        for (const body of game.world.bodies) {
            const dist = body.position.distanceTo(new CANNON.Vec3(candidate.x, candidate.y, candidate.z));
            if (dist < 1.0) {
                blocked = true;
                break;
            }
        }

        if (!blocked) {
            return candidate;
        }
    }

    console.warn('All spawn points blocked! Picking best available.');

    for (const spawn of shuffled) {
        if (game.recastNav) {
            const snapped = game.recastNav.closestPointTo(spawn);
            if (snapped) return snapped;
        }
    }

    return shuffled[0].clone();
}

export function getTeamSpawnPosition(
    game: Game,
    team: string,
    applyJitter: boolean = false,
): THREE.Vector3 | null {
    const spawns =
        team === 'TaskForce'
            ? game.availableSpawns?.CT || []
            : game.availableSpawns?.T || [];
    return getSafeSpawnPosition(game, spawns, applyJitter);
}
