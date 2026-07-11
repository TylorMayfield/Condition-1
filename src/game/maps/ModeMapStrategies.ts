import type { Game } from '../../engine/Game';
import type { GameMode } from '../gamemodes/GameMode';
import { GameModeId } from '../gamemodes/GameModeId';
import { MOBAMapGenerator } from './MOBAMapGenerator';

export interface ModeMapStrategy {
    /** Lower runs first. Mode-specific strategies should beat file-based loading. */
    readonly priority: number;
    matches(gameMode: GameMode, mapName: string): boolean;
    load(game: Game, mapName: string): Promise<void>;
}

export const MODE_MAP_STRATEGIES: ModeMapStrategy[] = [
    {
        priority: 0,
        matches: (gameMode) => gameMode.id === GameModeId.MOBA,
        load: async (game) => {
            console.log('Generating MOBA map');
            new MOBAMapGenerator(game).generate();
        },
    },
];

export async function loadModeMap(
    game: Game,
    gameMode: GameMode,
    mapName: string,
): Promise<boolean> {
    const strategy = [...MODE_MAP_STRATEGIES]
        .sort((a, b) => a.priority - b.priority)
        .find((s) => s.matches(gameMode, mapName));

    if (!strategy) {
        return false;
    }

    await strategy.load(game, mapName);
    return true;
}
