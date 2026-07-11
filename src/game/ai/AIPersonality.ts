export const AIPersonality = {
    Rusher: 0,
    Sniper: 1,
    Tactical: 2,
} as const;

export type AIPersonality = (typeof AIPersonality)[keyof typeof AIPersonality];
