/**
 * AIState - State definitions and configuration for the AI state machine
 * 
 * This provides structured metadata for each state including timeouts,
 * valid transitions, and behavior flags.
 */

/** State IDs - matches original AIState enum values for compatibility */
export const AIStateId = {
    Idle: 0,
    Chase: 1,
    Attack: 2,
    Patrol: 3,
    Alert: 4,
    TakeCover: 5,
    Flank: 6,
    Advance: 7,
    Follow: 8,
    Search: 9,      // New: searching last known position
    Retreat: 10,    // New: tactical retreat
} as const;
export type AIStateId = (typeof AIStateId)[keyof typeof AIStateId];

/** Get state name from ID for debugging */
export function getStateName(id: AIStateId): string {
    const names: Record<number, string> = {
        0: 'Idle',
        1: 'Chase',
        2: 'Attack',
        3: 'Patrol',
        4: 'Alert',
        5: 'TakeCover',
        6: 'Flank',
        7: 'Advance',
        8: 'Follow',
        9: 'Search',
        10: 'Retreat',
    };
    return names[id] || 'Unknown';
}

/** Configuration for each state */
export interface AIStateConfig {
    /** State identifier */
    id: AIStateId;

    /** Human-readable name */
    name: string;

    /** Maximum time in this state before auto-transitioning (0 = no limit) */
    timeout: number;

    /** Default state to go to when timeout expires */
    timeoutTarget: AIStateId;

    /** Can urgent events (damage, target spotted) interrupt this state? */
    interruptible: boolean;

    /** Priority level (higher = harder to interrupt) */
    priority: number;

    /** Valid states we can transition TO from this state */
    validTransitions: AIStateId[];
}

/** State configurations */
export const STATE_CONFIGS: Record<AIStateId, AIStateConfig> = {
    [AIStateId.Idle]: {
        id: AIStateId.Idle,
        name: 'Idle',
        timeout: 5,
        timeoutTarget: AIStateId.Patrol,
        interruptible: true,
        priority: 0,
        validTransitions: [AIStateId.Patrol, AIStateId.Chase, AIStateId.Alert, AIStateId.Follow],
    },
    [AIStateId.Patrol]: {
        id: AIStateId.Patrol,
        name: 'Patrol',
        timeout: 60,
        timeoutTarget: AIStateId.Idle,
        interruptible: true,
        priority: 1,
        validTransitions: [AIStateId.Idle, AIStateId.Chase, AIStateId.Alert, AIStateId.Follow],
    },
    [AIStateId.Follow]: {
        id: AIStateId.Follow,
        name: 'Follow',
        timeout: 0, // No timeout
        timeoutTarget: AIStateId.Idle,
        interruptible: true,
        priority: 2,
        validTransitions: [AIStateId.Idle, AIStateId.Chase, AIStateId.Alert, AIStateId.Attack],
    },
    [AIStateId.Alert]: {
        id: AIStateId.Alert,
        name: 'Alert',
        timeout: 8,
        timeoutTarget: AIStateId.Patrol,
        interruptible: true,
        priority: 3,
        validTransitions: [AIStateId.Idle, AIStateId.Patrol, AIStateId.Chase, AIStateId.Search],
    },
    [AIStateId.Search]: {
        id: AIStateId.Search,
        name: 'Search',
        timeout: 15,
        timeoutTarget: AIStateId.Patrol,
        interruptible: true,
        priority: 3,
        validTransitions: [AIStateId.Patrol, AIStateId.Chase, AIStateId.Alert, AIStateId.Idle],
    },
    [AIStateId.Chase]: {
        id: AIStateId.Chase,
        name: 'Chase',
        timeout: 30,
        timeoutTarget: AIStateId.Search,
        interruptible: false, // Committed to chase
        priority: 5,
        validTransitions: [AIStateId.Attack, AIStateId.Flank, AIStateId.TakeCover, AIStateId.Alert, AIStateId.Search, AIStateId.Idle],
    },
    [AIStateId.Attack]: {
        id: AIStateId.Attack,
        name: 'Attack',
        timeout: 15,
        timeoutTarget: AIStateId.Chase,
        interruptible: false,
        priority: 6,
        validTransitions: [AIStateId.Chase, AIStateId.TakeCover, AIStateId.Flank, AIStateId.Retreat, AIStateId.Idle],
    },
    [AIStateId.TakeCover]: {
        id: AIStateId.TakeCover,
        name: 'TakeCover',
        timeout: 20,
        timeoutTarget: AIStateId.Attack,
        interruptible: false,
        priority: 4,
        validTransitions: [AIStateId.Attack, AIStateId.Chase, AIStateId.Retreat, AIStateId.Patrol, AIStateId.Idle],
    },
    [AIStateId.Flank]: {
        id: AIStateId.Flank,
        name: 'Flank',
        timeout: 15,
        timeoutTarget: AIStateId.Attack,
        interruptible: false,
        priority: 5,
        validTransitions: [AIStateId.Attack, AIStateId.Chase, AIStateId.TakeCover, AIStateId.Idle],
    },
    [AIStateId.Advance]: {
        id: AIStateId.Advance,
        name: 'Advance',
        timeout: 20,
        timeoutTarget: AIStateId.Attack,
        interruptible: false,
        priority: 5,
        validTransitions: [AIStateId.Attack, AIStateId.TakeCover, AIStateId.Chase, AIStateId.Idle],
    },
    [AIStateId.Retreat]: {
        id: AIStateId.Retreat,
        name: 'Retreat',
        timeout: 10,
        timeoutTarget: AIStateId.TakeCover,
        interruptible: true, // Can be interrupted if threat neutralized
        priority: 7,
        validTransitions: [AIStateId.TakeCover, AIStateId.Patrol, AIStateId.Idle],
    },
};

/**
 * Check if a transition from one state to another is valid
 */
export function isValidTransition(from: AIStateId, to: AIStateId): boolean {
    const config = STATE_CONFIGS[from];
    if (!config) return false;
    return config.validTransitions.includes(to);
}

/**
 * Get the timeout for a state
 */
export function getStateTimeout(state: AIStateId): number {
    return STATE_CONFIGS[state]?.timeout ?? 0;
}

/**
 * Get the timeout target for a state
 */
export function getStateTimeoutTarget(state: AIStateId): AIStateId {
    return STATE_CONFIGS[state]?.timeoutTarget ?? AIStateId.Idle;
}

/**
 * Check if a state can be interrupted by urgent events
 */
export function isInterruptible(state: AIStateId): boolean {
    return STATE_CONFIGS[state]?.interruptible ?? true;
}

/**
 * Get state priority (higher = more important)
 */
export function getStatePriority(state: AIStateId): number {
    return STATE_CONFIGS[state]?.priority ?? 0;
}
