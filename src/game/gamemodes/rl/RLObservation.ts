import * as THREE from 'three';
import type { Enemy } from '../../Enemy';
import type { Observation } from '../../rl/EnvWrapper';

export interface AliveBotSets {
    taskForce: Set<Enemy>;
    opFor: Set<Enemy>;
}

export function buildVisionGrid(bot: Enemy, alive: AliveBotSets): number[] {
    const grid = new Array(32 * 32).fill(0);
    const botPos = bot.body?.position;
    if (!botPos) return grid;

    const allBots = Array.from(alive.taskForce).concat(Array.from(alive.opFor));
    for (const other of allBots) {
        if (other === bot) continue;
        const otherPos = other.body?.position;
        if (!otherPos) continue;

        const dx = otherPos.x - botPos.x;
        const dz = otherPos.z - botPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 50) continue;

        const gridX = Math.floor((dx + 32) / 2);
        const gridZ = Math.floor((dz + 32) / 2);

        if (gridX >= 0 && gridX < 32 && gridZ >= 0 && gridZ < 32) {
            const idx = gridZ * 32 + gridX;
            grid[idx] = other.team === bot.team ? 1 : 2;
        }
    }
    return grid;
}

export function raycastCover(_bot: Enemy): number {
    // Placeholder until physics raycast is wired
    return 1;
}

export function buildObservation(bot: Enemy, alive: AliveBotSets): Observation {
    const body = bot.body;
    const pos = body ? body.position : { x: 0, y: 0, z: 0 };
    const vel = body ? body.velocity : { x: 0, y: 0, z: 0 };
    const coverDist = raycastCover(bot);
    const isUnderFire = bot.isUnderFire ? 1 : 0;

    return {
        position: [pos.x, pos.y, pos.z],
        velocity: [vel.x, vel.y, vel.z],
        health: bot.health,
        armor: 0,
        weaponId: 0,
        ammo: (bot.weapon as { currentAmmo?: number })?.currentAmmo ?? 30,
        crouch: (bot as unknown as { isProne?: boolean }).isProne ? 1 : 0,
        grenades: 0,
        team: bot.team === 'TaskForce' ? 0 : 1,
        visionGrid: buildVisionGrid(bot, alive),
        coverDistance: coverDist,
        isUnderFire,
    };
}
