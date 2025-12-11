// src/game/components/ObstacleConeDetector.ts

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy';

/**
 * Utility class that shoots a fan (cone) of raycasts in front of an enemy.
 * It can be used to detect walls, other enemies, or any objects that
 * implement a physics body in the Cannon world.
 */
export class ObstacleConeDetector {
  private game: Game;
  private owner: Enemy;

  /**
   * @param game   Reference to the main Game instance (provides physics world).
   * @param owner  The enemy whose forward direction is used as the cone axis.
   */
  constructor(game: Game, owner: Enemy) {
    this.game = game;
    this.owner = owner;
  }

  /**
   * Cast a cone of rays in front of the enemy.
   * @param radius          Length of each ray.
   * @param coneAngleDeg    Full cone angle in degrees (e.g., 60).
   * @param rayCount        Number of rays to emit across the cone.
   * @returns Array of hit results (CANNON.RaycastResult) that have a hit.
   */
  public castCone(radius: number = 5, coneAngleDeg: number = 60, rayCount: number = 7): CANNON.RaycastResult[] {
    const results: CANNON.RaycastResult[] = [];
    if (!this.owner.body) return results;

    // Owner forward direction (ignoring Y component for horizontal cone)
    const forward = new THREE.Vector3(this.owner.body.velocity.x, 0, this.owner.body.velocity.z);
    if (forward.lengthSq() === 0) {
      // If not moving, use the object's orientation (assume facing -Z)
      forward.set(0, 0, -1);
    }
    forward.normalize();

    const halfAngle = THREE.MathUtils.degToRad(coneAngleDeg / 2);
    const step = (coneAngleDeg / (rayCount - 1)) * (Math.PI / 180);

    const origin = new CANNON.Vec3(
      this.owner.body.position.x,
      this.owner.body.position.y + 0.5,
      this.owner.body.position.z,
    );

    for (let i = 0; i < rayCount; i++) {
      const angle = -halfAngle + i * step;
      // Rotate forward vector around Y axis
      const dir = new THREE.Vector3();
      dir.copy(forward);
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      dir.normalize();

      const to = new CANNON.Vec3(
        origin.x + dir.x * radius,
        origin.y,
        origin.z + dir.z * radius,
      );

      const result = new CANNON.RaycastResult();
      this.game.world.raycastClosest(origin, to, {}, result);
      if (result.hasHit) {
        results.push(result);
      }
    }
    return results;
  }
}
