import * as THREE from 'three';

/**
 * AIBlackboard - Memory/Context system for AI decision making
 * 
 * This acts as a "working memory" for the AI, storing temporary state
 * that persists across state transitions and helps make informed decisions.
 */
export class AIBlackboard {
    // === Target Memory ===
    /** Last known position of current target */
    public lastKnownTargetPos: THREE.Vector3 | null = null;

    /** Time in seconds since we last saw the target */
    public timeSinceTargetSeen: number = Infinity;

    /** Last known velocity of target (for prediction) */
    public lastTargetVelocity: THREE.Vector3 | null = null;

    // === Movement ===
    /** Current destination we're trying to reach */
    public moveDestination: THREE.Vector3 | null = null;

    /** Have we reached our current destination? */
    public atDestination: boolean = false;

    /** Time spent trying to reach current destination */
    public moveTime: number = 0;

    /** Number of failed movement attempts (for stuck escalation) */
    public moveFailures: number = 0;

    // === Threat Awareness ===
    /** Queue of heard sounds with position and timestamp */
    public heardSounds: Array<{ pos: THREE.Vector3; time: number; priority: number }> = [];

    /** Last position we took damage from */
    public lastDamageSourcePos: THREE.Vector3 | null = null;

    /** Time since we last took damage */
    public timeSinceDamaged: number = Infinity;

    // === Tactical ===
    /** Current cover position (if we have one) */
    public coverPosition: THREE.Vector3 | null = null;

    /** Is our current cover still valid? */
    public coverValid: boolean = false;

    /** Time spent in current cover */
    public timeInCover: number = 0;

    /** Patrol waypoints queue */
    public patrolQueue: THREE.Vector3[] = [];

    /** Time since we last ATTEMPTED to find cover (prevents thrashing) */
    public timeSinceLastCoverAttempt: number = Infinity;

    // === State Tracking ===
    /** How long we've been in current state */
    public stateTime: number = 0;

    /** Previous state (for return-to behavior) */
    public previousState: number = 0;

    /** Number of times we've transitioned in last few seconds (for oscillation detection) */
    public recentTransitions: number = 0;

    // === Squad Coordination ===
    /** Assigned target from squad leader */
    public assignedTarget: any | null = null;

    /** Formation offset from leader */
    public formationOffset: THREE.Vector3 | null = null;

    /**
     * Update time-based values
     */
    public update(dt: number): void {
        this.timeSinceTargetSeen += dt;
        this.timeSinceDamaged += dt;
        this.stateTime += dt;
        this.moveTime += dt;
        this.timeInCover += dt;

        // Decay recent transitions counter
        this.recentTransitions = Math.max(0, this.recentTransitions - dt * 0.5);

        this.timeSinceLastCoverAttempt += dt;

        // Clean old sounds (older than 10 seconds)
        const now = Date.now();
        this.heardSounds = this.heardSounds.filter(s => now - s.time < 10000);
    }

    /**
     * Reset when changing states
     */
    public onStateChange(newState: number): void {
        this.previousState = newState;
        this.stateTime = 0;
        this.recentTransitions++;
    }

    /**
     * Record seeing the target
     */
    public sawTarget(position: THREE.Vector3, velocity?: THREE.Vector3): void {
        this.lastKnownTargetPos = position.clone();
        this.timeSinceTargetSeen = 0;
        if (velocity) {
            this.lastTargetVelocity = velocity.clone();
        }
    }

    /**
     * Record hearing a sound
     */
    public heardSound(position: THREE.Vector3, priority: number = 1): void {
        this.heardSounds.push({
            pos: position.clone(),
            time: Date.now(),
            priority
        });
        // Keep only most recent 5 sounds
        if (this.heardSounds.length > 5) {
            this.heardSounds.shift();
        }
    }

    /**
     * Get the most important sound to investigate
     */
    public getMostImportantSound(): { pos: THREE.Vector3; time: number; priority: number } | null {
        if (this.heardSounds.length === 0) return null;

        // Sort by priority, then recency
        const sorted = [...this.heardSounds].sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.time - a.time;
        });

        return sorted[0];
    }

    /**
     * Record taking damage
     */
    public tookDamage(fromPosition: THREE.Vector3): void {
        this.lastDamageSourcePos = fromPosition.clone();
        this.timeSinceDamaged = 0;
    }

    /**
     * Set new movement destination
     */
    public setDestination(pos: THREE.Vector3): void {
        this.moveDestination = pos.clone();
        this.atDestination = false;
        this.moveTime = 0;
    }

    /**
     * Mark destination as reached
     */
    public reachedDestination(): void {
        this.atDestination = true;
        this.moveFailures = 0;
    }

    /**
     * Record a failed move attempt
     */
    public moveFailed(): void {
        this.moveFailures++;
        this.moveTime = 0;
    }

    /**
     * Set cover position
     */
    public setCover(pos: THREE.Vector3): void {
        this.coverPosition = pos.clone();
        this.coverValid = true;
        this.timeInCover = 0;
    }

    /**
     * Clear cover
     */
    public clearCover(): void {
        this.coverPosition = null;
        this.coverValid = false;
        this.timeInCover = 0;
    }

    public recordCoverAttempt(): void {
        this.timeSinceLastCoverAttempt = 0;
    }

    /**
     * Predict where target will be in X seconds
     */
    public predictTargetPosition(secondsAhead: number): THREE.Vector3 | null {
        if (!this.lastKnownTargetPos) return null;

        const predicted = this.lastKnownTargetPos.clone();

        if (this.lastTargetVelocity) {
            predicted.add(this.lastTargetVelocity.clone().multiplyScalar(secondsAhead));
        }

        return predicted;
    }

    /**
     * Check if we're oscillating between states too much
     */
    public isOscillating(): boolean {
        return this.recentTransitions > 3;
    }

    /**
     * Full reset (e.g., on spawn)
     */
    public reset(): void {
        this.lastKnownTargetPos = null;
        this.timeSinceTargetSeen = Infinity;
        this.lastTargetVelocity = null;
        this.moveDestination = null;
        this.atDestination = false;
        this.moveTime = 0;
        this.moveFailures = 0;
        this.heardSounds = [];
        this.lastDamageSourcePos = null;
        this.timeSinceDamaged = Infinity;
        this.coverPosition = null;
        this.coverValid = false;
        this.timeInCover = 0;
        this.patrolQueue = [];
        this.stateTime = 0;
        this.previousState = 0;
        this.recentTransitions = 0;
        this.assignedTarget = null;
        this.formationOffset = null;
    }
}
