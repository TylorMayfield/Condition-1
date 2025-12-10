import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy';
import { GameObject } from '../../engine/GameObject';
import { AIMovement } from '../ai/AIMovement';
import { AISenses } from '../ai/AISenses';
import { AICover } from '../ai/AICover';

export const AIState = {
    Idle: 0,
    Chase: 1,
    Attack: 2,
    Patrol: 3,
    Alert: 4, // New state for investigating sound
    TakeCover: 5, // Move to cover position
    Flank: 6, // Try to flank the player
    Advance: 7, // Advance while using cover
    Follow: 8 // Follow team leader (for friendly AI)
} as const;
export type AIState = (typeof AIState)[keyof typeof AIState];

export const AIPersonality = {
    Rusher: 0,
    Sniper: 1,
    Tactical: 2
} as const;
export type AIPersonality = (typeof AIPersonality)[keyof typeof AIPersonality];

export class EnemyAI {
    public game: Game;
    public owner: Enemy;
    public movement: AIMovement;
    public senses: AISenses;
    public cover: AICover;

    public state: AIState = AIState.Idle;
    public target: GameObject | null = null;
    public personality: AIPersonality;

    // Timers
    public scanTimer: number = 0;
    public reactionTimer: number = 0;
    public pathTimer: number = 0; // Debounce for expensive path requests

    // Config
    public reactionDelay: number = 0.5; // Seconds
    public variance: number = Math.random();
    public attackRange: number = 20;
    public healthThreshold: number = 40;

    // State specific
    public alertParams: { pos: THREE.Vector3, timer: number } | null = null;
    public coverTarget: THREE.Vector3 | null = null;
    public lastCoverCheck: number = 0;

    constructor(game: Game, owner: Enemy, personality: AIPersonality) {
        this.game = game;
        this.owner = owner;
        this.personality = personality;
        this.movement = new AIMovement(owner);
        this.senses = new AISenses(game, owner);
        this.cover = new AICover(game, owner);

        // Unique entity ID for crowd tracking
        this.entityId = EnemyAI.nextEntityId++;

        // Adjust stats based on personality
        if (personality === AIPersonality.Rusher) {
            this.attackRange = 10;
            this.reactionDelay = 0.2;
        } else if (personality === AIPersonality.Sniper) {
            this.attackRange = 40;
            this.reactionDelay = 0.8;
            this.healthThreshold = 20;
        }

        // Try to register with Recast crowd (if available)
        this.tryRegisterWithCrowd();
    }

    // Static counter for unique entity IDs
    private static nextEntityId: number = 1;
    public entityId: number = 0;
    public useRecast: boolean = false;

    private registrationTimeout: any = null;

    private tryRegisterWithCrowd(): void {
        // Check if recastNav exists AND has a navmesh generated
        if (!this.game.recastNav || !this.game.recastNav.getCrowd()) {
            // Recast not ready yet, retry in 500ms
            this.registrationTimeout = setTimeout(() => this.tryRegisterWithCrowd(), 500);
            return;
        }

        const pos = this.getOwnerPosition();
        if (!pos) {
            // Retry after a short delay (body might not be ready yet)
            this.registrationTimeout = setTimeout(() => this.tryRegisterWithCrowd(), 100);
            return;
        }

        const agent = this.game.recastNav.addAgent(this.entityId, pos, 0.4);
        if (agent) {
            this.useRecast = true;
            console.log(`[EnemyAI] Entity ${this.entityId} registered with Recast crowd`);
        } else {
            console.warn(`[EnemyAI] Failed to register entity ${this.entityId} (Navmesh too far?). Retrying...`);
            this.registrationTimeout = setTimeout(() => this.tryRegisterWithCrowd(), 1000);
        }
    }

    public dispose() {
        if (this.registrationTimeout) {
            clearTimeout(this.registrationTimeout);
            this.registrationTimeout = null;
        }

        // Cleanup crowd agent
        if (this.game.recastNav) {
            this.game.recastNav.removeAgent(this.entityId);
        }
    }

    public getState(): AIState {
        return this.state;
    }

    public getOwnerPosition(): THREE.Vector3 | undefined {
        if (this.owner.body) {
            return new THREE.Vector3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z);
        }
        return undefined;
    }

    // Stuck Detection
    private stuckTimer: number = 0;
    private lastStuckPos: THREE.Vector3 = new THREE.Vector3();
    private isStuck: boolean = false;
    private recoveryTimer: number = 0; // Time in recovery mode
    private stuckCount: number = 0; // Tracks consecutive stuck attempts

    public update(dt: number) {
        const body = this.owner.body;
        const mesh = this.owner.mesh;
        if (!body || !mesh) return;

        // Recovery Mode (Stuck handling)
        if (this.recoveryTimer > 0) {
            this.recoveryTimer -= dt;
            return; // Skip normal AI logic
        }

        // Stuck Check (if trying to move)
        if (this.movement.isMoving()) {
            this.checkStuck(dt);
        } else {
            this.stuckTimer = 0;
        }

        // Decrement Reaction Timer
        if (this.reactionTimer > 0) {
            this.reactionTimer -= dt;
            return; // Hesitating/Reacting
        }

        if (this.pathTimer > 0) this.pathTimer -= dt;

        // Target Acquisition (Periodic)
        this.updateTargeting(dt);

        // State Machine
        switch (this.state) {
            case AIState.Idle:
                this.updateIdle(dt);
                break;
            case AIState.Patrol:
                this.updatePatrol(dt);
                break;
            case AIState.Follow:
                this.updateFollow(dt);
                break;
            case AIState.Alert:
                this.updateAlert(dt);
                break;
            case AIState.Chase:
                this.updateChase(dt);
                break;
            case AIState.Attack:
                this.updateAttack(dt);
                break;
            case AIState.TakeCover:
                this.updateTakeCover(dt);
                break;
            case AIState.Flank:
                this.updateFlank(dt);
                break;
            case AIState.Advance:
                this.updateAdvance(dt);
                break;
        }

        // CRITICAL: Update movement component to apply Recast velocities to physics
        this.movement.update();

        this.updateLookDirection(dt);
    }

    private checkStuck(dt: number) {
        if (!this.owner.body) return;

        const currentPos = new THREE.Vector3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z);

        // Initialize if first check
        if (this.stuckTimer === 0) {
            this.lastStuckPos.copy(currentPos);
        }

        // Check if we moved enough
        const dist = currentPos.distanceTo(this.lastStuckPos);

        // Threshold: 0.1 units over 1.0 seconds
        if (dist < 0.1) {
            this.stuckTimer += dt;
        } else {
            // Moved, reset
            this.stuckTimer = 0;
            this.stuckCount = 0;
            this.lastStuckPos.copy(currentPos);
            this.isStuck = false;
        }

        if (this.stuckTimer > 1.0 && !this.isStuck) {
            // Stuck (> 1.0s)
            this.handleStuck();
            this.isStuck = true;
            this.stuckTimer = 0;
        }
    }

    private handleStuck() {
        this.stuckCount++;
        console.warn(`[EnemyAI] ${this.owner.name} is Stuck! (Attempt ${this.stuckCount}). Entering recovery.`);
        this.recoveryTimer = 2.0; // 2s recovery
        this.movement.stop();

        if (!this.owner.body) return;

        // Level 3: Teleport (Deep Stuck)
        if (this.stuckCount >= 3) {
            console.warn(`[EnemyAI] Critical Stuck. Teleporting safety nudge.`);
            // Nudge towards center of map or just random safe direction
            const nudge = new THREE.Vector3((Math.random() - 0.5) * 2, 2.0, (Math.random() - 0.5) * 2);
            this.owner.body.position.x += nudge.x;
            this.owner.body.position.y += nudge.y;
            this.owner.body.position.z += nudge.z;
            // Sync Recast agent immediately
            if (this.game.recastNav) {
                const physicsPos = new THREE.Vector3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z);
                this.game.recastNav.updateAgentPosition(this.entityId, physicsPos);
            }
            this.owner.body.velocity.set(0, 0, 0); // Reset velocity
            return;
        }

        // Level 2: Brute Force (Physics Push/Jump)
        if (this.stuckCount === 2) {
            console.warn(`[EnemyAI] Hard Stuck. Trying physics jam.`);
            const angle = Math.random() * Math.PI * 2;
            const pushForce = 15;
            this.owner.body.velocity.x = Math.cos(angle) * pushForce;
            this.owner.body.velocity.z = Math.sin(angle) * pushForce;
            if (this.movement.isGrounded()) {
                this.owner.body.velocity.y = 8;
            }
            return;
        }

        // Level 1: Smart Repath (Try to walk out)
        // Try to find a SAFE nearby point to escape to
        let bestPt: THREE.Vector3 | null = null;
        let bestScore = -Infinity;
        const currentPos = this.getOwnerPosition();

        if (currentPos && this.game.recastNav) {
            for (let i = 0; i < 5; i++) {
                // Short range random point (3-6m)
                const radius = 3 + Math.random() * 3;
                const pt = this.game.recastNav.getRandomPointAround(currentPos, radius);
                if (pt) {
                    const score = this.evaluatePatrolPoint(pt); // Score for openness
                    if (score > bestScore) {
                        bestScore = score;
                        bestPt = pt;
                    }
                }
            }
        }

        if (bestPt && bestScore > 0) {
            console.log(`[EnemyAI] Found escape point: ${bestPt.toArray()}`);
            this.movement.moveTo(bestPt);
        } else {
            console.log(`[EnemyAI] No safe escape found for repath. Escalating to Level 2.`);
            this.stuckCount = 2; // Auto-escalate next time
            // Do a small push now
            const angle = Math.random() * Math.PI * 2;
            this.owner.body.velocity.x = Math.cos(angle) * 5;
            this.owner.body.velocity.z = Math.sin(angle) * 5;
        }
    }

    // Restored Methods
    private updateTargeting(dt: number) {
        if (!this.target || (this.target as any).health <= 0) {
            this.target = null;
            this.scanTimer += dt * 1000;
            // Add variance to scan rate
            if (this.scanTimer > 500 + this.variance * 200) {
                this.findTarget();
                this.scanTimer = 0;

                // If still no target, and we are friendly, switch to Patrol (Search and Destroy) in TDM
                if (!this.target && this.owner.team === 'Player' && this.state === AIState.Idle) {
                    this.state = AIState.Patrol;
                }
            }
        }
    }

    // Patrol State
    public patrolTarget: THREE.Vector3 | null = null;
    public patrolTimer: number = 0;

    private updatePatrol(dt: number) {
        // Search for targets
        if (this.checkTargetVisibility()) {
            this.triggerReaction(AIState.Chase);
            this.patrolTarget = null;
            return;
        }

        // Pick new point if needed
        if (!this.patrolTarget) {
            this.patrolTimer -= dt;
            if (this.patrolTimer <= 0) {
                // Try to find a valid random point on NavMesh
                const currentPos = this.getOwnerPosition();
                if (currentPos && this.game.recastNav && this.game.recastNav.getCrowd()) {
                    // SMART NAVIGATION: Sample multiple points and pick the best one (Safest/Most Open)
                    let bestPt: THREE.Vector3 | null = null;
                    let bestScore = -Infinity;

                    // Sample 3 candidates
                    for (let i = 0; i < 3; i++) {
                        const radius = 20 + Math.random() * 30; // 20m - 50m
                        const pt = this.game.recastNav.getRandomPointAround(currentPos, radius);
                        if (pt) {
                            const score = this.evaluatePatrolPoint(pt);
                            // console.log(`[EnemyAI] Candidate ${i}: Score ${score.toFixed(1)}`);
                            if (score > bestScore) {
                                bestScore = score;
                                bestPt = pt;
                            }
                        }
                    }

                    if (bestPt) {
                        console.log(`[EnemyAI] Selected Smart Target (Score ${bestScore.toFixed(1)}): ${bestPt.toArray()}`);
                        this.patrolTarget = bestPt;
                        this.movement.moveTo(this.patrolTarget);
                    } else {
                        console.warn("[EnemyAI] Failed to find valid smart target, retrying...");
                        this.patrolTimer = 0.5; // Retry more frequently
                    }
                } else {
                    // Recast not ready yet, retry very soon
                    this.patrolTimer = 0.1; // Check every 100ms until Recast is ready
                }
            }
            return; // Wait a bit
        }

        // Move to point
        this.movement.setRunning(false); // Walk

        // Use pathfinding
        // Removed repetitive moveTo call to prevent path resetting.
        // We rely on the initial moveTo call.

        // Check if arrived
        const pos = this.getOwnerPosition();
        if (pos && pos.distanceTo(this.patrolTarget) < 2.0) {
            this.patrolTarget = null;
            this.patrolTimer = 3; // Wait 3s before next point (look around)
            this.state = AIState.Idle;
        }
    }

    private updateFollow(_dt: number) {
        // Find Leader (Player)
        const player = this.game.player;
        if (!player || !player.body) {
            this.state = AIState.Idle;
            return;
        }

        // Check for enemies (interrupt follow)
        if (this.checkTargetVisibility()) {
            this.triggerReaction(AIState.Chase);
            return;
        }

        const ownerPos = this.getOwnerPosition();
        if (!ownerPos) return;

        const dist = ownerPos.distanceTo(player.body.position);

        // Follow Logic
        if (dist > 5) {
            // Move closer
            this.movement.setRunning(dist > 10);
            this.movement.moveTo(new THREE.Vector3(player.body.position.x, player.body.position.y, player.body.position.z));
        } else if (dist < 3) {
            // Too close, stop
            this.movement.stop();
        } else {
            // Good distance
            this.movement.stop();
        }

        // Look at player if idle
        if (dist <= 5) {
            this.movement.lookAt(new THREE.Vector3(player.body.position.x, player.body.position.y, player.body.position.z));
        }
    }

    private updateIdle(_dt: number) {
        this.movement.stop();

        // Check visibility
        if (this.checkTargetVisibility()) {
            this.triggerReaction(AIState.Chase);
            return;
        }

        // Transition to Patrol and immediately try to find a patrol point
        this.state = AIState.Patrol;
        this.patrolTarget = null;
        this.patrolTimer = 0; // Reset timer to immediately try to find a point
    }

    private updateAlert(dt: number) {
        if (this.checkTargetVisibility()) {
            this.triggerReaction(AIState.Chase);
            this.alertParams = null;
            return;
        }

        if (this.alertParams) {
            this.movement.moveTo(this.alertParams.pos);
            this.alertParams.timer -= dt * 1000;
            if (this.alertParams.timer <= 0) {
                this.state = AIState.Idle; // Relax
                this.alertParams = null;
            }
        }
    }

    // Calculate tactical position around target (Surround/Flank)
    private getTacticalTarget(targetPos: THREE.Vector3): THREE.Vector3 {
        // Use Entity ID to determine angle offset
        // ID % 4 * 90 degrees?
        const id = Math.floor(this.variance * 1000); // Use stored variance as ID seed since ID doesn't exist

        const offsetDist = 3.0; // 3m spacing from target

        // Create ring based on ID
        const angle = (id % 8) * (Math.PI / 4); // 8 positions around
        const offsetX = Math.cos(angle) * offsetDist;
        const offsetZ = Math.sin(angle) * offsetDist;

        return new THREE.Vector3(targetPos.x + offsetX, targetPos.y, targetPos.z + offsetZ);
    }

    private updateChase(_dt: number) {
        const dist = this.getDistanceToTarget();
        const canSee = this.checkTargetVisibility();
        const rawTargetPos = this.target?.body?.position; // CANNON.Vec3

        if (!rawTargetPos) {
            this.state = AIState.Idle;
            return;
        }

        // Use Tactical Target mapping to urge surrounding
        const targetVec = this.getTacticalTarget(new THREE.Vector3(rawTargetPos.x, rawTargetPos.y, rawTargetPos.z));

        // Decision logic based on Personality
        // Tactical AI might choose to Flank during a chase
        if (this.personality === AIPersonality.Tactical && dist > 15 && Math.random() < (0.01 + (this.owner.team === 'OpFor' ? 0.01 : 0))) {
            // Chance to flank if far away
            this.triggerReaction(AIState.Flank);
            return;
        }

        // Rusher advances
        if (this.personality === AIPersonality.Rusher && !canSee) {
            // If we can't see them, maybe just search/patrol near last known?
            // Or Flank (pseudo-search)
            if (Math.random() < 0.02) {
                this.triggerReaction(AIState.Flank);
                return;
            }
        }

        if (dist < this.attackRange && canSee) {
            this.triggerReaction(AIState.Attack);
            return;
        }

        // Use cover if hurt
        // Prioritize cover if Tactical or Sniper
        let coverThreshold = this.healthThreshold;
        if (this.personality === AIPersonality.Tactical) coverThreshold = 70; // Seek cover early
        if (this.personality === AIPersonality.Sniper) coverThreshold = 100; // Always like cover

        if ((this.owner.health < coverThreshold || this.personality === AIPersonality.Sniper) && canSee && !this.cover.hasCoverFrom(targetVec)) {
            // Only take cover if we aren't already covered? hasCoverFrom checks current pos.
            // But we might be chasing.
            if (this.personality !== AIPersonality.Rusher) {
                this.triggerReaction(AIState.TakeCover);
                return;
            }
        }

        // Default: Chase
        // const myPos = this.getOwnerPosition();
        this.movement.setRunning(dist > this.attackRange * 2);
        this.movement.moveTo(targetVec);

        // Lose target if out of sight for too long
        if (!canSee && dist > this.senses.sightRange) {
            this.triggerReaction(AIState.Alert);
            // Go to search?
        }
    }

    private updateAttack(_dt: number) { // Unused
        const targetPos = this.target?.body?.position;
        if (!targetPos) {
            this.state = AIState.Chase;
            return;
        }

        const dist = this.getDistanceToTarget();
        const canSee = this.checkTargetVisibility();

        // Attack behavior
        this.attackBehavior(targetPos);

        // Transitions
        if (dist > this.attackRange * 1.2 || !canSee) {
            this.triggerReaction(AIState.Chase);
        } else if (this.owner.health < this.healthThreshold * 0.7) {
            this.triggerReaction(AIState.TakeCover);
        }
        // Force look at target
        this.movement.lookAt(new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z));
    }

    private updateTakeCover(dt: number) {
        const targetPos = this.target?.body?.position;
        if (!targetPos) {
            this.state = AIState.Idle;
            return;
        }
        const targetVec3 = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);

        // 1. Find Cover if we don't have one or if current one is bad
        this.lastCoverCheck += dt * 1000;
        if (!this.coverTarget || this.lastCoverCheck > 2000) {
            const coverPoint = this.cover.findCover(targetVec3);
            if (coverPoint) {
                this.coverTarget = coverPoint.position;
                this.lastCoverCheck = 0;
            } else {
                // No cover found -> Panic or Fight
                // If really low health, keep trying to run away from target?
                // For now, switch to Attack (fight for life)
                this.triggerReaction(AIState.Attack);
                return;
            }
        }

        // 2. Move to Cover
        if (this.coverTarget) {
            // const ownerPos = this.getOwnerPosition();
            // const distToCover = ownerPos ? ownerPos.distanceTo(this.coverTarget) : Infinity;
            // Simplified: just moveTo. Recast/AIMovement handles "arrived" via stopping logic naturally
            // or we check distance here.

            const ownerPos = this.getOwnerPosition();
            const distToCover = ownerPos ? ownerPos.distanceTo(this.coverTarget) : Infinity;

            if (distToCover > 0.5) {
                this.movement.setRunning(true);
                this.movement.moveTo(this.coverTarget);
            } else {
                // 3. In Cover
                this.movement.stop();

                // Behavior in cover:
                // - Reload (if needed)
                // - Heal (if we have mechanics)
                // - Peek and Attack

                // Simple logic: Wait a bit, then check if we can attack or if we are healthy
                // If health > threshold, Attack
                if (this.owner.health > this.healthThreshold) {
                    this.triggerReaction(AIState.Attack);
                } else if (Math.random() < 0.01) {
                    // Occasional peek attack even if low health
                    this.triggerReaction(AIState.Attack);
                }
            }
        }
    }

    private updateFlank(_dt: number) {
        const targetPos = this.target?.body?.position;
        if (!targetPos) {
            this.state = AIState.Idle; // Lost target
            return;
        }

        const targetVec3 = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);

        // Move to flank position (side of the target)
        // We can use AICover to find a spot relative to target, or calculate manually
        if (!this.coverTarget || this.lastCoverCheck > 3000) { // Reuse coverTarget for flank dest
            this.lastCoverCheck = 0;
            const flankPos = this.cover.findFlankPosition(targetVec3);
            if (flankPos) {
                this.coverTarget = flankPos;
            } else {
                // Can't flank, just Attack
                this.triggerReaction(AIState.Attack);
                return;
            }
        }

        if (this.coverTarget) {
            this.movement.setRunning(true);
            this.movement.moveTo(this.coverTarget);

            const ownerPos = this.getOwnerPosition();
            if (ownerPos && ownerPos.distanceTo(this.coverTarget) < 2.0) {
                // Reached flank position, Attack!
                this.triggerReaction(AIState.Attack);
            }

            // If we see the target clearly while flanking, maybe just shoot?
            if (this.checkTargetVisibility() && Math.random() < 0.05) {
                this.attackBehavior(targetPos); // Run and gun
            }
        }
    }

    private updateAdvance(dt: number) {
        // "Bounding Overwatch" / Advancing
        // Logic: specific to aggressive tactics.
        // Move towards target, but stop at cover points along the way?

        // For now, simplify: Chase but prefer cover. 
        // If we are far, find cover closer to target.
        const dist = this.getDistanceToTarget();
        if (dist > this.attackRange) {
            // Treat like TakeCover but destination is closer to enemy
            this.updateTakeCover(dt);
        } else {
            // Close enough, Attack
            this.triggerReaction(AIState.Attack);
        }
    }

    private updateLookDirection(_dt: number) {
        // 1. If Engaging Target, MUST look at target
        if (this.target && this.target.body && (this.state === AIState.Attack || this.state === AIState.Chase)) {
            // Already handled in UpdateAttack/UpdateChase usually, but redundant safety
            if (this.checkTargetVisibility()) {
                this.movement.lookAt(new THREE.Vector3(this.target.body.position.x, this.target.body.position.y, this.target.body.position.z));
                return;
            }
        }

        // 2. If no target, Look where moving
        if (this.owner.body && this.movement.isMoving()) {
            const vel = this.owner.body.velocity;
            // Only if velocity is significant > 0.5
            if (vel.lengthSquared() > 0.5) {
                // Predict position 1s ahead
                const lookPos = new THREE.Vector3(
                    this.owner.body.position.x + vel.x,
                    this.owner.body.position.y, // Keep level head
                    this.owner.body.position.z + vel.z
                );
                this.movement.lookAt(lookPos);
            }
        }

        // 3. Otherwise maintain last heading or controlled by Patrol logic
    }

    public onHearSound(pos: THREE.Vector3) {
        if (this.state === AIState.Chase || this.state === AIState.Attack) return; // Busy fighting

        console.log(`[EnemyAI] Heard sound at ${pos.toArray()}`);
        this.triggerReaction(AIState.Alert);
        this.alertParams = {
            pos: pos.clone(),
            timer: 5000 // Investigate for 5s
        };
    }

    // --- Helpers ---

    /**
     * Evaluates a patrol point based on "Openness" (distance to walls)
     * Higher score = Better point (safer, less likely to be a corner/trap)
     */
    private evaluatePatrolPoint(pt: THREE.Vector3): number {
        // Simple Physics Check: Cast rays in 4 directions
        // If rays hit walls very close, score is low.

        let totalDist = 0;
        const directions = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1)
        ];

        let minHit = 999;

        for (const dir of directions) {
            // Raycast in physics world
            // Need CANNON ray
            const from = new CANNON.Vec3(pt.x, pt.y + 1.0, pt.z); // Chest height
            const to = new CANNON.Vec3(pt.x + dir.x * 5, pt.y + 1.0, pt.z + dir.z * 5); // 5m check
            // We need to raycast against world bodies. 
            // In pure Recast, we'd use findDistanceToWall but that returns distance to NavMesh boundary, which correlates to walls.
            // Recast query is cheaper than physics. Let's try to access NavMesh closeness if possible.
            // But physics is fine for 3 samples.

            const result = new CANNON.RaycastResult();
            this.game.world.raycastClosest(from, to, {}, result);

            if (result.hasHit) {
                const dist = result.distance;
                totalDist += dist;
                if (dist < minHit) minHit = dist;
            } else {
                totalDist += 5; // Max score
            }
        }

        // Penalty for being very close to a wall (< 1m)
        if (minHit < 1.0) {
            return minHit - 100; // Strong penalty
        }

        return totalDist;
    }

    private triggerReaction(newState: AIState) {
        if (this.state === newState) return;

        // Apply reaction delay based on stats
        this.reactionTimer = this.reactionDelay + (Math.random() * 0.1);
        this.state = newState;
    }

    private checkTargetVisibility(): boolean {
        if (!this.target) return false;
        return this.senses.canSee(this.target);
    }

    private getDistanceToTarget(): number {
        if (!this.target || !this.target.body || !this.owner.body) return Infinity;
        return this.owner.body.position.distanceTo(this.target.body.position);
    }

    private findTarget() {
        const gameObjects = this.game.getGameObjects();
        const targets: GameObject[] = [];

        // Check teams
        for (const go of gameObjects) {
            if (go === this.owner) continue;
            // Target if different team and not Neutral
            if (go.team !== this.owner.team && go.team !== 'Neutral') {
                targets.push(go);
            }
        }

        // Find closest visible
        let closestDist = Infinity;
        let bestTarget = null;
        const myParams = this.owner.body!.position;

        for (const t of targets) {
            if (!t.body) continue;
            const dist = myParams.distanceTo(t.body.position);

            // Optimization: Only raycast if within reasonable range
            if (dist < this.senses.sightRange) {
                if (this.senses.canSee(t)) {
                    if (dist < closestDist) {
                        closestDist = dist;
                        bestTarget = t;
                    }
                }
            }
        }

        this.target = bestTarget;
    }

    private attackBehavior(targetPos: CANNON.Vec3) {
        // Convert to Vector3 for weapon
        const target = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);

        // Aim and Fire
        this.owner.weapon.pullTrigger(target);

        // Movement during attack based on personality
        switch (this.personality) {
            case AIPersonality.Rusher:
                // Keep advancing while shooting
                this.movement.setRunning(true);
                this.movement.moveTo(new THREE.Vector3(targetPos.x, 0, targetPos.z));
                break;
            case AIPersonality.Sniper:
                // Stop and shoot
                this.movement.stop();
                break;
            case AIPersonality.Tactical:
                // Strafe while shooting (occasionally)
                if (Math.random() < 0.3 && this.owner.body) {
                    const dz = targetPos.z - this.owner.body.position.z;
                    const dx = targetPos.x - this.owner.body.position.x;
                    const angle = Math.atan2(dz, dx);

                    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(
                        new THREE.Vector3(0, 1, 0),
                        angle
                    );
                    this.movement.strafe(right, 0.5);
                } else {
                    this.movement.stop();
                }
                break;
        }
    }
}
