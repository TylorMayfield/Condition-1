import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import * as THREE from 'three';

export abstract class GameMode {
    protected game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public aiEnabled: boolean = true;

    // Movement control hook
    public canPlayerMove(): boolean {
        // By default, player can always move.
        // Derived classes can override this (e.g. countdown, cutscene)
        return true;
    }

    public abstract init(): void;
    public abstract update(dt: number): void;
    
    /** Called when the game mode is being unloaded */
    public dispose(): void { }

    // ========== Entity Lifecycle Hooks ==========
    
    /** Called when an entity dies */
    public onEntityDeath(_victim: GameObject, _killer?: GameObject): void { }
    
    /** Called when player dies (separate from onEntityDeath for convenience) */
    public onPlayerDeath(_killer?: GameObject): void { }
    
    /** Called when player extracts/completes objective */
    public onPlayerExtract(): void { }

    /** Entity management hook (so Spawners can register enemies to the mode) */
    public registerEntity(_entity: GameObject): void { }

    // ========== Spawn Management Hooks ==========
    
    /** Get a safe spawn position for an entity. Return null to use default logic. */
    public getSpawnPosition(_team: string, _applyJitter: boolean = false): THREE.Vector3 | null {
        return null;
    }
    
    /** Called when an entity is about to spawn. Return false to prevent spawn. */
    public onBeforeSpawn(_entity: GameObject, _position: THREE.Vector3): boolean {
        return true;
    }
    
    /** Called after an entity spawns */
    public onAfterSpawn(_entity: GameObject): void { }

    // ========== Round/Phase Management Hooks ==========
    
    /** Called when a new round/phase starts */
    public onRoundStart(_roundNumber: number): void { }
    
    /** Called when a round/phase ends */
    public onRoundEnd(_winner: string | null): void { }
    
    /** Called to clean up entities/state between rounds */
    public onRoundCleanup(): void { }
    
    /** Check if a win condition is met. Return winner team name or null. */
    public checkWinCondition(): string | null {
        return null;
    }

    // ========== Timer/Countdown Hooks ==========
    
    /** Called when countdown starts */
    public onCountdownStart(_duration: number): void { }
    
    /** Called each frame during countdown with remaining seconds */
    public onCountdownTick(_secondsRemaining: number): void { }
    
    /** Called when countdown ends */
    public onCountdownEnd(): void { }
    
    /** Called when round timer expires */
    public onRoundTimeout(): void { }

    // ========== Spectator Hooks ==========
    
    /** Called when entering spectator mode */
    public onEnterSpectator(): void { }
    
    /** Called when exiting spectator mode */
    public onExitSpectator(): void { }
    
    /** Get list of valid spectator targets */
    public getSpectatorTargets(): GameObject[] {
        return [];
    }

    // ========== Score/Stats Hooks ==========
    
    /** Called when score needs to be persisted (e.g., between rounds) */
    public onSaveScores(): void { }
    
    /** Called when scores need to be restored (e.g., at round start) */
    public onRestoreScores(): void { }

    // ========== Required Methods ==========
    
    public abstract getScoreboardData(): ScoreData[];
}

export interface ScoreData {
    name: string;
    team: string;
    score: number;
    status: string; // "Alive", "Dead", etc.
}
