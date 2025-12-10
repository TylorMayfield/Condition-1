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

    private tryRegisterWithCrowd(): void {
        if (!this.game.recastNav) return;
        
        const pos = this.getOwnerPosition();
        if (!pos) {
            // Retry after a short delay (body might not be ready yet)
            setTimeout(() => this.tryRegisterWithCrowd(), 100);
            return;
        }

        const agent = this.game.recastNav.addAgent(this.entityId, pos, 0.5);
        if (agent) {
            this.useRecast = true;
            console.log(`[EnemyAI] Entity ${this.entityId} registered with Recast crowd`);
        }
    }

    public dispose() {
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

    public update(dt: number) {
        const body = this.owner.body;
        const mesh = this.owner.mesh;
        if (!body || !mesh) return;

        // Recovery Mode (Stuck handling)
        if (this.recoveryTimer > 0) {
            this.recoveryTimer -= dt;
            this.movement.updatePathFollowing(); // Keep moving (randomly/jump)
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

        // Stagger updates to share load
        // E.g. Update target every 10 frames vs scanTimer
        // Update movement every frame
        // Update state machine every frame
        
        // We can use a static global counter to offset AIs?
        // Or just use random offset.
        
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

        this.updateLookDirection(dt);
    }
    
    // AI Strategy
    private blacklistedNodes: Set<number> = new Set();
    private blacklistTimer: number = 0;

    private checkStuck(dt: number) {
        if (!this.owner.body) return;
        
        // Manage Blacklist Timer
        if (this.blacklistedNodes.size > 0) {
            this.blacklistTimer -= dt;
            if (this.blacklistTimer <= 0) {
                this.blacklistedNodes.clear();
            }
        }

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
        console.warn(`[EnemyAI] ${this.owner.name} is Stuck! Entering recovery.`);
        this.recoveryTimer = 1.5; // 1.5s recovery (longer to let physics settle)
        this.movement.stop(); // Clear path following target

        // Strategy: Blacklist the node we were trying to reach (likely blocked)
        if (this.game.navigationSystem) {
             const myPos = this.getOwnerPosition();
             if (myPos) {
                 const stuckNode = this.game.navigationSystem.getClosestNode(myPos);
                 if (stuckNode) {
                     this.blacklistedNodes.add(stuckNode.id);
                     this.blacklistTimer = 10.0; // Avoid for 10s (longer)
                     console.log(`[EnemyAI] Blacklisted Node ${stuckNode.id} for 10s`);
                 }
             }
        }

        if (!this.owner.body) return;

        // 1. Strong Random Velocity Push (physically shoves the bot)
        const angle = Math.random() * Math.PI * 2;
        const pushForce = 8; // Strong push
        this.owner.body.velocity.x = Math.cos(angle) * pushForce;
        this.owner.body.velocity.z = Math.sin(angle) * pushForce;

        // 2. Jump
        if (this.movement.isGrounded()) {
             this.owner.body.velocity.y = 5;
        }
        
        // 3. Small position nudge (teleport) to break physics deadlock
        const nudge = 0.5;
        this.owner.body.position.x += (Math.random() - 0.5) * nudge;
        this.owner.body.position.z += (Math.random() - 0.5) * nudge;
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
                // Try up to 5 times to find a valid point
                for (let i = 0; i < 5; i++) {
                    const range = 40;
                    const x = (Math.random() - 0.5) * range;
                    const z = (Math.random() - 0.5) * range;
                    // Raycast down to check if point is on ground
                    const testPos = new THREE.Vector3(x, 5, z);
                    let foundGround = false;
                    
                    this.game.world.raycastAll(new CANNON.Vec3(testPos.x, testPos.y, testPos.z), new CANNON.Vec3(testPos.x, -5, testPos.z), {}, (r) => {
                         if (r.hasHit && r.hitNormalWorld.y > 0.5) {
                             foundGround = true;
                         }
                    });

                    if (foundGround) {
                         this.patrolTarget = new THREE.Vector3(x, 1, z); 
                         break;
                    }
                }
                
                // If failed, just wait
                if (!this.patrolTarget) this.patrolTimer = 1;
            }
            return; // Wait a bit
        }

        // Move to point
        this.movement.setRunning(false); // Walk
        
        // Use pathfinding
        if (!this.movement.hasPath()) {
             // Calculate path
             const myPos = this.getOwnerPosition();
             if (myPos && this.game.navigationSystem) {
                 const path = this.game.navigationSystem.findPath(myPos, this.patrolTarget, new Set(), this.variance);
                 if (path.length > 0) {
                     this.movement.setPath(path);
                 } else {
                     // Fallback if no path found (direct)
                     this.movement.moveTowards(this.patrolTarget);
                 }
             }
        }
        
        this.movement.updatePathFollowing();
        
        // Check if arrived
        const pos = this.getOwnerPosition();
        if (pos && pos.distanceTo(this.patrolTarget) < 2.0) {
            this.patrolTarget = null;
            this.patrolTimer = 2; // Wait 2s before next point
            this.state = AIState.Idle; // Briefly idle to look around? Or just stay in Patrol
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
            this.movement.moveTowards(new THREE.Vector3(player.body.position.x, player.body.position.y, player.body.position.z));
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

        this.state = AIState.Patrol;
    }

    private updateAlert(dt: number) {
        if (this.checkTargetVisibility()) {
             this.triggerReaction(AIState.Chase);
             this.alertParams = null;
             return;
        }

        if (this.alertParams) {
             this.movement.moveTowards(this.alertParams.pos);
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

    private updateChase(dt: number) { 
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
        const myPos = this.getOwnerPosition();
        this.movement.setRunning(dist > this.attackRange * 2);

        // Use Recast Crowd if available (handles pathfinding + bot separation)
        if (this.useRecast && this.game.recastNav) {
            // Set target for crowd agent - Recast handles pathfinding and collision
            this.game.recastNav.setAgentTarget(this.entityId, targetVec);
            
            // Get velocity from crowd agent and apply to physics body
            const velocity = this.game.recastNav.getAgentVelocity(this.entityId);
            if (velocity && this.owner.body) {
                // Apply crowd-computed velocity (scale for physics)
                const speed = (dist > this.attackRange * 2) ? 5.0 : 3.0;
                const scale = speed / Math.max(0.1, velocity.length());
                this.owner.body.velocity.x = velocity.x * scale;
                this.owner.body.velocity.z = velocity.z * scale;
                
                // Look in movement direction
                if (velocity.lengthSq() > 0.1) {
                    this.movement.lookAt(new THREE.Vector3(
                        myPos!.x + velocity.x,
                        myPos!.y,
                        myPos!.z + velocity.z
                    ));
                }
            }
        } else {
            // Fallback: Custom pathfinding
            const useDirect = dist < 5.0 && canSee; 

            if (!useDirect && this.game.navigationSystem && myPos) {
                 // Only recalculate path intermittently
                 if (!this.movement.hasPath()) {
                     // Check debounce
                     if (this.pathTimer <= 0) {
                         this.pathTimer = 1.0; // Wait 1s before retrying path
                         // Use per-agent variance for path differentiation + Blacklists
                         const path = this.game.navigationSystem.findPath(myPos, targetVec, this.blacklistedNodes, this.variance);
                         if (path.length > 0) {
                             this.movement.setPath(path);
                         } else {
                             // Fallback direct
                             if (Math.random() < 0.01) console.warn(`[EnemyAI] No path found to target! Moving direct. Dist: ${dist.toFixed(1)}`);
                             this.movement.moveTowards(targetVec); 
                         }
                     }
                 }
                 this.movement.updatePathFollowing();
            } else {
                 // Close range & Visible, direct movement is better/more responsive
                 this.movement.setPath([]); // Clear path
                 this.movement.moveTowards(targetVec);
            }
        }

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
             const ownerPos = this.getOwnerPosition();
             const distToCover = ownerPos ? ownerPos.distanceTo(this.coverTarget) : Infinity;

             if (distToCover > 0.5) {
                this.movement.setRunning(true);
                this.movement.moveTowards(this.coverTarget);
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

    private updateFlank(dt: number) {
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
              this.movement.moveTowards(this.coverTarget);
              
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
    
    private updateLookDirection(dt: number) {
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

    // --- Helpers ---

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
                this.movement.moveTowards(new THREE.Vector3(targetPos.x, 0, targetPos.z));
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
