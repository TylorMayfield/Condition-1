import { HUDComponent } from './HUDComponent';
import { Game } from '../../../engine/Game';

export class PauseMenu extends HUDComponent {
    private game: Game;

    constructor(game: Game) {
        super();
        this.game = game;
        this.createDOM();
        this.setVisible(false); // Hidden by default
    }

    private createDOM() {
        this.container.style.position = 'absolute';
        this.container.style.top = '50%';
        this.container.style.left = '50%';
        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.backgroundColor = 'rgba(0, 20, 0, 0.9)';
        this.container.style.border = '2px solid #00ff00';
        this.container.style.padding = '20px';
        this.container.style.borderRadius = '8px';
        this.container.style.pointerEvents = 'auto'; // Allow clicking buttons
        this.container.style.textAlign = 'center';

        // Ensure buttons are clickable
        this.container.style.zIndex = '200';

        this.container.innerHTML = `
            <h2 style="color: #00ff00; margin-bottom: 20px;">PAUSED</h2>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="resume-btn" style="padding: 10px 20px; background: #004400; color: #fff; border: 1px solid #00ff00; cursor: pointer;">RESUME</button>
                <button id="bake-btn" style="padding: 10px 20px; background: #004400; color: #fff; border: 1px solid #00ff00; cursor: pointer;">BAKE NAVMESH</button>
            </div>
        `;

        // Attach listeners
        const resumeBtn = this.container.querySelector('#resume-btn') as HTMLButtonElement;
        if (resumeBtn) {
            resumeBtn.onclick = () => {
                this.game.togglePause();
            };
        }

        const bakeBtn = this.container.querySelector('#bake-btn') as HTMLButtonElement;
        if (bakeBtn) {
            bakeBtn.onclick = () => {
                console.log("Navmesh baking via HUD is currently disabled with Recast.");
                alert("Navmesh baking via HUD is disabled. Use the build tools.");
            };
        }
    }

    public update(_dt: number): void {
        // Toggle visibility based on game state
        if (this.game.isPaused) {
            if (!this.isVisible()) this.setVisible(true);
        } else {
            if (this.isVisible()) this.setVisible(false);
        }
    }
}
