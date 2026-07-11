import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { IdleState } from './IdleState';
import { ChaseState } from './ChaseState';
import { PatrolState } from './PatrolState';
import { AIStateId } from '../AIState';
import type { EnemyAI } from '../../components/EnemyAI';

function createMockAI(overrides: Partial<EnemyAI> = {}): EnemyAI {
    const movement = {
        stop: vi.fn(),
        setRunning: vi.fn(),
        moveTo: vi.fn(),
        isMoving: vi.fn(() => false),
        lookAt: vi.fn(),
        strafe: vi.fn(),
    };

    return {
        movement,
        blackboard: {
            isAcquiringTarget: vi.fn(() => false),
            getMostImportantSound: vi.fn(() => null),
            heardSounds: [],
            sawTarget: vi.fn(),
            canSeekCover: vi.fn(() => true),
            canFlank: vi.fn(() => false),
            canMakeTacticalDecision: vi.fn(() => true),
            markTacticalDecision: vi.fn(),
            markFlank: vi.fn(),
            timeSinceTargetSeen: Infinity,
            lastKnownTargetPos: null,
            predictTargetPosition: vi.fn(() => null),
            timeSinceDamaged: Infinity,
        },
        senses: { canSee: vi.fn(() => false) },
        target: null,
        alertParams: null,
        getDistanceToTarget: vi.fn(() => Infinity),
        attackRange: 20,
        minAttackRange: 0,
        healthThreshold: 40,
        owner: { health: 100, isUnderFire: false, weapon: { pullTrigger: vi.fn() } },
        ...overrides,
    } as unknown as EnemyAI;
}

describe('IdleState', () => {
    it('transitions to Patrol after wait', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);

        const state = new IdleState();
        const ai = createMockAI();
        state.enter(ai);

        expect(state.update(ai, 0.6)).toBe(AIStateId.Patrol);
    });

    it('investigates sounds via Alert', () => {
        const state = new IdleState();
        const sound = { pos: { clone: () => ({ x: 1, y: 0, z: 1 }) }, time: Date.now(), priority: 1 };
        const ai = createMockAI({
            blackboard: {
                isAcquiringTarget: vi.fn(() => false),
                getMostImportantSound: vi.fn(() => sound),
                heardSounds: [sound],
            } as unknown as EnemyAI['blackboard'],
        });

        state.enter(ai);
        expect(state.update(ai, 0.1)).toBe(AIStateId.Alert);
    });
});

describe('ChaseState', () => {
    it('transitions to Attack when in range with line of sight', () => {
        const state = new ChaseState();
        const target = { body: { position: { x: 0, y: 0, z: 5 } } };
        const ai = createMockAI({
            target: target as EnemyAI['target'],
            senses: { canSee: vi.fn(() => true) } as unknown as EnemyAI['senses'],
            getDistanceToTarget: vi.fn(() => 10),
        });

        state.enter(ai);
        expect(state.update(ai, 0.016)).toBe(AIStateId.Attack);
    });

    it('searches when target is lost', () => {
        const state = new ChaseState();
        const ai = createMockAI({
            target: null,
            blackboard: {
                isAcquiringTarget: vi.fn(() => false),
                lastKnownTargetPos: { x: 0, y: 0, z: 0 },
                timeSinceTargetSeen: 10,
                canSeekCover: vi.fn(() => false),
                canFlank: vi.fn(() => false),
            } as unknown as EnemyAI['blackboard'],
        });

        state.enter(ai);
        expect(state.update(ai, 0.016)).toBe(AIStateId.Search);
    });
});

describe('PatrolState objective orders', () => {
    it('follows the squad objective instead of choosing random patrol points', () => {
        const destination = new THREE.Vector3(8, 0, 4);
        const ai = createMockAI({
            useRecast: true,
            game: { recastNav: null } as unknown as EnemyAI['game'],
            getOwnerPosition: vi.fn(() => new THREE.Vector3(0, 0, 0)),
            blackboard: { objectiveDestination: destination } as unknown as EnemyAI['blackboard'],
        });
        const state = new PatrolState(); state.enter(ai); state.update(ai, 0.1);
        expect(ai.movement.moveTo).toHaveBeenCalledWith(destination);
    });
});
