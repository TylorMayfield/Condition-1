
export interface ShopItem {
    id: string;
    name: string;
    cost: number;
    description: string;
    type: 'UNIT_UPGRADE' | 'NEW_UNIT' | 'PHYSICS_MOD';
    effect: (gamemode: any) => void;
}

export class MallowShop {
    public inventory: ShopItem[] = [];
    
    constructor() {
        this.generateInventory();
    }
    
    public generateInventory(): void {
        this.inventory = [
            {
                id: 'mass_boost',
                name: 'Lead Belly',
                cost: 50,
                description: 'Increase Mallow Mass by 50%',
                type: 'UNIT_UPGRADE',
                effect: () => {
                    // Apply to all current mallows? Or next spawned one?
                    // For now, apply to player stats
                    console.log("Bought Mass Boost");
                }
            },
            {
                id: 'new_tank',
                name: 'Hire Tank',
                cost: 100,
                description: 'Add a Tank Mallow to your team',
                type: 'NEW_UNIT',
                effect: () => {
                    console.log("Bought Tank");
                }
            },
            {
                id: 'gravity_bomb',
                name: 'Gravity Bomb',
                cost: 200,
                description: 'One-time use: Suck enemies in',
                type: 'PHYSICS_MOD',
                effect: () => {
                    console.log("Bought Gravity Bomb");
                }
            }
        ];
    }
    
    public buyItem(itemId: string, currentGold: number): ShopItem | null {
        const item = this.inventory.find(i => i.id === itemId);
        if (item && item.cost <= currentGold) {
            return item;
        }
        return null;
    }
}
