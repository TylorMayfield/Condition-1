import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy';
import { GameObject } from '../../engine/GameObject';
import { AIMovement } from '../ai/AIMovement';
import { AISenses } from '../ai/AISenses';
import { AICover } from '../ai/AICover';
import { AIBlackboard } from '../ai/AIBlackboard';
import { AIStateMachine } from '../ai/AIStateMachine';
import { AIStateId, getStateName } from '../ai/AIState';
import {
    IdleState,
    PatrolState,
    ChaseState,
    AttackState,
    AlertState,
    SearchState,
    TakeCoverState,
    FlankState,
    FollowState,
    AdvanceState,
    RetreatState,
} from '../ai/states/AIStates';

// Legacy export for backward compatibility
export const AIState = {
    Idle: 0,
    Chase: 1,
    Attack: 2,
    Patrol: 3,
    Alert: 4,
    TakeCover: 5,
    Flank: 6,
    Advance: 7,
    Follow: 8
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

    // New FSM system
    public blackboard: AIBlackboard;
    public stateMachine: AIStateMachine;

    // Legacy state property - now wraps FSM
    public get state(): AIState {
        return this.stateMachine.getState() as AIState;
    }
    public set state(value: AIState) {
        // For backward compatibility, force transition
        this.stateMachine.forceTransition(value as AIStateId, 'legacy-set');
    }

    public target: GameObject | null = null;
    public personality: AIPersonality;

    // Timers
    public scanTimer: number = 0;
    public reactionTimer: number = 0;
    public pathTimer: number = 0;

    // Config
    public reactionDelay: number = 0.5;
    public variance: number = Math.random();
    public attackRange: number = 20;
    public healthThreshold: number = 40;

    // State specific (legacy, for state handlers to access)
    public alertParams: { pos: THREE.Vector3, timer: number } | null = null;
    public coverTarget: THREE.Vector3 | null = null;
    public lastCoverCheck: number = 0;

    // Patrol (legacy, for state handlers)
    public patrolTarget: THREE.Vector3 | null = null;
    public patrolTimer: number = 0;

    // Static counter for unique entity IDs
    private static nextEntityId: number = 1;
    public entityId: number = 0;
    public useRecast: boolean = false;

    private registrationTimeout: any = null;

    // Stuck Detection (enhanced)
    private stuckTimer: number = 0;
    private lastStuckPos: THREE.Vector3 = new THREE.Vector3();
    private isStuck: boolean = false;
    private recoveryTimer: number = 0;
    private stuckCount: number = 0;

    constructor(game: Game, owner: Enemy, personality: AIPersonality) {
        this.game = game;
        this.owner = owner;
        this.personality = personality;

        // Core modules
        this.movement = new AIMovement(owner);
        this.senses = new AISenses(game, owner);
        this.cover = new AICover(game, owner);

        // New AI system
        this.blackboard = new AIBlackboard();
        this.stateMachine = new AIStateMachine(this);

        // Register all state handlers
        this.stateMachine.registerHandlers([
            new IdleState(),
            new PatrolState(),
            new ChaseState(),
            new AttackState(),
            new AlertState(),
            new SearchState(),
            new TakeCoverState(),
            new FlankState(),
            new FollowState(),
            new AdvanceState(),
            new RetreatState(),
        ]);

        // Initialize FSM
        this.stateMachine.initialize(AIStateId.Idle);

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

    private tryRegisterWithCrowd(): void {
        if (!this.game.recastNav || !this.game.recastNav.getCrowd()) {
            this.registrationTimeout = setTimeout(() => this.tryRegisterWithCrowd(), 500);
            return;
        }

        const pos = this.getOwnerPosition();
        if (!pos) {
            this.registrationTimeout = setTimeout(() => this.tryRegisterWithCrowd(), 100);
            return;
        }

        const agent = this.game.recastNav.addAgent(this.entityId, pos, 0.4);
        if (agent) {
            this.useRecast = true;
            console.log(`[EnemyAI] Entity ${this.entityId} registered with Recast crowd`);
        } else {
            console.warn(`[EnemyAI] Failed to register entity ${this.entityId}. Retrying...`);
            this.registrationTimeout = setTimeout(() => this.tryRegisterWithCrowd(), 1000);
        }
    }

    public dispose() {
        if (this.registrationTimeout) {
            clearTimeout(this.registrationTimeout);
            this.registrationTimeout = null;
        }

        if (this.game.recastNav) {
            this.game.recastNav.removeAgent(this.entityId);
        }
    }

    public getState(): AIState {
        return this.stateMachine.getState() as AIState;
    }

    public getStateName(): string {
        return getStateName(this.stateMachine.getState());
    }

    public getOwnerPosition(): THREE.Vector3 | undefined {
        if (this.owner.body) {
            return new THREE.Vector3(
                this.owner.body.position.x,
                this.owner.body.position.y,
                this.owner.body.position.z
            );
        }
        return undefined;
    }

    public update(dt: number) {
        const body = this.owner.body;
        const mesh = this.owner.mesh;
        if (!body || !mesh) return;

        // Update blackboard time-based values
        this.blackboard.update(dt);

        // Recovery Mode (Stuck handling)
        if (this.recoveryTimer > 0) {
            this.recoveryTimer -= dt;
            return;
        }

        // Proactive stuck detection
        if (this.movement.isMoving()) {
            this.checkStuck(dt);
            this.predictiveObstacleAvoidance();
        } else {
            this.stuckTimer = 0;
        }

        // Reaction timer (hesitation before state changes)
        if (this.reactionTimer > 0) {
            this.reactionTimer -= dt;
            return;
        }

        if (this.pathTimer > 0) this.pathTimer -= dt;

        // Target Acquisition
        this.updateTargeting(dt);

        // Run the state machine
        this.stateMachine.update(dt);

        // Update movement component
        this.movement.update();

        // Update look direction
        this.updateLookDirection(dt);
    }

    private predictiveObstacleAvoidance() {
        if (!this.owner.body) return;

        const vel = this.owner.body.velocity;
        if (vel.length() < 0.5) return;

        const dir = new CANNON.Vec3(vel.x, 0, vel.z);
        dir.normalize();

        const from = new CANNON.Vec3(
            this.owner.body.position.x,
            this.owner.body.position.y + 0.5,
            this.owner.body.position.z
        );
        const to = new CANNON.Vec3(
            from.x + dir.x * 1.5,
            from.y,
            from.z + dir.z * 1.5
        );

        const result = new CANNON.RaycastResult();
        this.game.world.raycastClosest(from, to, {}, result);

        if (result.hasHit && result.distance < 0.8) {
            // Obstacle very close ahead - soft recovery
            this.requestAlternatePath();
        }
    }

    private requestAlternatePath() {
        const pos = this.getOwnerPosition();
        if (!pos || !this.game.recastNav) return;

        // Find a nearby clear point
        for (let i = 0; i < 3; i++) {
            const pt = this.game.recastNav.getRandomPointAround(pos, 3 + Math.random() * 2);
            if (pt && this.evaluatePatrolPoint(pt) > 0) {
                console.log(`[EnemyAI] ${this.owner.name} avoiding obstacle, rerouting`);
                this.movement.moveTo(pt);
                return;
            }
        }
    }

    private checkStuck(dt: number) {
        if (!this.owner.body) return;

        const currentPos = new THREE.Vector3(
            this.owner.body.position.x,
            this.owner.body.position.y,
            this.owner.body.position.z
        );

        if (this.stuckTimer === 0) {
            this.lastStuckPos.copy(currentPos);
        }

        const dist = currentPos.distanceTo(this.lastStuckPos);

        if (dist < 0.1) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = 0;
            this.stuckCount = 0;
            this.lastStuckPos.copy(currentPos);
            this.isStuck = false;
        }

        // Trigger stuck recovery sooner (0.5s instead of 1s)
        if (this.stuckTimer > 0.5 && !this.isStuck) {
            this.handleStuck();
            this.isStuck = true;
            this.stuckTimer = 0;
        }
    }

    private handleStuck() {
        this.stuckCount++;
        console.warn(`[EnemyAI] ${this.owner.name} is Stuck! (Attempt ${this.stuckCount})`);
        this.recoveryTimer = 1.5;
        this.movement.stop();
        this.blackboard.moveFailed();

        if (!this.owner.body) return;

        // Level 3: Teleport to nearest valid navmesh point
        if (this.stuckCount >= 3 && this.game.recastNav) {
            const pos = this.getOwnerPosition();
            if (pos) {
                const safePoint = this.game.recastNav.getRandomPointAround(pos, 5);
                if (safePoint) {
                    console.warn(`[EnemyAI] Teleporting to safe point: ${safePoint.toArray()}`);
                    this.owner.body.position.x = safePoint.x;
                    this.owner.body.position.y = safePoint.y + 0.5;
                    this.owner.body.position.z = safePoint.z;
                    this.game.recastNav.updateAgentPosition(this.entityId, safePoint);
                    this.owner.body.velocity.set(0, 0, 0);
                    this.stuckCount = 0;
                    return;
                }
            }
        }

        // Level 2: Physics push
        if (this.stuckCount === 2) {
            const angle = Math.random() * Math.PI * 2;
            const pushForce = 12;
            this.owner.body.velocity.x = Math.cos(angle) * pushForce;
            this.owner.body.velocity.z = Math.sin(angle) * pushForce;
            if (this.movement.isGrounded()) {
                this.owner.body.velocity.y = 6;
            }
            return;
        }

        // Level 1: Find escape point
        const currentPos = this.getOwnerPosition();
        if (currentPos && this.game.recastNav) {
            let bestPt: THREE.Vector3 | null = null;
            let bestScore = -Infinity;

            for (let i = 0; i < 5; i++) {
                const radius = 3 + Math.random() * 3;
                const pt = this.game.recastNav.getRandomPointAround(currentPos, radius);
                if (pt) {
                    const score = this.evaluatePatrolPoint(pt);
                    if (score > bestScore) {
                        bestScore = score;
                        bestPt = pt;
                    }
                }
            }

            if (bestPt && bestScore > 0) {
                this.movement.moveTo(bestPt);
            } else {
                this.stuckCount = 2; // Escalate
            }
        }
    }

    private updateTargeting(dt: number) {
        if (!this.target || (this.target as any).health <= 0) {
            this.target = null;
            this.scanTimer += dt * 1000;

            if (this.scanTimer > 500 + this.variance * 200) {
                this.findTarget();
                this.scanTimer = 0;

                // Friendly AI: if no target and idle, switch to patrol
                if (!this.target && this.owner.team === 'Player' && this.state === AIState.Idle) {
                    this.stateMachine.requestTransition(AIStateId.Patrol, 'no-target-friendly');
                }
            }
        }
    }

    private findTarget() {
        const gameObjects = this.game.getGameObjects();
        const targets: GameObject[] = [];

        for (const go of gameObjects) {
            if (go === this.owner) continue;
            if (go.team !== this.owner.team && go.team !== 'Neutral') {
                targets.push(go);
            }
        }

        let closestDist = Infinity;
        let bestTarget = null;
        const myPos = this.owner.body!.position;

        for (const t of targets) {
            if (!t.body) continue;
            const dist = myPos.distanceTo(t.body.position);

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

    public getDistanceToTarget(): number {
        if (!this.target || !this.target.body || !this.owner.body) return Infinity;
        return this.owner.body.position.distanceTo(this.target.body.position);
    }

    private updateLookDirection(_dt: number) {
        if (this.target && this.target.body &&
            (this.state === AIState.Attack || this.state === AIState.Chase)) {
            if (this.senses.canSee(this.target)) {
                this.movement.lookAt(new THREE.Vector3(
                    this.target.body.position.x,
                    this.target.body.position.y,
                    this.target.body.position.z
                ));
                return;
            }
        }

        if (this.owner.body && this.movement.isMoving()) {
            const vel = this.owner.body.velocity;
            if (vel.lengthSquared() > 0.5) {
                const lookPos = new THREE.Vector3(
                    this.owner.body.position.x + vel.x,
                    this.owner.body.position.y,
                    this.owner.body.position.z + vel.z
                );
                this.movement.lookAt(lookPos);
            }
        }
    }

    public onHearSound(pos: THREE.Vector3) {
        if (this.state === AIState.Chase || this.state === AIState.Attack) return;

        console.log(`[EnemyAI] ${this.owner.name} heard sound at ${pos.toArray()}`);
        this.blackboard.heardSound(pos, 1);

        // Trigger reaction with delay
        this.reactionTimer = this.reactionDelay + Math.random() * 0.1;
    }

    public onTakeDamage(fromPosition: THREE.Vector3) {
        this.blackboard.tookDamage(fromPosition);

        // If not already in combat, react
        if (this.state !== AIState.Attack && this.state !== AIState.Chase) {
            this.alertParams = { pos: fromPosition.clone(), timer: 5000 };
            this.stateMachine.forceTransition(AIStateId.Alert, 'took-damage');
        }
    }

    public evaluatePatrolPoint(pt: THREE.Vector3): number {
        let totalDist = 0;
        const directions = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1)
        ];

        let minHit = 999;

        for (const dir of directions) {
            const from = new CANNON.Vec3(pt.x, pt.y + 1.0, pt.z);
            const to = new CANNON.Vec3(pt.x + dir.x * 5, pt.y + 1.0, pt.z + dir.z * 5);
            const result = new CANNON.RaycastResult();
            this.game.world.raycastClosest(from, to, {}, result);

            if (result.hasHit) {
                const dist = result.distance;
                totalDist += dist;
                if (dist < minHit) minHit = dist;
            } else {
                totalDist += 5;
            }
        }

        if (minHit < 1.0) {
            return minHit - 100;
        }

        return totalDist;
    }

    // Legacy method for backward compatibility
    public triggerReaction(newState: AIState) {
        if (this.state === newState) return;
        this.reactionTimer = this.reactionDelay + (Math.random() * 0.1);
        this.stateMachine.forceTransition(newState as AIStateId, 'trigger-reaction');
    }

    // Legacy method
    public checkTargetVisibility(): boolean {
        if (!this.target) return false;
        return this.senses.canSee(this.target);
    }
}
