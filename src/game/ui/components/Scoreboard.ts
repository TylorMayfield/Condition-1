import { HUDComponent } from './HUDComponent';
import { Game } from '../../../engine/Game';
import { type ScoreData } from '../../gamemodes/GameMode';

export class Scoreboard extends HUDComponent {
    private game: Game;

    private taskforcePlayers: HTMLElement | null = null;
    private opforPlayers: HTMLElement | null = null;
    private taskforceScore: HTMLElement | null = null;
    private opforScore: HTMLElement | null = null;
    private roundInfo: HTMLElement | null = null;

    constructor(game: Game) {
        super();
        this.game = game;
        this.container.className = 'hud-scoreboard';
        this.createDOM();
        this.setVisible(false);
    }

    private createDOM() {
        this.container.innerHTML = `
            <div class="hud-scoreboard__panel">
                <div class="hud-scoreboard__header">
                    <div id="scoreboard-title" class="hud-scoreboard__title">Team Deathmatch</div>
                    <div id="scoreboard-round" class="hud-scoreboard__subtitle">Round 1</div>
                </div>
                <div class="hud-scoreboard__teams">
                    <div class="hud-scoreboard__team">
                        <div class="hud-scoreboard__team-header">
                            <span class="hud-scoreboard__team-name hud-scoreboard__team-name--blue">Taskforce</span>
                            <span id="taskforce-score" class="hud-scoreboard__score-badge hud-scoreboard__score-badge--blue">0</span>
                        </div>
                        <div id="taskforce-players"></div>
                    </div>
                    <div class="hud-scoreboard__team">
                        <div class="hud-scoreboard__team-header">
                            <span class="hud-scoreboard__team-name hud-scoreboard__team-name--red">OpFor</span>
                            <span id="opfor-score" class="hud-scoreboard__score-badge hud-scoreboard__score-badge--red">0</span>
                        </div>
                        <div id="opfor-players"></div>
                    </div>
                </div>
                <div class="hud-scoreboard__footer">Hold Tab to view</div>
            </div>
        `;

        this.taskforcePlayers = this.container.querySelector('#taskforce-players');
        this.opforPlayers = this.container.querySelector('#opfor-players');
        this.taskforceScore = this.container.querySelector('#taskforce-score');
        this.opforScore = this.container.querySelector('#opfor-score');
        this.roundInfo = this.container.querySelector('#scoreboard-round');
    }

    public update(_dt: number): void {
        if (this.game.input.getAction('Scoreboard')) {
            if (!this.isVisible()) this.setVisible(true);
            this.refreshData();
        } else {
            if (this.isVisible()) this.setVisible(false);
        }
    }

    private refreshData() {
        if (!this.game.gameMode) return;

        const data = this.game.gameMode.getScoreboardData();
        const gameMode = this.game.gameMode as {
            roundWins?: Record<string, number>;
            roundNumber?: number;
            roundLimit?: number;
        };

        if (gameMode.roundWins && this.taskforceScore && this.opforScore) {
            this.taskforceScore.textContent = String(gameMode.roundWins['TaskForce'] || '0');
            this.opforScore.textContent = String(gameMode.roundWins['OpFor'] || '0');
        }
        if (gameMode.roundNumber && this.roundInfo) {
            this.roundInfo.textContent = `Round ${gameMode.roundNumber} · First to ${gameMode.roundLimit || 5}`;
        }

        const taskforce = data.filter(p => p.team === 'TaskForce' || p.team === 'Player' || p.team === 'Blue');
        const opfor = data.filter(p => p.team === 'OpFor' || p.team === 'Red' || (p.team !== 'TaskForce' && p.team !== 'Player' && p.team !== 'Blue' && p.team !== ''));

        if (this.taskforcePlayers) {
            this.taskforcePlayers.innerHTML = taskforce.length
                ? taskforce.map(p => this.createPlayerRow(p)).join('')
                : '<div class="hud-scoreboard__empty">No players</div>';
        }

        if (this.opforPlayers) {
            this.opforPlayers.innerHTML = opfor.length
                ? opfor.map(p => this.createPlayerRow(p)).join('')
                : '<div class="hud-scoreboard__empty">No players</div>';
        }
    }

    private createPlayerRow(entry: ScoreData): string {
        const isAlive = entry.status === 'Alive' ||
            entry.status === 'Active' ||
            entry.status.startsWith('HP:') ||
            (entry.status !== 'Dead' && !entry.status.toLowerCase().includes('dead'));
        const isYou = entry.name === 'You';

        return `
            <div class="hud-player-row" style="opacity: ${isAlive ? '1' : '0.45'}">
                <span class="hud-player-row__status ${isAlive ? 'hud-player-row__status--alive' : 'hud-player-row__status--dead'}"></span>
                <span class="hud-player-row__name ${isYou ? 'hud-player-row__name--you' : ''}">${entry.name}${isYou ? ' ·' : ''}</span>
                <span class="hud-player-row__status-text">${isAlive ? 'Alive' : 'Dead'}</span>
                <span class="hud-player-row__score">${entry.score}</span>
            </div>
        `;
    }
}
