import { Game } from '../../engine/Game';
import { Weapon } from './Weapon';

/**
 * Weapon category definitions (CS/HL style)
 * 1 = Primary (Rifles, SMGs)
 * 2 = Secondary (Pistols) 
 * 3 = Equipment (Grenades, Knife)
 */
export const WeaponCategory = {
    PRIMARY: 1,
    SECONDARY: 2,
    EQUIPMENT: 3
} as const;

export type WeaponCategory = typeof WeaponCategory[keyof typeof WeaponCategory];

interface WeaponSlot {
    weapon: Weapon;
    category: WeaponCategory;
    name: string;
}

/**
 * CS/Half-Life Style Weapon Selector
 * - Press number key to show category
 * - Press same key again to cycle within category
 * - Auto-hides after timeout
 */
export class WeaponSelector {
    private game: Game;
    private container!: HTMLDivElement;
    private isVisible: boolean = false;
    private hideTimer: number | null = null;
    private lastCategory: WeaponCategory | null = null;
    private categoryIndex: Map<WeaponCategory, number> = new Map();

    private readonly HIDE_DELAY = 2000; // 2 seconds

    constructor(game: Game) {
        this.game = game;
        this.createDOM();
    }

    private createDOM() {
        this.container = document.createElement('div');
        this.container.id = 'weapon-selector';
        this.container.style.cssText = `
            position: absolute;
            top: 60px;
            right: 20px;
            min-width: 250px;
            display: none;
            font-family: 'Consolas', 'Courier New', monospace;
            pointer-events: none;
            z-index: 1000;
        `;
        document.body.appendChild(this.container);
    }

    /**
     * Get weapons organized by category from player
     */
    private getWeaponsByCategory(): Map<WeaponCategory, WeaponSlot[]> {
        const categories = new Map<WeaponCategory, WeaponSlot[]>();
        const player = this.game.player;
        if (!player) return categories;

        // Access weapons via cast (Player.weapons is private)
        const weapons = (player as any).weapons as Weapon[];

        // Categorize weapons based on type/name
        weapons.forEach((weapon, _index) => {
            const name = weapon.constructor.name;
            let category: WeaponCategory;

            // Determine category based on weapon class name
            if (name.includes('Sniper') || name.includes('Rifle') || name === 'WeaponSystem') {
                category = WeaponCategory.PRIMARY;
            } else if (name.includes('Pistol')) {
                category = WeaponCategory.SECONDARY;
            } else {
                category = WeaponCategory.EQUIPMENT;
            }

            if (!categories.has(category)) {
                categories.set(category, []);
            }

            categories.get(category)!.push({
                weapon,
                category,
                name: this.getWeaponDisplayName(name)
            });
        });

        return categories;
    }

    private getWeaponDisplayName(className: string): string {
        const names: Record<string, string> = {
            'WeaponSystem': 'M4A1 Carbine',
            'SniperRifle': 'AWP',
            'Pistol': 'USP-S',
            'Grenade': 'Frag Grenade'
        };
        return names[className] || className;
    }

    /**
     * Handle category key press (1, 2, or 3)
     */
    public selectCategory(categoryNum: number) {
        const category = categoryNum as WeaponCategory;
        const categories = this.getWeaponsByCategory();
        const weaponsInCategory = categories.get(category);

        if (!weaponsInCategory || weaponsInCategory.length === 0) {
            // No weapons in this category
            return;
        }

        // Get current index in this category
        let index = this.categoryIndex.get(category) || 0;

        // If pressing same category again, cycle to next weapon
        if (this.lastCategory === category && this.isVisible) {
            index = (index + 1) % weaponsInCategory.length;
        } else {
            index = 0; // Reset to first weapon when switching categories
        }

        this.categoryIndex.set(category, index);
        this.lastCategory = category;

        // Select the weapon
        const selectedSlot = weaponsInCategory[index];
        this.selectWeapon(selectedSlot.weapon);

        // Update display
        this.showSelector(category, categories, index);

        // Reset hide timer
        this.resetHideTimer();
    }

    private selectWeapon(weapon: Weapon) {
        const player = this.game.player;
        if (!player) return;

        const weapons = (player as any).weapons as Weapon[];
        const weaponIndex = weapons.indexOf(weapon);

        if (weaponIndex >= 0) {
            player.switchWeapon(weaponIndex);
        }
    }

    private showSelector(activeCategory: WeaponCategory, categories: Map<WeaponCategory, WeaponSlot[]>, activeIndex: number) {
        let html = '';

        // Category labels
        const categoryNames: Record<WeaponCategory, string> = {
            [WeaponCategory.PRIMARY]: '1. PRIMARY',
            [WeaponCategory.SECONDARY]: '2. SECONDARY',
            [WeaponCategory.EQUIPMENT]: '3. EQUIPMENT'
        };

        // Build display for each category
        [WeaponCategory.PRIMARY, WeaponCategory.SECONDARY, WeaponCategory.EQUIPMENT].forEach(cat => {
            const weapons = categories.get(cat) || [];
            const isActiveCategory = cat === activeCategory;

            const catStyle = isActiveCategory
                ? 'color: #ff9900; font-weight: bold; text-shadow: 0 0 10px rgba(255,150,0,0.8);'
                : 'color: #666;';

            html += `<div style="margin-bottom: 8px;">`;
            html += `<div style="${catStyle} font-size: 12px; margin-bottom: 4px;">${categoryNames[cat]}</div>`;

            if (weapons.length > 0) {
                weapons.forEach((slot, idx) => {
                    const isSelected = isActiveCategory && idx === activeIndex;
                    const weaponStyle = isSelected
                        ? 'background: linear-gradient(90deg, rgba(255,150,0,0.3) 0%, transparent 100%); color: #fff; padding: 4px 8px; border-left: 3px solid #ff9900;'
                        : 'color: #888; padding: 4px 8px; padding-left: 11px;';

                    html += `<div style="${weaponStyle} font-size: 14px; transition: all 0.1s;">${slot.name}</div>`;
                });
            } else {
                html += `<div style="color: #444; font-size: 12px; padding-left: 11px; font-style: italic;">Empty</div>`;
            }

            html += `</div>`;
        });

        this.container.innerHTML = html;
        this.container.style.display = 'block';
        this.isVisible = true;
    }

    private resetHideTimer() {
        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
        }
        this.hideTimer = window.setTimeout(() => {
            this.hide();
        }, this.HIDE_DELAY);
    }

    public hide() {
        this.container.style.display = 'none';
        this.isVisible = false;
        this.lastCategory = null;
        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    public update() {
        // Check for number key presses
        if (this.game.input.getKeyDown('Digit1')) {
            this.selectCategory(1);
        }
        if (this.game.input.getKeyDown('Digit2')) {
            this.selectCategory(2);
        }
        if (this.game.input.getKeyDown('Digit3')) {
            this.selectCategory(3);
        }
    }

    public dispose() {
        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
        }
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
