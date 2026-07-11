import { canTeamBuy, getEquipment, type EquipmentDefinition } from '../equipment/EquipmentCatalog';
import { EconomySystem } from './EconomySystem';

export interface PurchaserInventory { equipmentIds: readonly string[]; addEquipment(item: EquipmentDefinition): boolean; }
export type PurchaseFailure = 'not-buy-phase' | 'outside-buy-zone' | 'unknown-item' | 'team-restricted' | 'already-owned' | 'insufficient-funds';
export type PurchaseResult = { ok: true; item: EquipmentDefinition } | { ok: false; reason: PurchaseFailure };

export class PurchaseService {
    private economy: EconomySystem;
    constructor(economy: EconomySystem) { this.economy = economy; }
    buy(id: string, team: 'TaskForce' | 'OpFor', itemId: string, inventory: PurchaserInventory, canBuyNow: boolean, inBuyZone: boolean): PurchaseResult {
        if (!canBuyNow) return { ok: false, reason: 'not-buy-phase' };
        if (!inBuyZone) return { ok: false, reason: 'outside-buy-zone' };
        const item = getEquipment(itemId); if (!item) return { ok: false, reason: 'unknown-item' };
        if (!canTeamBuy(item, team)) return { ok: false, reason: 'team-restricted' };
        if (inventory.equipmentIds.includes(item.id)) return { ok: false, reason: 'already-owned' };
        if (!this.economy.purchase(id, item.price)) return { ok: false, reason: 'insufficient-funds' };
        if (!inventory.addEquipment(item)) return { ok: false, reason: 'already-owned' };
        return { ok: true, item };
    }
}
