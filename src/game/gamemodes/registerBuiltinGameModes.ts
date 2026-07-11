import type { Game } from '../../engine/Game';
import { GameModeId } from './GameModeId';
import {
    registerGameMode,
    createGameMode,
    type RLTrainingOptions,
} from './GameModeRegistry';

let registered = false;
let registrationPromise: Promise<void> | null = null;

/** Lazy-load gamemode modules for code splitting. Safe to call multiple times. */
export function registerBuiltinGameModes(): Promise<void> {
    if (registered) return Promise.resolve();
    if (registrationPromise) return registrationPromise;

    registrationPromise = (async () => {
        const [
            { TeamDeathmatchGameMode },
            { FreeForAllGameMode },
            { MOBAGameMode },
            { RLTrainingGameMode },
        ] = await Promise.all([
            import('./TeamDeathmatchGameMode'),
            import('./FreeForAllGameMode'),
            import('./MOBAGameMode'),
            import('./RLTrainingGameMode'),
        ]);

        registerGameMode(GameModeId.TDM, (game) => new TeamDeathmatchGameMode(game));
        registerGameMode(GameModeId.DEFUSAL, (game) => new TeamDeathmatchGameMode(game, true));
        registerGameMode(GameModeId.FFA, (game) => new FreeForAllGameMode(game));
        registerGameMode(GameModeId.MOBA, (game) => new MOBAGameMode(game));
        registerGameMode(GameModeId.RL_TRAINING, (game) => new RLTrainingGameMode(game));

        registered = true;
    })();

    return registrationPromise;
}

export { createGameMode };

export async function createRLTrainingMode(game: Game, options: RLTrainingOptions) {
    const { RLTrainingGameMode } = await import('./RLTrainingGameMode');
    return new RLTrainingGameMode(game, options);
}

/** Reset registration state — for tests only. */
export function resetBuiltinGameModes(): void {
    registered = false;
    registrationPromise = null;
}
