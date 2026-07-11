import { describe, expect, it, beforeEach } from 'vitest';
import { GameModeId } from './GameModeId';
import { isGameModeId } from './GameModeRegistry';
import {
    createGameMode,
    registerGameMode,
    resetGameModeRegistry,
    getRegisteredGameModeIds,
} from './GameModeRegistry';
import { GameMode, type ScoreData } from './GameMode';
import type { Game } from '../../engine/Game';

class StubGameMode extends GameMode {
    readonly id = GameModeId.TDM;

    init(): void {}
    update(): void {}
    getScoreboardData(): ScoreData[] {
        return [];
    }
}

describe('GameModeId', () => {
    it('recognizes valid mode ids', () => {
        expect(isGameModeId('tdm')).toBe(true);
        expect(isGameModeId('rl-training')).toBe(true);
        expect(isGameModeId('unknown')).toBe(false);
    });
});

describe('GameModeRegistry', () => {
    beforeEach(() => {
        resetGameModeRegistry();
    });

    it('creates modes from registered factories', () => {
        registerGameMode(GameModeId.FFA, (game) => new StubGameMode(game));

        const mode = createGameMode({} as Game, GameModeId.FFA);
        expect(mode.id).toBe(GameModeId.TDM);
    });

    it('supports runtime registration for extensions', () => {
        registerGameMode('custom-mode', (game) => new StubGameMode(game));

        const mode = createGameMode({} as Game, 'custom-mode');
        expect(mode).toBeInstanceOf(StubGameMode);
        expect(getRegisteredGameModeIds()).toContain('custom-mode');
    });

    it('throws for unregistered modes', () => {
        expect(() => createGameMode({} as Game, GameModeId.TDM)).toThrow(/Unknown game mode/);
    });
});

describe('GameMode capabilities', () => {
    it('defaults to pointer lock for FPS-style modes', () => {
        const mode = new StubGameMode({} as Game);
        expect(mode.usesPointerLock()).toBe(true);
        expect(mode.generatesOwnMap()).toBe(false);
    });
});
