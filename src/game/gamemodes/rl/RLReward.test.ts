import { describe, expect, it } from 'vitest';
import { computeStepReward } from './RLReward';
import type { TrainedBot } from './RLTrainingTypes';
import type { Observation } from '../../rl/EnvWrapper';
import type { Enemy } from '../../Enemy';

function makeObs(health: number, overrides: Partial<Observation> = {}): Observation {
    return {
        position: [0, 0, 0],
        velocity: [0, 0, 0],
        health,
        armor: 0,
        weaponId: 0,
        ammo: 30,
        crouch: 0,
        grenades: 0,
        team: 0,
        visionGrid: [],
        coverDistance: 1,
        isUnderFire: 0,
        ...overrides,
    };
}

function makeTrainedBot(): TrainedBot {
    return {
        bot: {} as Enemy,
        lastObs: null,
        lastAction: null,
        lastLogProb: 0,
        lastValue: 0,
        lastEnemyDamage: 0,
        lastFriendlyDamage: 0,
        spawnPosition: { x: 0, y: 0, z: 0 } as TrainedBot['spawnPosition'],
        stuckTimer: 0,
    };
}

describe('computeStepReward', () => {
    it('rewards enemy damage', () => {
        const tb = makeTrainedBot();
        const bot = {
            enemyDamageDealt: 20,
            friendlyDamageDealt: 0,
            isDead: false,
        } as Enemy;

        const reward = computeStepReward(bot, tb, makeObs(100), makeObs(100));
        expect(reward).toBe(10);
        expect(tb.lastEnemyDamage).toBe(20);
    });

    it('penalizes health loss and death', () => {
        const tb = makeTrainedBot();
        const bot = {
            enemyDamageDealt: 0,
            friendlyDamageDealt: 0,
            isDead: true,
        } as Enemy;

        const reward = computeStepReward(bot, tb, makeObs(100), makeObs(40));
        expect(reward).toBe(-62);
    });
});
