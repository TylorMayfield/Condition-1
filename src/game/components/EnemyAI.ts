import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy'; // Assuming circular ref might be needed or we pass owner

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
    Advance: 7 // Advance while using cover
} as const;
export type AIState = (typeof AIState)[keyof typeof AIState];

export const AIPersonality = {
    Rusher: 0,   // Runs straight at player
    Sniper: 1,   // Stays back, shoots from distance
    Tactical: 2  // Strafes, stops to shoot
} as const;
export type AIPersonality = (typeof AIPersonality)[keyof typeof AIPersonality];

export class EnemyAI {
    private game: Game;
    private owner: Enemy;
    private state: AIState = AIState.Idle;
    private personality: AIPersonality;

    // Components
    private movement: AIMovement;
    private senses: AISenses;
    private cover: AICover;

    // Stats
    private attackRange: number = 10;
    private healthThreshold: number = 50; // Take cover if health below this

    // State Memory
    private alertParams: { pos: THREE.Vector3, timer: number } | null = null;
    private coverTarget: THREE.Vector3 | null = null;
    private coverTimer: number = 0;
    private lastCoverCheck: number = 0;
    private flankTarget: THREE.Vector3 | null = null;

    constructor(game: Game, owner: Enemy, personality: AIPersonality = AIPersonality.Tactical) {
        this.game = game;
        this.owner = owner;
        this.personality = personality;

        // Init Components
        this.movement = new AIMovement(owner);
        this.senses = new AISenses(game, owner);
        this.cover = new AICover(game, owner);

        this.applyStats();

        this.game.soundManager.registerListener(this);
    }

    public dispose() {
        this.game.soundManager.unregisterListener(this);
    }

    public getOwnerPosition(): THREE.Vector3 | null {
        if (!this.owner.body) return null;
        return new THREE.Vector3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z);
    }

    public onHearSound(pos: THREE.Vector3) {
        // If already chasing/attacking, ignore sound (visuals takes priority)
        if (this.state === AIState.Chase || this.state === AIState.Attack) return;

        console.log("Enemy heard sound!");
        this.state = AIState.Alert;
        this.alertParams = { pos: pos.clone(), timer: 5000 }; // Investigate for 5s
    }

    private applyStats() {
        switch (this.personality) {
            case AIPersonality.Rusher:
                this.movement.setSpeed(6); // Increased from 3.5
                this.attackRange = 5;
                this.senses.config(25, 0.3);
                break;
            case AIPersonality.Sniper:
                this.movement.setSpeed(4); // Increased from 1.5
                this.attackRange = 40;
                this.senses.config(50, 0.8);
                break;
            case AIPersonality.Tactical:
                this.movement.setSpeed(5); // Increased from 2.5
                this.attackRange = 15;
                this.senses.config(20, 0.5);
                break;
        }
    }

    public update(dt: number) {
        const body = this.owner.body;
        const mesh = this.owner.mesh;
        if (!body || !mesh) return;

        const playerPos = this.game.player.body?.position;
        if (!playerPos) return;

        const canSee = this.senses.canSeePlayer();
        const dist = body.position.distanceTo(playerPos);
        const playerVec3 = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
        const hasCover = this.cover.hasCoverFrom(playerVec3);

        // Update timers
        this.coverTimer -= dt * 1000;
        this.lastCoverCheck += dt * 1000;

        // Strategic decision making
        const shouldTakeCover = this.owner.health < this.healthThreshold && canSee && !hasCover;
        const shouldFlank = canSee && dist > this.attackRange * 0.8 && this.personality === AIPersonality.Tactical;
        const shouldAdvance = canSee && dist > this.attackRange && this.personality === AIPersonality.Rusher;

        // State Transitions
        switch (this.state) {
            case AIState.Idle:
                if (canSee) {
                    if (shouldTakeCover) {
                        this.state = AIState.TakeCover;
                    } else if (shouldFlank) {
                        this.state = AIState.Flank;
                    } else {
                        this.state = AIState.Chase;
                    }
                }
                break;
            case AIState.Alert:
                if (canSee) {
                    if (shouldTakeCover) {
                        this.state = AIState.TakeCover;
                    } else {
                        this.state = AIState.Chase;
                    }
                    this.alertParams = null;
                } else if (this.alertParams) {
                    this.alertParams.timer -= dt * 1000;
                    if (this.alertParams.timer <= 0) {
                        this.state = AIState.Idle;
                        this.alertParams = null;
                    }
                }
                break;
            case AIState.Chase:
                if (dist < this.attackRange && canSee) {
                    this.state = AIState.Attack;
                } else if (shouldTakeCover) {
                    this.state = AIState.TakeCover;
                } else if (shouldFlank && this.personality === AIPersonality.Tactical) {
                    this.state = AIState.Flank;
                } else if (!canSee && dist > this.senses.sightRange) {
                    this.state = AIState.Alert;
                }
                break;
            case AIState.Attack:
                if (shouldTakeCover && this.owner.health < this.healthThreshold * 0.7) {
                    this.state = AIState.TakeCover;
                } else if (dist > this.attackRange * 1.2 || !canSee) {
                    this.state = AIState.Chase;
                } else if (shouldFlank && this.personality === AIPersonality.Tactical && Math.random() < 0.3) {
                    this.state = AIState.Flank;
                }
                break;
            case AIState.TakeCover:
                if (this.coverTarget) {
                    const distToCover = body.position.distanceTo(new THREE.Vector3(this.coverTarget.x, body.position.y, this.coverTarget.z));
                    if (distToCover < 1.0) {
                        // Reached cover, stay there for a bit
                        this.coverTimer = 2000 + Math.random() * 3000;
                        this.coverTarget = null;
                    }
                }
                if (this.coverTimer > 0 && hasCover) {
                    // In cover, can shoot from here
                    if (canSee && dist < this.attackRange * 1.5) {
                        // Stay in cover and shoot
                    } else {
                        this.coverTimer -= dt * 1000;
                        if (this.coverTimer <= 0) {
                            this.state = AIState.Chase;
                        }
                    }
                } else if (!this.coverTarget && this.coverTimer <= 0) {
                    // Need to find new cover or advance
                    if (canSee && dist < this.attackRange) {
                        this.state = AIState.Attack;
                    } else {
                        this.state = AIState.Chase;
                    }
                }
                break;
            case AIState.Flank:
                if (this.flankTarget) {
                    const distToFlank = body.position.distanceTo(new THREE.Vector3(this.flankTarget.x, body.position.y, this.flankTarget.z));
                    if (distToFlank < 2.0) {
                        // Reached flank position
                        this.flankTarget = null;
                        this.state = AIState.Chase;
                    }
                }
                if (dist < this.attackRange && canSee) {
                    this.state = AIState.Attack;
                } else if (!canSee) {
                    this.state = AIState.Alert;
                }
                break;
            case AIState.Advance:
                if (dist < this.attackRange && canSee) {
                    this.state = AIState.Attack;
                } else if (!canSee) {
                    this.state = AIState.Chase;
                }
                break;
        }

        // State Actions
        switch (this.state) {
            case AIState.Chase:
                this.movement.setRunning(dist > this.attackRange * 2);
                this.movement.moveTowards(new THREE.Vector3(playerPos.x, 0, playerPos.z));
                break;
            case AIState.Attack:
                this.attackBehavior(playerPos);
                break;
            case AIState.Alert:
                if (this.alertParams) {
                    this.movement.moveTowards(this.alertParams.pos);
                }
                break;
            case AIState.TakeCover:
                if (!this.coverTarget || this.lastCoverCheck > 2000) {
                    // Find new cover
                    const coverPoint = this.cover.findCover(playerVec3);
                    if (coverPoint) {
                        this.coverTarget = coverPoint.position;
                        this.lastCoverCheck = 0;
                    } else {
                        // No cover found, advance or chase
                        this.state = AIState.Chase;
                    }
                }
                if (this.coverTarget) {
                    this.movement.setRunning(true);
                    this.movement.moveTowards(this.coverTarget);
                } else if (hasCover && canSee) {
                    // In cover, strafe or peek
                    this.movement.stop();
                }
                break;
            case AIState.Flank:
                if (!this.flankTarget || this.lastCoverCheck > 3000) {
                    this.flankTarget = this.cover.findFlankPosition(playerVec3);
                    this.lastCoverCheck = 0;
                }
                if (this.flankTarget) {
                    this.movement.setRunning(true);
                    this.movement.moveTowards(this.flankTarget);
                } else {
                    this.state = AIState.Chase;
                }
                break;
            case AIState.Advance:
                this.movement.setRunning(true);
                this.movement.moveTowards(new THREE.Vector3(playerPos.x, 0, playerPos.z));
                break;
            case AIState.Idle:
                this.movement.stop();
                break;
        }

        // Sync Mesh Rotation (Look at target or player)
        if (this.state !== AIState.Idle) {
            let target: THREE.Vector3;
            if (this.state === AIState.Alert && this.alertParams) {
                target = this.alertParams.pos;
            } else if (this.state === AIState.Flank && this.flankTarget) {
                target = this.flankTarget;
            } else {
                target = new THREE.Vector3(playerPos.x, body.position.y, playerPos.z);
            }
            this.movement.lookAt(target);
        }
    }

    private attackBehavior(playerPos: CANNON.Vec3) {
        // Convert to Vector3 for weapon
        const target = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);

        // Aim and Fire
        this.owner.weapon.pullTrigger(target);

        // Movement during attack based on personality
        switch (this.personality) {
            case AIPersonality.Rusher:
                // Keep advancing while shooting
                this.movement.setRunning(true);
                this.movement.moveTowards(new THREE.Vector3(playerPos.x, 0, playerPos.z));
                break;
            case AIPersonality.Sniper:
                // Stop and shoot
                this.movement.stop();
                break;
            case AIPersonality.Tactical:
                // Strafe while shooting (occasionally)
                if (Math.random() < 0.3) {
                    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(
                        new THREE.Vector3(0, 1, 0),
                        Math.atan2(playerPos.z - this.owner.body!.position.z, playerPos.x - this.owner.body!.position.x)
                    );
                    this.movement.strafe(right, 0.5);
                } else {
                    this.movement.stop();
                }
                break;
        }
    }
}
