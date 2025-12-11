import { HUDComponent } from './HUDComponent';
import { Game } from '../../../engine/Game';
import { type ScoreData } from '../../gamemodes/GameMode';

export class Scoreboard extends HUDComponent {
    private game: Game;

    // Cached elements
    private taskforcePlayers: HTMLElement | null = null;
    private opforPlayers: HTMLElement | null = null;
    private taskforceScore: HTMLElement | null = null;
    private opforScore: HTMLElement | null = null;
    private roundInfo: HTMLElement | null = null;

    constructor(game: Game) {
        super();
        this.game = game;
        this.initStyles();
        this.createDOM();
        this.setVisible(false); // Hidden by default
    }

    private initStyles() {
        this.container.style.position = 'absolute';
        this.container.style.top = '50%';
        this.container.style.left = '50%';
        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.fontFamily = "'Segoe UI', Roboto, sans-serif";
        this.container.style.minWidth = '700px';
        this.container.style.zIndex = '100'; // Ensure on top
    }

    private createDOM() {
        this.container.innerHTML = `
            <div style="
                background: linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(20,30,20,0.95) 100%);
                backdrop-filter: blur(10px);
                border: 2px solid rgba(0,255,0,0.3);
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1);
                overflow: hidden;
            ">
                <!-- Header with Round Info -->
                <div style="
                    background: linear-gradient(90deg, rgba(0,100,50,0.5) 0%, rgba(0,50,100,0.5) 100%);
                    padding: 15px 20px;
                    text-align: center;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                ">
                    <div id="scoreboard-title" style="
                        font-size: 24px;
                        font-weight: 700;
                        color: #fff;
                        text-transform: uppercase;
                        letter-spacing: 3px;
                        text-shadow: 0 0 20px rgba(0,255,100,0.5);
                    ">TEAM DEATHMATCH</div>
                    <div id="scoreboard-round" style="
                        font-size: 14px;
                        color: rgba(255,255,255,0.7);
                        margin-top: 5px;
                    ">Round 1</div>
                </div>

                <!-- Teams Container -->
                <div style="display: flex; padding: 15px; gap: 15px;">
                    <!-- TaskForce Team -->
                    <div style="flex: 1;">
                        <div style="
                            background: linear-gradient(180deg, rgba(0,100,200,0.3) 0%, transparent 100%);
                            border: 1px solid rgba(0,150,255,0.3);
                            border-radius: 8px;
                            overflow: hidden;
                        ">
                            <div style="
                                padding: 10px 15px;
                                background: rgba(0,100,200,0.2);
                                border-bottom: 1px solid rgba(0,150,255,0.3);
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="color: #4dabff; font-weight: 600; font-size: 14px;">⚔️ TASKFORCE</span>
                                <span id="taskforce-score" style="
                                    background: #0066cc;
                                    color: white;
                                    padding: 3px 12px;
                                    border-radius: 10px;
                                    font-weight: bold;
                                    font-size: 14px;
                                ">0</span>
                            </div>
                            <div id="taskforce-players" style="padding: 10px;"></div>
                        </div>
                    </div>

                    <!-- OpFor Team -->
                    <div style="flex: 1;">
                        <div style="
                            background: linear-gradient(180deg, rgba(200,50,0,0.3) 0%, transparent 100%);
                            border: 1px solid rgba(255,100,50,0.3);
                            border-radius: 8px;
                            overflow: hidden;
                        ">
                            <div style="
                                padding: 10px 15px;
                                background: rgba(200,50,0,0.2);
                                border-bottom: 1px solid rgba(255,100,50,0.3);
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="color: #ff6b4a; font-weight: 600; font-size: 14px;">💀 OPFOR</span>
                                <span id="opfor-score" style="
                                    background: #cc3300;
                                    color: white;
                                    padding: 3px 12px;
                                    border-radius: 10px;
                                    font-weight: bold;
                                    font-size: 14px;
                                ">0</span>
                            </div>
                            <div id="opfor-players" style="padding: 10px;"></div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="
                    padding: 10px;
                    text-align: center;
                    color: rgba(255,255,255,0.4);
                    font-size: 11px;
                    border-top: 1px solid rgba(255,255,255,0.05);
                ">Press TAB to close</div>
            </div>
        `;

        this.taskforcePlayers = this.container.querySelector('#taskforce-players');
        this.opforPlayers = this.container.querySelector('#opfor-players');
        this.taskforceScore = this.container.querySelector('#taskforce-score');
        this.opforScore = this.container.querySelector('#opfor-score');
        this.roundInfo = this.container.querySelector('#scoreboard-round');
    }

    public update(_dt: number): void {
        // Only update logic needed if visible
        // However, we might want to update scores even if hidden? 
        // For performance, let's only DOM update if visible or just shown.
        // The HUDManager usually handles the "show/hide" logic via input.

        if (this.game.input.getAction('Scoreboard')) {
            if (!this.isVisible()) this.setVisible(true);
            this.refreshData();
        } else {
            if (this.isVisible()) this.setVisible(false);
        }
    }

    private refreshData() {
        if (!this.game.gameMode) return;

        // Get Data
        const data = this.game.gameMode.getScoreboardData();

        // Get round wins from game mode (if available)
        const gameMode = this.game.gameMode as any;
        if (gameMode.roundWins && this.taskforceScore && this.opforScore) {
            this.taskforceScore.textContent = gameMode.roundWins['TaskForce'] || '0';
            this.opforScore.textContent = gameMode.roundWins['OpFor'] || '0';
        }
        if (gameMode.roundNumber && this.roundInfo) {
            this.roundInfo.textContent = `Round ${gameMode.roundNumber} • First to ${gameMode.roundLimit || 5}`;
        }

        // Split players by team
        const taskforce = data.filter(p => p.team === 'TaskForce' || p.team === 'Player' || p.team === 'Blue');
        const opfor = data.filter(p => p.team === 'OpFor' || p.team === 'Red' || (p.team !== 'TaskForce' && p.team !== 'Player' && p.team !== 'Blue' && p.team !== ''));

        if (this.taskforcePlayers) {
            this.taskforcePlayers.innerHTML = taskforce.map(p => this.createPlayerRow(p, true)).join('');
            if (taskforce.length === 0) {
                this.taskforcePlayers.innerHTML = '<div style="color: rgba(255,255,255,0.3); text-align: center; padding: 20px;">No players</div>';
            }
        }

        if (this.opforPlayers) {
            this.opforPlayers.innerHTML = opfor.map(p => this.createPlayerRow(p, false)).join('');
            if (opfor.length === 0) {
                this.opforPlayers.innerHTML = '<div style="color: rgba(255,255,255,0.3); text-align: center; padding: 20px;">No players</div>';
            }
        }
    }

    // Helper to create player row
    private createPlayerRow(entry: ScoreData, isBlue: boolean): string {
        const isAlive = entry.status === 'Alive' || entry.status === 'Active';
        const isYou = entry.name === 'You';
        const bgColor = isBlue
            ? (isAlive ? 'rgba(0,100,200,0.15)' : 'rgba(50,50,50,0.3)')
            : (isAlive ? 'rgba(200,50,0,0.15)' : 'rgba(50,50,50,0.3)');
        const borderColor = isBlue ? 'rgba(0,150,255,0.2)' : 'rgba(255,100,50,0.2)';

        return `
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 10px;
                margin-bottom: 4px;
                background: ${bgColor};
                border: 1px solid ${borderColor};
                border-radius: 4px;
                opacity: ${isAlive ? '1' : '0.5'};
            ">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: ${isAlive ? '#00ff00' : '#ff4444'};
                        box-shadow: 0 0 6px ${isAlive ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.3)'};
                    "></span>
                    <span style="
                        color: ${isYou ? '#ffdd00' : '#fff'};
                        font-weight: ${isYou ? '600' : '400'};
                        font-size: 13px;
                    ">${entry.name}${isYou ? ' ★' : ''}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="
                        color: ${isAlive ? 'rgba(0,255,100,0.8)' : 'rgba(255,100,100,0.8)'};
                        font-size: 11px;
                        text-transform: uppercase;
                    ">${isAlive ? '● ALIVE' : '✕ DEAD'}</span>
                    <span style="
                        background: rgba(255,255,255,0.1);
                        padding: 2px 8px;
                        border-radius: 8px;
                        font-size: 12px;
                        color: #fff;
                        min-width: 20px;
                        text-align: center;
                    ">${entry.score}</span>
                </div>
            </div>
        `;
    }
}
