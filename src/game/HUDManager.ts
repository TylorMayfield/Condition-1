import { Game } from '../engine/Game';
import type { IHUDService, TrainingStatsPayload } from './services/IHUDService';
import { WeaponWheel } from './components/WeaponWheel';
import { WeaponSelector } from './components/WeaponSelector';
import { HUDComponent } from './ui/components/HUDComponent';
import { Scoreboard } from './ui/components/Scoreboard';
import { Compass } from './ui/components/Compass';
import { PlayerStats } from './ui/components/PlayerStats';
import { DebugStats } from './ui/components/DebugStats';
import { PauseMenu } from './ui/components/PauseMenu';

export class HUDManager implements IHUDService {
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
    private roundTimerDisplay: HTMLDivElement | null = null;
    private trainingStatsDisplay: HTMLDivElement | null = null;
    private tacticalStatus: HTMLDivElement | null = null;
    private buyMenu: HTMLDivElement | null = null;

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
        // Update all components (Simulation Logic)
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

    public render(dt: number) {
        // Update components that need render-frame timing (like FPS, interpolation)
        this.components.forEach(c => c.render(dt));
    }

    // Keep these methods for compatibility with GameMode calls
    public showRoundResult(winner: string | null, reason: string) {
        if (!this.roundResultDisplay) {
            this.roundResultDisplay = document.createElement('div');
            this.roundResultDisplay.className = 'hud-round-result';
            this.container.appendChild(this.roundResultDisplay);
        }

        const titleClass = winner === 'TaskForce'
            ? 'hud-round-result__title hud-round-result__title--blue'
            : winner === 'OpFor'
                ? 'hud-round-result__title hud-round-result__title--red'
                : 'hud-round-result__title hud-round-result__title--neutral';

        this.roundResultDisplay.innerHTML = `
            <div class="${titleClass}">
                ${winner ? winner + ' Wins' : 'Round Draw'}
            </div>
            <div class="hud-round-result__reason">${reason}</div>
        `;

        this.roundResultDisplay.style.display = 'block';

        setTimeout(() => {
            if (this.roundResultDisplay) this.roundResultDisplay.style.display = 'none';
        }, 4000);
    }

    public showCountdown(seconds: number) {
        if (!this.countdownDisplay) {
            this.countdownDisplay = document.createElement('div');
            this.countdownDisplay.className = 'hud-countdown';
            this.container.appendChild(this.countdownDisplay);
        }

        const displayNumber = Math.max(1, seconds);
        this.countdownDisplay.innerHTML = `
            <div class="hud-countdown__num">${displayNumber}</div>
        `;

        this.countdownDisplay.style.display = 'block';
    }

    public hideCountdown() {
        if (this.countdownDisplay) {
            this.countdownDisplay.style.display = 'none';
        }
    }

    /** Show round timer display at top of screen */
    public showRoundTimer(timeString: string) {
        if (!this.roundTimerDisplay) {
            this.roundTimerDisplay = document.createElement('div');
            this.roundTimerDisplay.className = 'hud-timer';
            this.container.appendChild(this.roundTimerDisplay);
        }

        const [minutes, seconds] = timeString.split(':').map(Number);
        const totalSeconds = minutes * 60 + seconds;

        this.roundTimerDisplay.className = 'hud-timer';
        if (totalSeconds <= 30) {
            this.roundTimerDisplay.classList.add('hud-timer--critical');
        } else if (totalSeconds <= 60) {
            this.roundTimerDisplay.classList.add('hud-timer--warn');
        }

        this.roundTimerDisplay.textContent = timeString;
        this.roundTimerDisplay.style.display = 'block';
    }

    /** Hide round timer display */
    public hideRoundTimer() {
        if (this.roundTimerDisplay) {
            this.roundTimerDisplay.style.display = 'none';
        }
    }

    /** Show training stats panel (for RL training mode) */
    public showTrainingStats(stats: TrainingStatsPayload) {
        if (!this.trainingStatsDisplay) {
            this.trainingStatsDisplay = document.createElement('div');
            this.trainingStatsDisplay.className = 'hud-training';
            this.container.appendChild(this.trainingStatsDisplay);
        }

        const progress = (stats.round / stats.maxRounds) * 100;
        const bufferProgress = (stats.experienceCount / stats.bufferSize) * 100;

        this.trainingStatsDisplay.innerHTML = `
            <div class="hud-training__title">RL Training</div>
            <div class="hud-training__row">Round: <span>${stats.round}/${stats.maxRounds}</span></div>
            <div class="hud-training__row">Time Left: <span style="color: ${stats.simTimeLeft < 10 ? 'var(--c1-red)' : 'inherit'}">${stats.simTimeLeft}s</span></div>
            <div class="hud-training__row">Avg Reward: <span style="color: ${stats.avgReward >= 0 ? 'var(--c1-glow)' : 'var(--c1-red)'}">${stats.avgReward.toFixed(2)}</span></div>
            <div class="hud-training__row">Steps: <span>${stats.trainingSteps}</span></div>
            <div class="hud-training__row">Buffer: <span>${stats.experienceCount}/${stats.bufferSize}</span></div>
            <div class="hud-training__bar"><div class="hud-training__bar-fill" style="width: ${progress}%"></div></div>
            <div class="hud-training__row" style="font-size:9px">Progress ${progress.toFixed(1)}%</div>
            <div class="hud-training__bar"><div class="hud-training__bar-fill hud-training__bar-fill--amber" style="width: ${bufferProgress}%"></div></div>
            <div class="hud-training__controls">
                <div class="hud-training__row">Speed: ${(this.game.timeScale || 1).toFixed(0)}x</div>
                <div class="hud-training__speed-btns">
                    <button class="hud-training__btn" onclick="window.game.timeScale = 1">1x</button>
                    <button class="hud-training__btn" onclick="window.game.timeScale = 5">5x</button>
                    <button class="hud-training__btn" onclick="window.game.timeScale = 20">20x</button>
                    <button class="hud-training__btn" onclick="window.game.timeScale = 100">MAX</button>
                </div>
                <button class="hud-training__btn" style="width:100%;margin-top:4px" onclick="window.game.renderingEnabled = !window.game.renderingEnabled">
                    ${this.game.renderingEnabled ? 'Disable Rendering' : 'Enable Rendering'}
                </button>
                <div class="hud-training__hint">Disable render for max training speed</div>
            </div>
        `;
        this.trainingStatsDisplay.style.display = 'block';
    }

    /** Hide training stats panel */
    public hideTrainingStats() {
        if (this.trainingStatsDisplay) {
            this.trainingStatsDisplay.style.display = 'none';
        }
    }

    private getTacticalStatus(): HTMLDivElement {
        if (!this.tacticalStatus) {
            this.tacticalStatus = document.createElement('div');
            this.tacticalStatus.className = 'hud-tactical-status';
            this.tacticalStatus.style.cssText = 'position:absolute;left:50%;bottom:12%;transform:translateX(-50%);padding:10px 18px;background:rgba(0,0,0,.72);color:#fff;font:700 16px monospace;z-index:50;';
            this.container.appendChild(this.tacticalStatus);
        }
        return this.tacticalStatus;
    }
    public showMoney(amount: number): void { const el = this.getTacticalStatus(); el.dataset.money = `$${amount}`; el.textContent = `${el.dataset.money} ${el.dataset.objective ?? ''}`.trim(); el.style.display = 'block'; }
    public showObjectiveStatus(text: string, urgent = false): void { const el = this.getTacticalStatus(); el.dataset.objective = text; el.style.color = urgent ? '#ff6655' : '#fff'; el.textContent = `${el.dataset.money ?? ''} ${text}`.trim(); el.style.display = 'block'; }
    public hideObjectiveStatus(): void { if (this.tacticalStatus) { delete this.tacticalStatus.dataset.objective; this.tacticalStatus.textContent = this.tacticalStatus.dataset.money ?? ''; } }
    public showInteractionProgress(label: string, progress: number): void { this.showObjectiveStatus(`${label} ${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, true); }
    public hideInteractionProgress(): void { this.hideObjectiveStatus(); }
    public showHalftime(): void { this.showObjectiveStatus('HALFTIME — SIDES SWITCHING'); }
    public showCampaignResult(title: string, nextUnlock?: string): void { this.showObjectiveStatus(`${title}${nextUnlock ? ` · Unlocked: ${nextUnlock}` : ''}`); }
    public showBuyMenu(items: ReadonlyArray<{ id: string; name: string; price: number; enabled: boolean }>, onPurchase: (id: string) => void): void {
        if (!this.buyMenu) { this.buyMenu = document.createElement('div'); this.buyMenu.className = 'hud-buy-menu'; this.buyMenu.style.cssText = 'position:absolute;inset:12% 20%;padding:24px;background:rgba(5,10,14,.96);border:1px solid #4dffaa;z-index:2000;pointer-events:auto;color:#fff;font-family:monospace;display:grid;gap:8px;'; this.container.appendChild(this.buyMenu); }
        this.buyMenu.innerHTML = '<h2>BUY EQUIPMENT</h2>';
        for (const item of items) { const button = document.createElement('button'); button.textContent = `${item.name} — $${item.price}`; button.disabled = !item.enabled; button.onclick = () => onPurchase(item.id); this.buyMenu.appendChild(button); }
        this.buyMenu.style.display = 'grid'; this.game.input.unlockCursor();
    }
    public hideBuyMenu(): void { if (this.buyMenu) this.buyMenu.style.display = 'none'; }

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

        div.style.background = 'rgba(4, 8, 12, 0.25)';
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
