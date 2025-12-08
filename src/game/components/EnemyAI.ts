import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy'; // Assuming circular ref might be needed or we pass owner

import { AIMovement } from '../ai/AIMovement';
import { AISenses } from '../ai/AISenses';

export const AIState = {
    Idle: 0,
    Chase: 1,
    Attack: 2,
    Patrol: 3,
    Alert: 4 // New state for investigating sound
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

    // Stats
    private attackRange: number = 10;

    // State Memory
    private alertParams: { pos: THREE.Vector3, timer: number } | null = null;

    constructor(game: Game, owner: Enemy, personality: AIPersonality = AIPersonality.Tactical) {
        this.game = game;
        this.owner = owner;
        this.personality = personality;

        // Init Components
        this.movement = new AIMovement(owner);
        this.senses = new AISenses(game, owner);

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
                this.movement.setSpeed(3.5);
                this.attackRange = 5;
                this.senses.config(25, 0.3);
                break;
            case AIPersonality.Sniper:
                this.movement.setSpeed(1.5);
                this.attackRange = 40;
                this.senses.config(50, 0.8);
                break;
            case AIPersonality.Tactical:
                this.movement.setSpeed(2.5);
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

        // State Transitions
        switch (this.state) {
            case AIState.Idle:
                if (canSee) this.state = AIState.Chase;
                break;
            case AIState.Alert:
                if (canSee) {
                    this.state = AIState.Chase;
                    this.alertParams = null;
                } else if (this.alertParams) {
                    this.alertParams.timer -= dt * 1000;
                    if (this.alertParams.timer <= 0) {
                        this.state = AIState.Idle; // Gave up
                        this.alertParams = null;
                    }
                }
                break;
            case AIState.Chase:
                if (dist < this.attackRange && canSee) this.state = AIState.Attack;
                if (!canSee && dist > this.senses.sightRange) this.state = AIState.Alert;
                break;
            case AIState.Attack:
                if (dist > this.attackRange * 1.2 || !canSee) this.state = AIState.Chase;
                break;
        }

        // State Actions
        switch (this.state) {
            case AIState.Chase:
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
            case AIState.Idle:
                this.movement.stop();
                break;
        }

        // Sync Mesh Rotation (Look at target or player)
        if (this.state !== AIState.Idle) {
            const target = this.state === AIState.Alert && this.alertParams ? this.alertParams.pos : new THREE.Vector3(playerPos.x, body.position.y, playerPos.z);
            this.movement.lookAt(target);
        }
    }

    private attackBehavior(playerPos: CANNON.Vec3) {
        if (this.personality !== AIPersonality.Rusher) {
            this.movement.stop();
        } else {
            this.movement.moveTowards(new THREE.Vector3(playerPos.x, 0, playerPos.z));
        }
    }
}
