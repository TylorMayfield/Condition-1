export const RoundPhase = {
    Warmup: 'warmup', Freeze: 'freeze', Live: 'live', PostPlant: 'post-plant',
    RoundEnd: 'round-end', Halftime: 'halftime', MatchEnd: 'match-end',
} as const;
export type RoundPhase = typeof RoundPhase[keyof typeof RoundPhase];

export const ObjectiveState = {
    Carried: 'carried', Dropped: 'dropped', Planting: 'planting', Planted: 'planted',
    Defusing: 'defusing', Defused: 'defused', Exploded: 'exploded',
} as const;
export type ObjectiveState = typeof ObjectiveState[keyof typeof ObjectiveState];

export type RoundReason = 'elimination' | 'timeout' | 'bomb-exploded' | 'bomb-defused' | 'draw';
export interface RoundResult { winner: 'TaskForce' | 'OpFor' | null; reason: RoundReason; }

export interface MatchRules {
    roundsToWin: number; halftimeAfter: number; freezeTime: number; roundTime: number;
    bombTime: number; plantTime: number; defuseTime: number; defuseKitTime: number;
}

export const DEFAULT_MATCH_RULES: MatchRules = {
    roundsToWin: 9, halftimeAfter: 8, freezeTime: 15, roundTime: 115,
    bombTime: 40, plantTime: 3, defuseTime: 10, defuseKitTime: 5,
};
