// src/game/services/NavigationService.ts

import * as THREE from 'three';
import { Game } from '../../engine/Game';

/**
 * Interface defining navigation operations required by AI components.
 */
export interface INavigationService {
  /** Request a path from start to end. Returns an array of waypoints or an empty array if no path. */
  requestPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[];
  /** Get a random reachable point around a position within a radius. */
  getRandomPointAround(pos: THREE.Vector3, radius: number): THREE.Vector3 | null;
  /** Register an agent with the crowd system. */
  addAgent(entityId: number, pos: THREE.Vector3, radius: number): any;
  /** Remove an agent from the crowd system. */
  removeAgent(entityId: number): void;
  /** Access the underlying crowd object (if any). */
  getCrowd(): any;
}

/**
 * Concrete implementation that forwards calls to the existing Recast navigation system.
 * This class can be swapped out for a different path‑finding backend without touching AI code.
 */
export class NavigationService implements INavigationService {
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  requestPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
    if (!this.game.recastNav) return [];
    const path = this.game.recastNav.findPath(start, end);
    // The recast API returns an array of THREE.Vector3 points.
    return path ?? [];
  }

  getRandomPointAround(pos: THREE.Vector3, radius: number): THREE.Vector3 | null {
    if (!this.game.recastNav) return null;
    return this.game.recastNav.getRandomPointAround(pos, radius);
  }

  addAgent(entityId: number, pos: THREE.Vector3, radius: number): any {
    if (!this.game.recastNav) return null;
    return this.game.recastNav.addAgent(entityId, pos, radius);
  }

  removeAgent(entityId: number): void {
    if (!this.game.recastNav) return;
    this.game.recastNav.removeAgent(entityId);
  }

  getCrowd(): any {
    return this.game.recastNav?.getCrowd() ?? null;
  }
}
