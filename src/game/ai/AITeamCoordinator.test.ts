import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AITeamCoordinator } from './AITeamCoordinator';
import type { EnemyAI } from '../components/EnemyAI';

function mockAI(id: number): EnemyAI {
    return {
        entityId: id,
        owner: { team: 'OpFor' },
        blackboard: { assignedTarget: null },
    } as unknown as EnemyAI;
}

describe('AITeamCoordinator', () => {
    it('selects a team buy and unique five-player roles', () => {
        expect(AITeamCoordinator.classifyBuy([5000, 4300, 4600])).toBe('full-buy');
        expect(AITeamCoordinator.classifyBuy([900, 1200, 1500])).toBe('eco');
        const roles = AITeamCoordinator.assignSquadRoles(5, true);
        expect(new Set(roles).size).toBe(5);
        expect(roles[0]).toBe('carrier');
    });
    it('prevents teammates from reserving the same cover', () => {
        const first = mockAI(101);
        const second = mockAI(102);
        const cover = new THREE.Vector3(4, 0, 8);

        expect(AITeamCoordinator.reserveCover(first, cover)).toBe(true);
        expect(AITeamCoordinator.reserveCover(second, cover)).toBe(false);

        AITeamCoordinator.releaseAll(first);
        expect(AITeamCoordinator.reserveCover(second, cover)).toBe(true);
        AITeamCoordinator.releaseAll(second);
    });

    it('distributes flank sides across a team', () => {
        const first = mockAI(201);
        const second = mockAI(202);

        expect(AITeamCoordinator.reserveFlank(first, 'left')).toBe('left');
        expect(AITeamCoordinator.reserveFlank(second, 'left')).toBe('right');

        AITeamCoordinator.releaseAll(first);
        AITeamCoordinator.releaseAll(second);
    });
});
