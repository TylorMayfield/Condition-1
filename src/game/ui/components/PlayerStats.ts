import { HUDComponent } from './HUDComponent';
import { Game } from '../../../engine/Game';

export class PlayerStats extends HUDComponent {
    private game: Game;
    private healthDisplay: HTMLElement;
    private ammoDisplay: HTMLElement;

    constructor(game: Game) {
        super();
        this.game = game;

        // Setup Container to hold both but positioned absolutely
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';

        this.healthDisplay = this.createHealthDisplay();
        this.ammoDisplay = this.createAmmoDisplay();

        this.container.appendChild(this.healthDisplay);
        this.container.appendChild(this.ammoDisplay);
    }

    private createHealthDisplay(): HTMLElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.bottom = '20px';
        div.style.left = '20px';
        div.style.fontSize = '24px';
        div.style.fontFamily = 'monospace';
        div.style.color = '#00ff00';
        div.style.textShadow = '1px 1px 0 #000';
        div.innerHTML = 'HEALTH: 100%';
        return div;
    }

    private createAmmoDisplay(): HTMLElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.bottom = '20px';
        div.style.right = '20px';
        div.style.fontSize = '24px';
        div.style.textAlign = 'right';
        div.style.fontFamily = 'monospace';
        div.style.color = '#00ff00';
        div.style.textShadow = '1px 1px 0 #000';
        div.innerHTML = 'AMMO: -- / --';
        return div;
    }

    public update(_dt: number): void {
        if (!this.game.player) return;

        // Hide if spectating
        if (this.game.player.isSpectating) {
            this.container.style.display = 'none';
            return;
        }
        this.container.style.display = 'block';

        // Update Health
        this.healthDisplay.innerText = `HEALTH: ${Math.max(0, this.game.player.health)}%`;

        // Update Ammo
        const weapon = this.game.player.getCurrentWeapon();
        if (weapon) {
            this.ammoDisplay.innerHTML = `MAG: ${weapon.currentAmmo} <br> RES: ${weapon.reserveAmmo}`;
        } else {
            this.ammoDisplay.innerHTML = `AMMO: -- / --`;
        }
    }
}
