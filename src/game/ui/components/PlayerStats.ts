import { HUDComponent } from './HUDComponent';
import { Game } from '../../../engine/Game';

export class PlayerStats extends HUDComponent {
    private game: Game;
    private healthDisplay: HTMLDivElement | null = null;
    private ammoDisplay: HTMLDivElement | null = null;

    constructor(game: Game) {
        super();
        this.game = game;
        this.container.className = 'hud-player-stats';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.position = 'absolute';
        this.createDOM();
    }

    private createDOM() {
        this.healthDisplay = document.createElement('div');
        this.healthDisplay.className = 'hud-stat-panel hud-stat-panel--left';
        this.healthDisplay.innerHTML = `
            <div class="hud-stat-label">Health</div>
            <div class="hud-stat-value">100%</div>
        `;
        this.container.appendChild(this.healthDisplay);

        this.ammoDisplay = document.createElement('div');
        this.ammoDisplay.className = 'hud-stat-panel hud-stat-panel--right';
        this.ammoDisplay.innerHTML = `
            <div class="hud-stat-label">Ammunition</div>
            <div class="hud-stat-value">— / —</div>
        `;
        this.container.appendChild(this.ammoDisplay);
    }

    public update(_dt: number): void {
        const player = this.game.player;
        if (!player || this.game.isPaused) {
            this.container.style.display = 'none';
            return;
        }
        this.container.style.display = 'block';

        const healthVal = this.healthDisplay?.querySelector('.hud-stat-value');
        if (healthVal) {
            const maxHealth = 100;
            const pct = Math.max(0, Math.round((player.health / maxHealth) * 100));
            healthVal.textContent = `${pct}%`;
            healthVal.classList.toggle('hud-stat-value--warn', pct <= 25);
        }

        const ammoVal = this.ammoDisplay?.querySelector('.hud-stat-value');
        const weapon = player.getCurrentWeapon();
        if (ammoVal) {
            if (weapon) {
                ammoVal.textContent = `${weapon.currentAmmo} / ${weapon.reserveAmmo}`;
            } else {
                ammoVal.textContent = '— / —';
            }
        }
    }
}
