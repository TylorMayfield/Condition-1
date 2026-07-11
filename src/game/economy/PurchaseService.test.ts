import { describe, expect, it } from 'vitest';
import { EconomySystem } from './EconomySystem';
import { PurchaseService } from './PurchaseService';
describe('PurchaseService', () => {
    it('rejects invalid purchases without changing money', () => {
        const economy = new EconomySystem(); economy.register('p'); const service = new PurchaseService(economy);
        const inventory = { equipmentIds: [] as string[], addEquipment: () => true };
        expect(service.buy('p', 'OpFor', 'defuse-kit', inventory, true, true)).toEqual({ ok: false, reason: 'team-restricted' });
        expect(service.buy('p', 'OpFor', 'rifle', inventory, false, true)).toEqual({ ok: false, reason: 'not-buy-phase' });
        expect(economy.balance('p')).toBe(800);
    });
});
