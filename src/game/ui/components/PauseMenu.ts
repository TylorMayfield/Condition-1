import { HUDComponent } from './HUDComponent';
import { Game } from '../../../engine/Game';

export class PauseMenu extends HUDComponent {
    private game: Game;

    constructor(game: Game) {
        super();
        this.game = game;
        this.container.className = 'hud-pause-container';
        this.container.style.display = 'none';
        this.createDOM();
    }

    private createDOM() {
        this.container.innerHTML = `
            <div class="hud-pause">
                <h2 class="hud-pause__title">Paused</h2>
                <div class="hud-pause__actions">
                    <button id="resume-btn" class="hud-pause__btn">Resume</button>
                    <button id="bake-btn" class="hud-pause__btn">Bake Navmesh</button>
                </div>
            </div>
        `;

        this.container.querySelector('#resume-btn')?.addEventListener('click', () => {
            this.game.togglePause();
        });

        this.container.querySelector('#bake-btn')?.addEventListener('click', () => {
            console.log('Bake navmesh requested');
        });
    }

    public update(_dt: number): void {
        const paused = this.game.isPaused;
        this.container.style.display = paused ? 'block' : 'none';
        this.container.style.pointerEvents = paused ? 'auto' : 'none';
    }
}
