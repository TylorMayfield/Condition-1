export type EquipmentCategory = 'knife' | 'secondary' | 'primary' | 'grenade' | 'armor' | 'kit';
export type EquipmentTeam = 'TaskForce' | 'OpFor' | 'both';
export interface EquipmentDefinition { id: string; displayName: string; category: EquipmentCategory; price: number; team: EquipmentTeam; magazine?: number; reserveAmmo?: number; }

export const EQUIPMENT_CATALOG: readonly EquipmentDefinition[] = [
    { id: 'knife', displayName: 'Combat Knife', category: 'knife', price: 0, team: 'both' },
    { id: 'ct-pistol', displayName: 'Task Force Pistol', category: 'secondary', price: 0, team: 'TaskForce', magazine: 12, reserveAmmo: 24 },
    { id: 'op-pistol', displayName: 'OpFor Pistol', category: 'secondary', price: 0, team: 'OpFor', magazine: 20, reserveAmmo: 40 },
    { id: 'rifle', displayName: 'Assault Rifle', category: 'primary', price: 3100, team: 'both', magazine: 30, reserveAmmo: 90 },
    { id: 'sniper', displayName: 'Sniper Rifle', category: 'primary', price: 4750, team: 'both', magazine: 10, reserveAmmo: 30 },
    { id: 'frag', displayName: 'Frag Grenade', category: 'grenade', price: 300, team: 'both' },
    { id: 'armor', displayName: 'Kevlar', category: 'armor', price: 650, team: 'both' },
    { id: 'helmet', displayName: 'Kevlar + Helmet', category: 'armor', price: 1000, team: 'both' },
    { id: 'defuse-kit', displayName: 'Defuse Kit', category: 'kit', price: 400, team: 'TaskForce' },
];

export function getEquipment(id: string): EquipmentDefinition | undefined { return EQUIPMENT_CATALOG.find(item => item.id === id); }
export function canTeamBuy(item: EquipmentDefinition, team: 'TaskForce' | 'OpFor'): boolean { return item.team === 'both' || item.team === team; }
