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

    // === Target acquisition (human reaction time) ===
    public pendingTarget: unknown | null = null;
    public acquisitionTimeRemaining: number = 0;

    // === Tactical action cooldowns (seconds) ===
    public flankCooldown: number = 0;
    public coverCooldown: number = 0;
    public strafeCooldown: number = 0;
    public peekCooldown: number = 0;
    public grenadeCooldown: number = 0;

    /** Cadence for expensive tactical choices. */
    public tacticalDecisionCooldown: number = 0;

    /** Prevent rapid target switching unless a threat is materially better. */
    public targetCommitmentRemaining: number = 0;

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
    public objectiveDestination: THREE.Vector3 | null = null;
    public objectiveRole: 'carrier' | 'entry' | 'support' | 'lurk' | 'anchor' | 'rotator' | 'retake' | null = null;

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

        this.flankCooldown = Math.max(0, this.flankCooldown - dt);
        this.coverCooldown = Math.max(0, this.coverCooldown - dt);
        this.strafeCooldown = Math.max(0, this.strafeCooldown - dt);
        this.peekCooldown = Math.max(0, this.peekCooldown - dt);
        this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
        this.tacticalDecisionCooldown = Math.max(0, this.tacticalDecisionCooldown - dt);
        this.targetCommitmentRemaining = Math.max(0, this.targetCommitmentRemaining - dt);

        if (this.acquisitionTimeRemaining > 0) {
            this.acquisitionTimeRemaining = Math.max(0, this.acquisitionTimeRemaining - dt);
        }

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
        this.markCover();
    }

    /** Begin confirming a spotted target before engaging. */
    public beginAcquisition(target: unknown, delaySeconds: number): void {
        if (this.pendingTarget !== target) {
            this.pendingTarget = target;
            this.acquisitionTimeRemaining = delaySeconds;
        }
    }

    public isAcquiringTarget(target: unknown): boolean {
        return this.pendingTarget === target && this.acquisitionTimeRemaining > 0;
    }

    public hasPendingAcquisition(target: unknown): boolean {
        return this.pendingTarget === target;
    }

    public isAcquisitionReady(): boolean {
        return this.pendingTarget !== null && this.acquisitionTimeRemaining <= 0;
    }

    public confirmAcquisition(): void {
        this.pendingTarget = null;
        this.acquisitionTimeRemaining = 0;
    }

    public cancelAcquisition(): void {
        this.pendingTarget = null;
        this.acquisitionTimeRemaining = 0;
    }

    public canFlank(): boolean {
        return this.flankCooldown <= 0;
    }

    public markFlank(): void {
        this.flankCooldown = 12 + Math.random() * 10;
    }

    public canSeekCover(): boolean {
        return this.coverCooldown <= 0 && this.timeSinceLastCoverAttempt > 3;
    }

    public markCover(): void {
        this.coverCooldown = 8 + Math.random() * 6;
    }

    public canStrafe(): boolean {
        return this.strafeCooldown <= 0;
    }

    public markStrafe(): void {
        this.strafeCooldown = 1.2 + Math.random() * 1.5;
    }

    public canPeekFire(): boolean {
        return this.peekCooldown <= 0;
    }

    public markPeekFire(): void {
        this.peekCooldown = 1.5 + Math.random() * 2;
    }

    public canThrowGrenade(): boolean {
        return this.grenadeCooldown <= 0;
    }

    public markGrenade(): void {
        this.grenadeCooldown = 18 + Math.random() * 12;
    }

    public canMakeTacticalDecision(): boolean {
        return this.tacticalDecisionCooldown <= 0;
    }

    public markTacticalDecision(intervalSeconds: number = 0.35): void {
        this.tacticalDecisionCooldown = intervalSeconds;
    }

    public commitToTarget(seconds: number = 3): void {
        this.targetCommitmentRemaining = seconds;
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
        this.objectiveDestination = null;
        this.objectiveRole = null;
        this.pendingTarget = null;
        this.acquisitionTimeRemaining = 0;
        this.flankCooldown = 0;
        this.coverCooldown = 0;
        this.strafeCooldown = 0;
        this.peekCooldown = 0;
        this.grenadeCooldown = 0;
        this.tacticalDecisionCooldown = 0;
        this.targetCommitmentRemaining = 0;
    }
}
