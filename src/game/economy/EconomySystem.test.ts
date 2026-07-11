import { describe, expect, it } from 'vitest';
import { EconomySystem } from './EconomySystem';
describe('EconomySystem', () => {
    it('handles purchases and escalating loss rewards', () => {
        const e = new EconomySystem(); e.register('ct'); e.register('t'); expect(e.purchase('ct', 700)).toBe(true); expect(e.balance('ct')).toBe(100);
        const teams = new Map([['ct', 'TaskForce'], ['t', 'OpFor']] as const); e.settleRound({ winner: 'TaskForce', reason: 'elimination' }, teams, true);
        expect(e.balance('ct')).toBe(3350); expect(e.balance('t')).toBe(3000);
    });
});
