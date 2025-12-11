import { Game } from '../engine/Game';
import * as THREE from 'three';
import { WeaponWheel } from './components/WeaponWheel';
import { WeaponSelector } from './components/WeaponSelector';
import { HUDComponent } from './ui/components/HUDComponent';
import { Scoreboard } from './ui/components/Scoreboard';
import { Compass } from './ui/components/Compass';
import { PlayerStats } from './ui/components/PlayerStats';
import { DebugStats } from './ui/components/DebugStats';
import { PauseMenu } from './ui/components/PauseMenu';

export class HUDManager {
    private game: Game;
    private container: HTMLDivElement;

    // Components
    private components: HUDComponent[] = [];

    // Legacy / Specific
    private weaponWheel: WeaponWheel;
    private weaponSelector: WeaponSelector;

    // Exposed for GameMode to use (e.g. showCountdown)
    private roundResultDisplay: HTMLDivElement | null = null;
    private countdownDisplay: HTMLDivElement | null = null;

    constructor(game: Game) {
        this.game = game;
        this.container = document.createElement('div');
        this.container.id = 'hud-container';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.pointerEvents = 'none'; // Click through
        document.body.appendChild(this.container);

        this.createVignette();

        // Initialize Components
        this.components.push(new PlayerStats(game));
        this.components.push(new Compass(game));
        this.components.push(new DebugStats(game));
        this.components.push(new Scoreboard(game));
        this.components.push(new PauseMenu(game));

        // Mount all
        this.components.forEach(c => c.mount(this.container));

        // Legacy / Specific logic kept here for now or moved later
        this.weaponWheel = new WeaponWheel(game);
        this.weaponSelector = new WeaponSelector(game);
    }

    public update(dt: number) {
        // Update all components
        this.components.forEach(c => c.update(dt));

        // Update Weapon Logic
        if (this.weaponWheel) {
            if (this.game.input.getKey('KeyX')) {
                this.weaponWheel.show();
            } else {
                this.weaponWheel.hide();
            }
        }
        this.weaponSelector.update();
    }

    // Keep these methods for compatibility with GameMode calls
    public showRoundResult(winner: string | null, reason: string) {
        if (!this.roundResultDisplay) {
            this.roundResultDisplay = document.createElement('div');
            this.roundResultDisplay.style.position = 'absolute';
            this.roundResultDisplay.style.top = '30%';
            this.roundResultDisplay.style.left = '50%';
            this.roundResultDisplay.style.transform = 'translate(-50%, -50%)';
            this.roundResultDisplay.style.textAlign = 'center';
            this.roundResultDisplay.style.textShadow = '0 0 10px rgba(0,0,0,0.8)';
            this.roundResultDisplay.style.fontFamily = "'Segoe UI', sans-serif";
            this.container.appendChild(this.roundResultDisplay);
        }

        const color = winner === 'TaskForce' ? '#00ccff' : (winner === 'OpFor' ? '#ff3300' : '#ffffff');

        this.roundResultDisplay.innerHTML = `
            <div style="font-size: 48px; font-weight: 800; color: ${color}; text-transform: uppercase; margin-bottom: 10px;">
                ${winner ? winner + ' WINS' : 'ROUND DRAW'}
            </div>
            <div style="font-size: 24px; color: #fff; opacity: 0.8;">
                ${reason}
            </div>
        `;

        this.roundResultDisplay.style.display = 'block';

        // Auto hide after a few seconds
        setTimeout(() => {
            if (this.roundResultDisplay) this.roundResultDisplay.style.display = 'none';
        }, 4000);
    }

    public showCountdown(seconds: number) {
        if (!this.countdownDisplay) {
            this.countdownDisplay = document.createElement('div');
            this.countdownDisplay.style.position = 'absolute';
            this.countdownDisplay.style.top = '50%';
            this.countdownDisplay.style.left = '50%';
            this.countdownDisplay.style.transform = 'translate(-50%, -50%)';
            this.countdownDisplay.style.textAlign = 'center';
            this.countdownDisplay.style.fontFamily = "'Segoe UI', sans-serif";
            this.countdownDisplay.style.pointerEvents = 'none';
            this.container.appendChild(this.countdownDisplay);
        }

        // Display countdown with animation effect
        const displayNumber = Math.max(1, seconds);
        this.countdownDisplay.innerHTML = `
            <div style="font-size: 64px; font-weight: bold; color: yellow; text-shadow: 0 0 20px orange;">
                ${displayNumber}
            </div>
        `;

        this.countdownDisplay.style.display = 'block';
    }

    public hideCountdown() {
        if (this.countdownDisplay) {
            this.countdownDisplay.style.display = 'none';
        }
    }

    private createVignette(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '0';
        div.style.left = '0';
        div.style.width = '100%';
        div.style.height = '100%';
        div.style.pointerEvents = 'none';

        // Goggle vignette
        const svgMask = `data:image/svg+xml,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                <defs>
                    <radialGradient id="vignette" cx="50%" cy="50%">
                        <stop offset="60%" stop-color="white" stop-opacity="0"/>
                        <stop offset="100%" stop-color="white" stop-opacity="1"/>
                    </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#vignette)"/>
                <ellipse cx="50%" cy="100%" rx="15%" ry="8%" fill="white" opacity="0.2"/>
            </svg>
        `)}`;

        div.style.background = 'rgba(0,0,0,0.3)';
        div.style.maskImage = svgMask;
        div.style.webkitMaskImage = svgMask;
        div.style.maskSize = '100% 100%';
        div.style.webkitMaskSize = '100% 100%';

        if (this.container.firstChild) {
            this.container.insertBefore(div, this.container.firstChild);
        } else {
            this.container.appendChild(div);
        }
        return div;
    }
}
