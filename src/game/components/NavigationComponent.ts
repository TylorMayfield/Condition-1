// src/game/components/NavigationComponent.ts

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy';
import { AIMovement } from '../ai/AIMovement';
import type { INavigationService } from '../services/NavigationService';

/**
 * Encapsulates per‑bot navigation state and logic.
 * It delegates path‑finding to an INavigationService implementation
 * and controls the AIMovement component.
 * 
 * NOTE: This component does NOT own its own AIMovement instance.
 * It uses the shared instance from EnemyAI to avoid duplicate force calculations.
 */
export class NavigationComponent {
  private game: Game;
  private owner: Enemy;
  private movement: AIMovement | null = null; // Lazy-loaded reference to EnemyAI's movement
  private navService: INavigationService;

  // Stuck‑recovery state (mirrors logic previously in EnemyAI)
  private stuckTimer: number = 0;
  private lastStuckPos: THREE.Vector3 = new THREE.Vector3();
  private isStuck: boolean = false;
  private recoveryTimer: number = 0;
  private stuckCount: number = 0;

  // Performance: Throttle obstacle avoidance raycasts
  private avoidanceTimer: number = 0;
  private readonly avoidanceInterval: number = 0.1; // Check every 100ms

  constructor(game: Game, owner: Enemy, navService: INavigationService) {
    this.game = game;
    this.owner = owner;
    this.navService = navService;
    // Don't create AIMovement here - use the shared instance from owner.ai.movement
  }

  /** Get the shared movement instance from EnemyAI */
  private getMovementInstance(): AIMovement | null {
    if (!this.movement && this.owner.ai) {
      this.movement = this.owner.ai.movement;
    }
    return this.movement;
  }

  /** Move the bot to a target point using the navigation service. */
  public moveTo(target: THREE.Vector3): void {
    // Request a path; if a path is returned we could store it for future use.
    // For now we simply forward the point to the movement component.
    const movement = this.getMovementInstance();
    if (movement) movement.moveTo(target);
  }

  /** Stop current movement. */
  public stop(): void {
    const movement = this.getMovementInstance();
    if (movement) movement.stop();
  }

  /** Public accessor for the underlying movement component. */
  public getMovement(): AIMovement | null {
    return this.getMovementInstance();
  }

  /** Called each tick – handles stuck detection and obstacle avoidance. */
  public update(dt: number): void {
    if (this.recoveryTimer > 0) {
      this.recoveryTimer -= dt;
      return;
    }

    const movement = this.getMovementInstance();
    if (movement && movement.isMoving()) {
      this.checkStuck(dt);
      this.predictiveObstacleAvoidance(dt);
    } else {
      this.stuckTimer = 0;
    }
  }

  /** Request an alternate path when an obstacle is detected. */
  public requestAlternatePath(): void {
    const pos = this.owner.body ? new THREE.Vector3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z) : undefined;
    if (!pos) return;
    // Try a few random nearby points and pick the first viable one.
    for (let i = 0; i < 3; i++) {
      const pt = this.navService.getRandomPointAround(pos, 3 + Math.random() * 2);
      if (pt && this.evaluatePatrolPoint(pt) > 0) {
        console.log(`[NavigationComponent] ${this.owner.name} avoiding obstacle, rerouting`);
        this.moveTo(pt);
        return;
      }
    }
  }

  /** Simple heuristic used by requestAlternatePath – copied from EnemyAI. */
  private evaluatePatrolPoint(pt: THREE.Vector3): number {
    // Re‑use the same ray‑cast based evaluation as EnemyAI.
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    let totalDist = 0;
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
    if (minHit < 1.0) return minHit - 100;
    return totalDist;
  }

  /** Detect if the bot is stuck and trigger recovery. */
  private checkStuck(dt: number): void {
    if (!this.owner.body) return;
    const currentPos = new THREE.Vector3(
      this.owner.body.position.x,
      this.owner.body.position.y,
      this.owner.body.position.z,
    );
    if (this.stuckTimer === 0) this.lastStuckPos.copy(currentPos);
    const dist = currentPos.distanceTo(this.lastStuckPos);
    if (dist < 0.1) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
      this.stuckCount = 0;
      this.lastStuckPos.copy(currentPos);
      this.isStuck = false;
    }
    if (this.stuckTimer > 0.5 && !this.isStuck) {
      this.handleStuck();
      this.isStuck = true;
      this.stuckTimer = 0;
    }
  }

  /** Recovery strategies when the bot is stuck. */
  private handleStuck(): void {
    this.stuckCount++;
    console.warn(`[NavigationComponent] ${this.owner.name} is Stuck! (Attempt ${this.stuckCount})`);
    this.recoveryTimer = 1.5;
    this.stop();
    // Simple level‑1 escape point search (mirrors EnemyAI.handleStuck).
    const currentPos = this.owner.body ? new THREE.Vector3(this.owner.body.position.x, this.owner.body.position.y, this.owner.body.position.z) : undefined;
    if (!currentPos) return;
    let bestPt: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 5; i++) {
      const radius = 3 + Math.random() * 3;
      const pt = this.navService.getRandomPointAround(currentPos, radius);
      if (pt) {
        const score = this.evaluatePatrolPoint(pt);
        if (score > bestScore) {
          bestScore = score;
          bestPt = pt;
        }
      }
    }
    if (bestPt && bestScore > 0) {
      this.moveTo(bestPt);
    } else {
      this.stuckCount = 2; // Escalate to next level on next call.
    }
  }

  /** Simple forward‑looking obstacle avoidance – triggers alternate path. */
  private predictiveObstacleAvoidance(dt: number): void {
    // Performance: Throttle expensive raycast
    this.avoidanceTimer += dt;
    if (this.avoidanceTimer < this.avoidanceInterval) return;
    this.avoidanceTimer = 0;

    if (!this.owner.body) return;
    const vel = this.owner.body.velocity;
    if (vel.length() < 0.5) return;
    const dir = new CANNON.Vec3(vel.x, 0, vel.z);
    dir.normalize();
    const from = new CANNON.Vec3(
      this.owner.body.position.x,
      this.owner.body.position.y + 0.5,
      this.owner.body.position.z,
    );
    const to = new CANNON.Vec3(
      from.x + dir.x * 1.5,
      from.y,
      from.z + dir.z * 1.5,
    );
    const result = new CANNON.RaycastResult();
    this.game.world.raycastClosest(from, to, {}, result);
    if (result.hasHit && result.distance < 0.8) {
      this.requestAlternatePath();
    }
  }
}
