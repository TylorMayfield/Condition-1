import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';

export abstract class GameMode {
    protected game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public abstract init(): void;
    public abstract update(dt: number): void;
    
    // Optional hooks
    public onEntityDeath(victim: GameObject, killer?: GameObject): void {}
    public onPlayerExtract(): void {}
    
    // Entity management hook (so Spawners can register enemies to the mode)
    public registerEntity(entity: GameObject): void {}

    public abstract getScoreboardData(): ScoreData[];
}

export interface ScoreData {
    name: string;
    team: string;
    score: number;
    status: string; // "Alive", "Dead", etc.
}
