import { AIStateId, getStateName, isValidTransition, getStateTimeout, getStateTimeoutTarget, isInterruptible } from './AIState';
import type { EnemyAI } from '../components/EnemyAI';

/**
 * Interface for individual state handlers
 */
export interface IAIStateHandler {
    /** State this handler manages */
    readonly stateId: AIStateId;

    /** Called when entering this state */
    enter(ai: EnemyAI): void;

    /** Called every frame while in this state. Return new state to transition, or null to stay. */
    update(ai: EnemyAI, dt: number): AIStateId | null;

    /** Called when exiting this state */
    exit(ai: EnemyAI): void;
}

/**
 * Transition record for debugging
 */
interface TransitionRecord {
    from: AIStateId;
    to: AIStateId;
    time: number;
    reason: string;
}

/**
 * AIStateMachine - Centralized state management for AI
 * 
 * Provides:
 * - Explicit enter/exit lifecycle for each state
 * - Transition validation
 * - Automatic timeouts
 * - Transition history for debugging
 * - Interrupt handling
 */
export class AIStateMachine {
    private ai: EnemyAI;
    private handlers: Map<AIStateId, IAIStateHandler> = new Map();
    private currentState: AIStateId = AIStateId.Idle;
    private stateTime: number = 0;
    private transitionHistory: TransitionRecord[] = [];
    private maxHistorySize: number = 20;

    /** Pending forced transition (from interrupts) */
    private pendingTransition: { state: AIStateId; reason: string } | null = null;

    constructor(ai: EnemyAI) {
        this.ai = ai;
    }

    /**
     * Register a state handler
     */
    public registerHandler(handler: IAIStateHandler): void {
        this.handlers.set(handler.stateId, handler);
    }

    /**
     * Register multiple handlers at once
     */
    public registerHandlers(handlers: IAIStateHandler[]): void {
        handlers.forEach(h => this.registerHandler(h));
    }

    /**
     * Get current state
     */
    public getState(): AIStateId {
        return this.currentState;
    }

    /**
     * Get current state name
     */
    public getStateName(): string {
        return getStateName(this.currentState);
    }

    /**
     * Get time spent in current state
     */
    public getStateTime(): number {
        return this.stateTime;
    }

    /**
     * Request a state transition
     * @returns true if transition was successful
     */
    public requestTransition(newState: AIStateId, reason: string = 'requested'): boolean {
        if (newState === this.currentState) return false;

        // Validate transition
        if (!isValidTransition(this.currentState, newState)) {
            console.warn(`[AI-FSM] Invalid transition: ${getStateName(this.currentState)} -> ${getStateName(newState)}`);
            return false;
        }

        this.executeTransition(newState, reason);
        return true;
    }

    /**
     * Force a state transition (bypasses validation, used for interrupts)
     */
    public forceTransition(newState: AIStateId, reason: string = 'forced'): void {
        if (newState === this.currentState) return;

        // Check if current state can be interrupted
        if (!isInterruptible(this.currentState)) {
            // Queue the transition instead
            this.pendingTransition = { state: newState, reason };
            return;
        }

        this.executeTransition(newState, reason);
    }

    /**
     * Execute the actual transition
     */
    private executeTransition(newState: AIStateId, reason: string): void {
        const oldState = this.currentState;

        // Record transition
        this.transitionHistory.push({
            from: oldState,
            to: newState,
            time: Date.now(),
            reason
        });

        // Trim history
        if (this.transitionHistory.length > this.maxHistorySize) {
            this.transitionHistory.shift();
        }

        // Exit old state
        const oldHandler = this.handlers.get(oldState);
        if (oldHandler) {
            oldHandler.exit(this.ai);
        }

        // Update state
        this.currentState = newState;
        this.stateTime = 0;

        // Notify blackboard
        this.ai.blackboard.onStateChange(newState);

        // Enter new state
        const newHandler = this.handlers.get(newState);
        if (newHandler) {
            newHandler.enter(this.ai);
        }

        console.log(`[AI-FSM] ${this.ai.owner.name}: ${getStateName(oldState)} -> ${getStateName(newState)} (${reason})`);
    }

    /**
     * Main update - called every frame
     */
    public update(dt: number): void {
        this.stateTime += dt;

        // Check for pending transitions (from interrupted states)
        if (this.pendingTransition && isInterruptible(this.currentState)) {
            this.executeTransition(this.pendingTransition.state, this.pendingTransition.reason);
            this.pendingTransition = null;
            return; // Skip this frame's update
        }

        // Check for timeout
        const timeout = getStateTimeout(this.currentState);
        if (timeout > 0 && this.stateTime > timeout) {
            const timeoutTarget = getStateTimeoutTarget(this.currentState);
            console.log(`[AI-FSM] ${this.ai.owner.name}: State timeout, transitioning to ${getStateName(timeoutTarget)}`);
            this.executeTransition(timeoutTarget, 'timeout');
            return;
        }

        // Run current state's update
        const handler = this.handlers.get(this.currentState);
        if (handler) {
            const requestedState = handler.update(this.ai, dt);
            if (requestedState !== null && requestedState !== this.currentState) {
                this.requestTransition(requestedState, 'state-logic');
            }
        }
    }

    /**
     * Initialize to a starting state
     */
    public initialize(startState: AIStateId = AIStateId.Idle): void {
        this.currentState = startState;
        this.stateTime = 0;

        const handler = this.handlers.get(startState);
        if (handler) {
            handler.enter(this.ai);
        }
    }

    /**
     * Get recent transition history for debugging
     */
    public getTransitionHistory(): TransitionRecord[] {
        return [...this.transitionHistory];
    }

    /**
     * Check if we've been oscillating between states
     */
    public isOscillating(): boolean {
        if (this.transitionHistory.length < 4) return false;

        const recent = this.transitionHistory.slice(-4);
        const now = Date.now();

        // Check if all 4 transitions happened in last 5 seconds
        if (now - recent[0].time > 5000) return false;

        // Check if we're going back and forth
        const states = recent.map(r => r.to);
        return states[0] === states[2] && states[1] === states[3];
    }

    /**
     * Reset the state machine
     */
    public reset(): void {
        this.currentState = AIStateId.Idle;
        this.stateTime = 0;
        this.transitionHistory = [];
        this.pendingTransition = null;
    }
}
