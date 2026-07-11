/** Stable identifiers for game modes — safe for minification and mode switching. */
export const GameModeId = {
    TDM: 'tdm',
    DEFUSAL: 'defusal',
    FFA: 'ffa',
    MOBA: 'moba',
    RL_TRAINING: 'rl-training',
} as const;

export type GameModeId = (typeof GameModeId)[keyof typeof GameModeId];

export const GAME_MODE_LABELS: Record<GameModeId, string> = {
    [GameModeId.TDM]: 'Team Deathmatch',
    [GameModeId.DEFUSAL]: 'Bomb Defusal',
    [GameModeId.FFA]: 'Free For All',
    [GameModeId.MOBA]: 'MOBA',
    [GameModeId.RL_TRAINING]: 'RL Training',
};
