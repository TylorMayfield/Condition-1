import type { Game } from '../../engine/Game';
import { GameMode } from './GameMode';
import { GameModeId, type GameModeId as GameModeIdType } from './GameModeId';

export interface RLTrainingOptions {
    botsPerTeam: number;
    roundDurationSeconds: number;
}

export type GameModeFactory = (game: Game) => GameMode;

const factories = new Map<string, GameModeFactory>();

export function createGameMode(game: Game, id: string): GameMode {
    const factory = factories.get(id);
    if (!factory) {
        throw new Error(`Unknown game mode: ${id}. Did you call registerBuiltinGameModes()?`);
    }
    return factory(game);
}

export function registerGameMode(id: string, factory: GameModeFactory): void {
    factories.set(id, factory);
}

export function isGameModeId(value: string): value is GameModeIdType {
    return Object.values(GameModeId).includes(value as GameModeIdType);
}

/** Clear all registrations — for tests only. */
export function resetGameModeRegistry(): void {
    factories.clear();
}

export function getRegisteredGameModeIds(): string[] {
    return [...factories.keys()];
}
