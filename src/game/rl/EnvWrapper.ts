// Reinforcement Learning Environment Wrapper for Team Deathmatch
// This file provides a Gym‑like interface used by the training pipeline.
// Note: This is a reference implementation - actual usage requires Game integration.

import { Enemy } from "../Enemy";

/**
 * Observation type – a flat Float32Array or object that can be fed to the policy.
 */
export interface Observation {
    position: number[]; // [x, y, z]
    velocity: number[]; // [vx, vy, vz]
    health: number;
    armor: number;
    weaponId: number;
    ammo: number;
    crouch: number; // 0 or 1
    grenades: number;
    team: number; // 0 = TaskForce, 1 = OpFor
    visionGrid: number[]; // flattened binary grid (e.g., 32*32)
}

/**
 * Action type – discrete/continuous vector that the policy outputs.
 */
export interface Action {
    moveX: number; // -1 .. 1 (left/right)
    moveZ: number; // -1 .. 1 (forward/back)
    yaw: number;   // -π .. π
    pitch: number; // -π/2 .. π/2
    fire: number;  // 0 or 1
    crouchToggle: number; // 0 or 1
    throwGrenade: number; // 0 or 1
    jump: number; // 0 or 1
    sprint: number; // 0 or 1
}

/**
 * Helper functions for building observations from bots
 */
export function buildObservationFromBot(bot: Enemy): Observation {
    const body = bot.body;
    const pos = body ? body.position : { x: 0, y: 0, z: 0 };
    const vel = body ? body.velocity : { x: 0, y: 0, z: 0 };

    return {
        position: [pos.x, pos.y, pos.z],
        velocity: [vel.x, vel.y, vel.z],
        health: bot.health,
        armor: 0,
        weaponId: 0,
        ammo: (bot.weapon as any)?.currentAmmo ?? 30,
        crouch: 0,
        grenades: 0,
        team: bot.team === "TaskForce" ? 0 : 1,
        visionGrid: new Array(32 * 32).fill(0),
    };
}

/**
 * Apply an action to a bot
 */
export function applyActionToBot(bot: Enemy, action: Action): void {
    const speed = 5;
    const body = bot.body;
    const mesh = bot.mesh;

    // Movement
    if (body) {
        body.velocity.set(action.moveX * speed, body.velocity.y, action.moveZ * speed);
    }

    // Look direction
    if (mesh) {
        mesh.rotation.y = action.yaw;
    }

    // Fire - requires target
    if (action.fire && bot.weapon && bot.ai.target) {
        const targetPos = bot.ai.target.mesh?.position;
        if (targetPos) {
            bot.weapon.pullTrigger(targetPos);
        }
    }

    // Crouch (if method exists)
    if (action.crouchToggle && typeof (bot as any).toggleCrouch === 'function') {
        (bot as any).toggleCrouch();
    }

    // Grenade (if method exists)
    if (action.throwGrenade && typeof (bot as any).throwGrenade === 'function') {
        (bot as any).throwGrenade();
    }
}
