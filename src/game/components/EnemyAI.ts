// EnemyAI.ts - Refactored
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { NavigationService } from '../services/NavigationService';
import { NavigationComponent } from './NavigationComponent';
import { ObstacleConeDetector } from './ObstacleConeDetector';
import { Enemy } from '../Enemy';
import { GameObject } from '../../engine/GameObject';
import { AIMovement } from '../ai/AIMovement';
import { AISenses } from '../ai/AISenses';
import { AICover } from '../ai/AICover';
import { AIBlackboard } from '../ai/AIBlackboard';
import { AIStateMachine } from '../ai/AIStateMachine';
import { AIStateId, getStateName } from '../ai/AIState';
import { AIPersonality, type AIPersonality as AIPersonalityType } from '../ai/AIPersonality';
import { AITeamCoordinator } from '../ai/AITeamCoordinator';
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
} from '../ai/states';

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
    Follow: 8,
    Search: 9,
} as const;
export type AIState = (typeof AIState)[keyof typeof AIState];

export { AIPersonality };
export type { AIPersonalityType };

export class EnemyAI {
    // Core services
    private navigationComponent: NavigationComponent;
    private coneDetector: ObstacleConeDetector;

    public game: Game;
    public owner: Enemy;
    public movement: AIMovement;
    public senses: AISenses;
    public cover: AICover;

    // FSM system
    public blackboard: AIBlackboard;
    public stateMachine: AIStateMachine;

    // Legacy state property – wraps FSM
    public get state(): AIState {
        return this.stateMachine.getState() as AIState;
    }
    public set state(value: AIState) {
        this.stateMachine.forceTransition(value as AIStateId, 'legacy-set');
    }

    public target: GameObject | null = null;
    public personality: AIPersonalityType;

    // Timers
    public scanTimer: number = 0;
    public reactionTimer: number = 0;
    public pathTimer: number = 0;

    // Config
    public reactionDelay: number = 0.5;
    public variance: number = Math.random();
    public attackRange: number = 20;
    public minAttackRange: number = 0;
    public healthThreshold: number = 40;
    public difficultyAccuracyScale: number = 1;
    public tacticalDecisionInterval: number = 0.35;

    // Legacy state fields
    public alertParams: { pos: THREE.Vector3; timer: number } | null = null;
    public coverTarget: THREE.Vector3 | null = null;
    public lastCoverCheck: number = 0;
    public patrolTarget: THREE.Vector3 | null = null;
    public patrolTimer: number = 0;

    // Entity ID for crowd tracking
    private static nextEntityId: number = 1;
    public entityId: number = 0;
    public useRecast: boolean = false;

    private registrationTimeout: any = null;
    // Performance: Throttle expensive cone detection raycasts
    private coneCheckTimer: number = 0;
    private readonly coneCheckInterval: number = 0.15; // Check every 150ms

    // Performance: Throttle jump condition raycasts
    private jumpCheckTimer: number = 0;
    private readonly jumpCheckInterval: number = 0.2; // Check every 200ms

    // RL Policy (optional - if set, overrides FSM)
    public rlPolicy: import('../rl/RLPolicy').IRLPolicy | null = null;
    public useRLPolicy: boolean = false;

    constructor(game: Game, owner: Enemy, personality: AIPersonalityType) {
        this.game = game;
        this.owner = owner;
        this.personality = personality;

        // Services
        const navService = new NavigationService(game);
        this.navigationComponent = new NavigationComponent(game, owner, navService);
        this.coneDetector = new ObstacleConeDetector(game, owner);

        // Core modules
        this.movement = new AIMovement(owner);
        this.senses = new AISenses(game, owner);
        this.cover = new AICover(game, owner);

        // FSM setup
        this.blackboard = new AIBlackboard();
        this.stateMachine = new AIStateMachine(this);
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
        this.stateMachine.initialize(AIStateId.Idle);

        // Unique entity ID for crowd tracking
        this.entityId = EnemyAI.nextEntityId++;

        // Personality adjustments
        if (personality === AIPersonality.Rusher) {
            this.attackRange = 14;
            this.reactionDelay = 0.35;
            this.senses.config(28, 0.35);
        } else if (personality === AIPersonality.Sniper) {
            this.attackRange = 38;
            this.minAttackRange = 16;
            this.reactionDelay = 0.65;
            this.healthThreshold = 25;
            this.senses.config(42, 0.55);
        } else {
            this.senses.config(34, 0.42);
            this.attackRange = 22;
            this.healthThreshold = 45;
        }

        if (game.campaignDifficulty === 'recruit') { this.reactionDelay += 0.2; this.difficultyAccuracyScale = 1.25; this.tacticalDecisionInterval = 0.55; }
        else if (game.campaignDifficulty === 'elite') { this.reactionDelay = Math.max(0.2, this.reactionDelay - 0.12); this.difficultyAccuracyScale = 0.8; this.tacticalDecisionInterval = 0.22; }

        this.game.soundManager.registerListener(this);
        this.tryRegisterWithCrowd();
    }

    // External control (for RL training mode)
    public externalControl: boolean = false;

    private tryRegisterWithCrowd(): void {
        if (this.externalControl) return;
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
            // Registered with Recast crowd
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
        AITeamCoordinator.releaseAll(this);
        this.game.soundManager.unregisterListener(this);
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
        if (this.externalControl) return;

        const body = this.owner.body;
        const mesh = this.owner.mesh;
        if (!body || !mesh) return;

        // Update blackboard timers
        this.blackboard.update(dt);

        // Navigation component handles stuck detection (skip when Recast drives movement)
        if (!this.useRecast) {
            this.navigationComponent.update(dt);
        }

        const reacting = this.reactionTimer > 0;
        if (reacting) {
            this.reactionTimer -= dt;
        }

        if (this.pathTimer > 0) this.pathTimer -= dt;

        this.updateTargeting(dt);

        if (!this.target && this.blackboard.objectiveDestination) {
            const pos = this.getOwnerPosition();
            if (pos && pos.distanceTo(this.blackboard.objectiveDestination) > 1.5) {
                this.movement.moveTo(this.blackboard.objectiveDestination);
            }
        }

        if (!reacting) {
            if (this.useRLPolicy && this.rlPolicy && this.rlPolicy.isLoaded()) {
                this.executeRLPolicy();
            } else {
                this.stateMachine.update(dt);
            }
        }

        // The bomb carrier must keep making progress toward the site even when the
        // combat FSM briefly selects chase/alert movement. It can still aim and
        // fire while moving, but it should not abandon the round objective.
        if (this.blackboard.objectiveRole === 'carrier' && this.blackboard.objectiveDestination) {
            const pos = this.getOwnerPosition();
            if (pos && pos.distanceTo(this.blackboard.objectiveDestination) > 1.5) {
                this.movement.moveTo(this.blackboard.objectiveDestination);
            }
        }

        this.movement.update();
        this.updateLookDirection(dt);

        // Tactical Behaviors
        if (this.state === AIState.Chase || this.state === AIState.Attack || this.state === AIState.Flank) {
            this.checkJumpCondition();
            this.checkGrenadeCondition(dt);
        }
    }

    /** Execute RL policy to determine action */
    private executeRLPolicy(): void {
        if (!this.rlPolicy) return;

        const obs = this.buildObservation();
        const action = this.rlPolicy.predict(obs);
        this.applyAction(action);
    }

    /** Build observation from current game state */
    private buildObservation(): import('../rl/EnvWrapper').Observation {
        const body = this.owner.body;
        const pos = body ? body.position : { x: 0, y: 0, z: 0 };
        const vel = body ? body.velocity : { x: 0, y: 0, z: 0 };

        return {
            position: [pos.x, pos.y, pos.z],
            velocity: [vel.x, vel.y, vel.z],
            health: this.owner.health,
            armor: 0,
            weaponId: 0, // No weapon ID system yet
            ammo: (this.owner.weapon as any)?.currentAmmo ?? 30,
            crouch: (this.owner as any).isCrouching ? 1 : 0,
            grenades: (this.owner as any).grenades ?? 0,
            team: this.owner.team === 'TaskForce' ? 0 : 1,
            visionGrid: this.buildVisionGrid(),
            coverDistance: 1, // Default (no cover)
            isUnderFire: this.owner.isUnderFire ? 1 : 0,
        };
    }

    private buildVisionGrid(): number[] {
        const grid = new Array(32 * 32).fill(0);
        const botPos = this.owner.body?.position;
        if (!botPos) return grid;

        const gameObjects = this.game.getGameObjects();
        for (const go of gameObjects) {
            if (go === this.owner) continue;
            if (!(go instanceof Enemy)) continue; // Only see other bots for now (or maybe Player?)

            const otherPos = go.body?.position;
            if (!otherPos) continue;

            const dx = otherPos.x - botPos.x;
            const dz = otherPos.z - botPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 50) continue;

            const gridX = Math.floor((dx + 32) / 2);
            const gridZ = Math.floor((dz + 32) / 2);

            if (gridX >= 0 && gridX < 32 && gridZ >= 0 && gridZ < 32) {
                const idx = gridZ * 32 + gridX;
                grid[idx] = go.team === this.owner.team ? 1 : 2;
            }
        }
        return grid;
    }

    /** Apply action from RL policy to the bot */
    private applyAction(action: import('../rl/EnvWrapper').Action): void {
        const speed = 5;
        const body = this.owner.body;
        const mesh = this.owner.mesh;

        // Movement
        if (body) {
            body.velocity.set(action.moveX * speed, body.velocity.y, action.moveZ * speed);
        }

        // Look direction
        if (mesh) {
            mesh.rotation.y = action.yaw;
        }

        // Fire - use pullTrigger method if target exists
        if (action.fire && this.owner.weapon && this.target) {
            const targetPos = this.target.mesh?.position;
            if (targetPos) {
                this.owner.weapon.pullTrigger(targetPos);
            }
        }

        // Crouch (if method exists)
        if (action.crouchToggle && typeof (this.owner as any).toggleCrouch === 'function') {
            (this.owner as any).toggleCrouch();
        }

        // Grenade (if method exists)
        if (action.throwGrenade && typeof (this.owner as any).throwGrenade === 'function') {
            (this.owner as any).throwGrenade();
        }
    }





    private isPassiveState(): boolean {
        const state = this.stateMachine.getState();
        return state === AIStateId.Idle
            || state === AIStateId.Patrol
            || state === AIStateId.Search
            || state === AIStateId.Alert;
    }

    private getAcquisitionDelay(): number {
        let delay = this.reactionDelay + Math.random() * 0.2;
        const dist = this.getDistanceToTarget();
        if (Number.isFinite(dist)) {
            delay += Math.min(dist / 50, 0.35);
        }
        if (this.stateMachine.getState() === AIStateId.Alert) {
            delay *= 0.5;
        }
        return delay;
    }

    private processTargetEngagement(): void {
        if (!this.target || !this.target.body) return;
        if (!this.senses.canSee(this.target)) return;

        const targetPos = new THREE.Vector3(
            this.target.body.position.x,
            this.target.body.position.y,
            this.target.body.position.z
        );
        const velocity = this.target.body.velocity
            ? new THREE.Vector3(this.target.body.velocity.x, this.target.body.velocity.y, this.target.body.velocity.z)
            : undefined;
        this.blackboard.sawTarget(targetPos, velocity);

        if (!this.isPassiveState()) return;

        if (this.blackboard.isAcquisitionReady()) {
            this.blackboard.confirmAcquisition();
            this.blackboard.commitToTarget();
            AITeamCoordinator.reportSighting(this, this.target, targetPos);
            this.stateMachine.requestTransition(AIStateId.Chase, 'target-acquired');
            return;
        }

        if (!this.blackboard.hasPendingAcquisition(this.target)) {
            this.blackboard.beginAcquisition(this.target, this.getAcquisitionDelay());
        }
    }

    private updateTargeting(dt: number) {
        this.coneCheckTimer += dt;
        const shouldCheckCone = this.coneCheckTimer >= this.coneCheckInterval;
        if (shouldCheckCone) {
            this.coneCheckTimer = 0;
            const coneHits = this.coneDetector.castCone(12, 35, 3);
            for (const result of coneHits) {
                if (result.body && (result.body as { gameObject?: GameObject }).gameObject) {
                    const go = (result.body as unknown as { gameObject: GameObject }).gameObject;
                    if (go.team !== this.owner.team && go.team !== 'Neutral' && this.senses.canSee(go)) {
                        this.target = go;
                        this.scanTimer = 0;
                        this.processTargetEngagement();
                        return;
                    }
                }
            }
        }

        if (!this.target || ((this.target as { health?: number }).health ?? 1) <= 0) {
            this.target = null;
            this.blackboard.cancelAcquisition();
            this.scanTimer += dt * 1000;
            if (this.scanTimer > 600 + this.variance * 300) {
                this.findTarget();
                this.scanTimer = 0;
                if (this.target) {
                    this.processTargetEngagement();
                }
                if (!this.target && this.owner.team === 'Player' && this.state === AIState.Idle) {
                    this.stateMachine.requestTransition(AIStateId.Patrol, 'no-target-friendly');
                }
            }
        } else {
            this.processTargetEngagement();
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
        let bestScore = -Infinity;
        let bestTarget: GameObject | null = null;
        const myPos = this.owner.body!.position;
        for (const t of targets) {
            if (!t.body) continue;
            const dist = myPos.distanceTo(t.body.position);
            if (dist >= this.senses.sightRange || !this.senses.canSee(t)) continue;

            const health = (t as { health?: number }).health ?? 100;
            const attackers = AITeamCoordinator.getAttackerCount(this, t);
            const damagedByThreat = this.blackboard.lastDamageSourcePos
                ? Math.max(0, 12 - this.blackboard.lastDamageSourcePos.distanceTo(
                    new THREE.Vector3(t.body.position.x, t.body.position.y, t.body.position.z)
                ))
                : 0;
            const score = 50 - dist + (100 - health) * 0.12 + damagedByThreat - attackers * 8;
            if (score > bestScore) {
                bestScore = score;
                bestTarget = t;
            }
        }
        if (bestTarget && (this.target === null || this.blackboard.targetCommitmentRemaining <= 0)) {
            AITeamCoordinator.assignTarget(this, bestTarget);
            this.target = bestTarget;
            this.blackboard.commitToTarget(2.5 + Math.random() * 1.5);
        }
    }

    public getDistanceToTarget(): number {
        if (!this.target || !this.target.body || !this.owner.body) return Infinity;
        return this.owner.body.position.distanceTo(this.target.body.position);
    }

    private updateLookDirection(dt: number) {
        let targetLookPos: THREE.Vector3 | null = null;
        let isAimingAtTarget = false;
        let turnRate = 3.5;

        if (this.target && this.target.body) {
            const state = this.stateMachine.getState();
            const combatStates: AIStateId[] = [
                AIStateId.Attack,
                AIStateId.Chase,
                AIStateId.TakeCover,
                AIStateId.Flank,
                AIStateId.Retreat,
            ];
            if (combatStates.includes(state)) {
                const leadTime =
                    state === AIStateId.Attack ? 0.14
                    : state === AIStateId.TakeCover ? 0.06
                    : 0.08;
                const predicted = this.blackboard.predictTargetPosition(leadTime);
                targetLookPos = predicted ?? new THREE.Vector3(
                    this.target.body.position.x,
                    this.target.body.position.y + 0.35,
                    this.target.body.position.z
                );
                isAimingAtTarget = true;
                turnRate = state === AIStateId.Attack ? 6.0 : 3.5;
            }
        } else if (this.owner.body && this.movement.isMoving()) {
            const vel = this.owner.body.velocity;
            if (vel.lengthSquared() > 0.5) {
                targetLookPos = new THREE.Vector3(
                    this.owner.body.position.x + vel.x,
                    this.owner.body.position.y,
                    this.owner.body.position.z + vel.z
                );
            }
        }

        if (targetLookPos) {
            this.movement.lookAt(targetLookPos, dt, turnRate);

            // 2. Set Pitch (Head/Aiming)
            // Only adjust pitch if we are actually aiming at a target or look pos
            if (this.owner.mesh && this.owner.head) {
                const headPos = this.owner.head.getWorldPosition(new THREE.Vector3());

                // Calculate Pitch
                const dx = targetLookPos.x - headPos.x;
                const dz = targetLookPos.z - headPos.z;
                const distH = Math.sqrt(dx * dx + dz * dz);
                const dy = targetLookPos.y - headPos.y;

                // Pitch: positive X is DOWN in Three.js standard (usually)
                // If target is above (dy > 0), we want to look UP (negative rotation)
                // atan2(dy, distH) gives angle from horizon up/down.
                const pitchAngle = Math.atan2(dy, distH);

                // Apply standard Three.js orientation correction (Looking down -Z?)
                // If model faces +Z, and rotation +X is down...
                // Let's assume standard rig: +Y Up, +Z Forward.
                // To look up (+Y), we rotate -X.
                // So target pitch = -pitchAngle.

                // However, we need to pass this to owner.setLookAngles which handles clamping/assignment
                // Retrieve current Yaw from mesh (set by movement.lookAt)
                const currentYaw = this.owner.mesh.rotation.y;

                // If just moving, keep head level (pitch 0)
                // If aiming at target, use calculated pitch
                const targetPitch = isAimingAtTarget ? -pitchAngle : 0;

                this.owner.setLookAngles(currentYaw, targetPitch);
            }
        }
    }

    private checkJumpCondition() {
        // Performance: Throttle expensive raycasts
        this.jumpCheckTimer += 0.016; // Approximate fixed dt
        if (this.jumpCheckTimer < this.jumpCheckInterval) return;
        this.jumpCheckTimer = 0;

        if (!this.owner.body) return;

        // 1. Raycast forward at foot level to detect obstacles
        const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.owner.mesh!.rotation.y);
        const start = new CANNON.Vec3(this.owner.body.position.x, this.owner.body.position.y + 0.5, this.owner.body.position.z);
        const end = new CANNON.Vec3(
            start.x + forward.x * 1.5,
            start.y,
            start.z + forward.z * 1.5
        );

        const result = new CANNON.RaycastResult();
        this.game.world.raycastClosest(start, end, {
            collisionFilterMask: 1, // Default group (walls/ground)
            skipBackfaces: true
        }, result);

        if (result.hasHit) {
            // 2. Check clear space above obstacle (can we jump over?)
            // Raycast higher (head level)
            const highStart = new CANNON.Vec3(start.x, start.y + 1.5, start.z);
            const highEnd = new CANNON.Vec3(end.x, end.y + 1.5, end.z);
            const highResult = new CANNON.RaycastResult();
            this.game.world.raycastClosest(highStart, highEnd, {}, highResult);

            if (!highResult.hasHit) {
                // Low obstacle detected, high space clear -> JUMP!
                // Rate limit jumping
                if (Math.random() < 0.1) { // Don't bunny hop constantly
                    this.owner.jump();
                }
            }
        }
    }

    private checkGrenadeCondition(_dt: number) {
        if (!this.target || !(this.owner as Enemy & { throwGrenade?: () => void }).throwGrenade) return;
        if (!this.blackboard.canThrowGrenade()) return;

        const dist = this.getDistanceToTarget();
        if (dist > 12 && dist < 28 && !this.senses.canSee(this.target)) {
            (this.owner as Enemy & { throwGrenade: () => void }).throwGrenade();
            this.blackboard.markGrenade();
        }
    }

    public onHearSound(pos: THREE.Vector3) {
        if (this.state === AIState.Chase || this.state === AIState.Attack) return;

        const myPos = this.getOwnerPosition();
        if (!myPos || myPos.distanceTo(pos) > 35) return;

        this.blackboard.heardSound(pos, 1);
        this.alertParams = { pos: pos.clone(), timer: 5000 };
        this.reactionTimer = this.reactionDelay + Math.random() * 0.15;

        if (this.isPassiveState()) {
            this.stateMachine.requestTransition(AIStateId.Alert, 'heard-sound');
        }
    }

    public onTakeDamage(fromPosition: THREE.Vector3) {
        this.blackboard.tookDamage(fromPosition);

        if (this.state === AIState.Attack || this.state === AIState.Chase) {
            this.reactionTimer = Math.min(this.reactionDelay * 0.35, 0.25);

            if (this.owner.health < this.healthThreshold && this.blackboard.canSeekCover()) {
                this.stateMachine.requestTransition(AIStateId.TakeCover, 'damaged-seek-cover');
            }
            return;
        }

        this.alertParams = { pos: fromPosition.clone(), timer: 5000 };
        this.reactionTimer = this.reactionDelay * 0.6 + Math.random() * 0.15;
        this.stateMachine.forceTransition(AIStateId.Alert, 'took-damage');
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

    // Legacy methods
    public triggerReaction(newState: AIState) {
        if (this.state === newState) return;
        this.reactionTimer = this.reactionDelay + Math.random() * 0.1;
        this.stateMachine.forceTransition(newState as AIStateId, 'trigger-reaction');
    }
    public checkTargetVisibility(): boolean {
        if (!this.target) return false;
        return this.senses.canSee(this.target);
    }
}
