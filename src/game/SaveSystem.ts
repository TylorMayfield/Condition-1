import { Game } from '../engine/Game';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface GameState {
    timestamp: number;
    mapName: string;
    player: {
        position: { x: number, y: number, z: number };
        rotation: { x: number, y: number, z: number };
        health: number;
        inventory: any; // Placeholder for inventory data
    };
    worldState: any; // Placeholder for world state (e.g. destroyed objects)
}

export class SaveSystem {
    private game: Game;
    private readonly SAVE_PREFIX = 'condition1_save_';

    constructor(game: Game) {
        this.game = game;
    }

    public saveGame(slot: number = 1): boolean {
        try {
            if (!this.game.player || !this.game.player.body) return false;

            const gameState: GameState = {
                timestamp: Date.now(),
                mapName: 'killhouse', // TODO: Get actual current map name from LevelGenerator or Game
                player: {
                    position: {
                        x: this.game.player.body.position.x,
                        y: this.game.player.body.position.y,
                        z: this.game.player.body.position.z
                    },
                    rotation: {
                        x: this.game.player.mesh.rotation.x,
                        y: this.game.player.mesh.rotation.y,
                        z: this.game.player.mesh.rotation.z
                    },
                    health: this.game.player.health,
                    inventory: {} // TODO: Serialize inventory
                },
                worldState: {}
            };

            // Get map name from level generator if possible
            // We need to access MapMenuManager or LevelGenerator state
            // For now, let's assume Game stores it or retrieve it from current context

            localStorage.setItem(`${this.SAVE_PREFIX}${slot}`, JSON.stringify(gameState));
            console.log(`Game saved to slot ${slot}`);
            return true;
        } catch (e) {
            console.error('Failed to save game', e);
            return false;
        }
    }

    public loadGame(slot: number = 1): boolean {
        try {
            const data = localStorage.getItem(`${this.SAVE_PREFIX}${slot}`);
            if (!data) return false;

            const gameState: GameState = JSON.parse(data);

            // TODO: Request Map Load
            // This is tricky because loading is async and might require map change
            // The MenuSystem should orchestrate this:
            // 1. Menu load -> calls SaveSystem.loadGame -> returns save data
            // 2. Menu triggers map load
            // 3. Once map loaded, apply save data

            // For now, we return true if data exists
            return true;
        } catch (e) {
            console.error('Failed to load game', e);
            return false;
        }
    }

    public getSaveData(slot: number = 1): GameState | null {
        try {
            const data = localStorage.getItem(`${this.SAVE_PREFIX}${slot}`);
            if (!data) return null;
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    public deleteSave(slot: number) {
        localStorage.removeItem(`${this.SAVE_PREFIX}${slot}`);
    }
}
