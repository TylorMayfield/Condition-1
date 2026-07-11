import * as THREE from 'three';
import type { GameObject } from '../../engine/GameObject';
import type { EnemyAI } from '../components/EnemyAI';

interface Reservation {
    ownerId: number;
    expiresAt: number;
}
export type TeamBuyIntent = 'full-buy' | 'force-buy' | 'eco';
export type SquadRole = 'carrier' | 'entry' | 'support' | 'sniper' | 'kit-holder' | 'anchor' | 'rotator' | 'lurk';

/** Lightweight shared team memory. Individual FSMs still execute the orders. */
export class AITeamCoordinator {
    private static targetAssignments = new Map<string, Map<GameObject, Set<number>>>();
    private static coverReservations = new Map<string, Map<string, Reservation>>();
    private static flankReservations = new Map<string, Map<'left' | 'right', Reservation>>();
    private static sightings = new Map<string, Array<{ target: GameObject; position: THREE.Vector3; seenAt: number }>>();

    static classifyBuy(balances: readonly number[]): TeamBuyIntent {
        if (!balances.length) return 'eco';
        const average = balances.reduce((sum, value) => sum + value, 0) / balances.length;
        return average >= 4200 ? 'full-buy' : average >= 2200 ? 'force-buy' : 'eco';
    }

    static assignSquadRoles(count: number, attacking: boolean): SquadRole[] {
        const attack: SquadRole[] = ['carrier', 'entry', 'support', 'sniper', 'lurk'];
        const defense: SquadRole[] = ['anchor', 'anchor', 'rotator', 'sniper', 'kit-holder'];
        const source = attacking ? attack : defense;
        return Array.from({ length: count }, (_, i) => source[i % source.length]);
    }

    private static teamKey(ai: EnemyAI): string {
        return `${ai.owner.team}`;
    }

    private static positionKey(position: THREE.Vector3): string {
        return `${Math.round(position.x * 2)},${Math.round(position.z * 2)}`;
    }

    static assignTarget(ai: EnemyAI, target: GameObject): void {
        this.releaseTarget(ai);
        const team = this.teamKey(ai);
        let assignments = this.targetAssignments.get(team);
        if (!assignments) this.targetAssignments.set(team, assignments = new Map());
        let owners = assignments.get(target);
        if (!owners) assignments.set(target, owners = new Set());
        owners.add(ai.entityId);
        ai.blackboard.assignedTarget = target;
    }

    static getAttackerCount(ai: EnemyAI, target: GameObject): number {
        return this.targetAssignments.get(this.teamKey(ai))?.get(target)?.size ?? 0;
    }

    static reportSighting(ai: EnemyAI, target: GameObject, position: THREE.Vector3): void {
        this.assignTarget(ai, target);
        const key = this.teamKey(ai);
        const recent = (this.sightings.get(key) ?? []).filter(s => Date.now() - s.seenAt < 8000 && s.target !== target);
        recent.push({ target, position: position.clone(), seenAt: Date.now() });
        this.sightings.set(key, recent);
        // Nearby teammates consume this through the existing sound/alert path without gaining perfect vision.
        for (const go of ai.game.getGameObjects()) {
            const teammateAI = (go as { ai?: EnemyAI }).ai;
            if (!teammateAI || teammateAI === ai || go.team !== ai.owner.team) continue;
            const teammatePos = teammateAI.getOwnerPosition();
            if (!teammatePos || teammatePos.distanceTo(position) > 35) continue;
            teammateAI.blackboard.heardSound(position, 2);
        }
    }

    static getRecentSightings(team: string, maxAgeMs: number = 8000): ReadonlyArray<{ target: GameObject; position: THREE.Vector3; seenAt: number }> {
        const now = Date.now(); const valid = (this.sightings.get(team) ?? []).filter(s => now - s.seenAt <= maxAgeMs); this.sightings.set(team, valid); return valid;
    }

    static reserveCover(ai: EnemyAI, position: THREE.Vector3, seconds: number = 8): boolean {
        const team = this.teamKey(ai);
        let reservations = this.coverReservations.get(team);
        if (!reservations) this.coverReservations.set(team, reservations = new Map());
        const key = this.positionKey(position);
        const current = reservations.get(key);
        const now = Date.now();
        if (current && current.ownerId !== ai.entityId && current.expiresAt > now) return false;
        reservations.set(key, { ownerId: ai.entityId, expiresAt: now + seconds * 1000 });
        return true;
    }

    static reserveFlank(ai: EnemyAI, preferred: 'left' | 'right'): 'left' | 'right' | null {
        const team = this.teamKey(ai);
        let reservations = this.flankReservations.get(team);
        if (!reservations) this.flankReservations.set(team, reservations = new Map());
        const now = Date.now();
        for (const side of [preferred, preferred === 'left' ? 'right' : 'left'] as const) {
            const current = reservations.get(side);
            if (!current || current.ownerId === ai.entityId || current.expiresAt <= now) {
                reservations.set(side, { ownerId: ai.entityId, expiresAt: now + 12000 });
                return side;
            }
        }
        return null;
    }

    static releaseAll(ai: EnemyAI): void {
        this.releaseTarget(ai);
        for (const reservations of this.coverReservations.values()) {
            for (const [key, value] of reservations) if (value.ownerId === ai.entityId) reservations.delete(key);
        }
        for (const reservations of this.flankReservations.values()) {
            for (const [key, value] of reservations) if (value.ownerId === ai.entityId) reservations.delete(key);
        }
    }

    private static releaseTarget(ai: EnemyAI): void {
        for (const assignments of this.targetAssignments.values()) {
            for (const [target, owners] of assignments) {
                owners.delete(ai.entityId);
                if (owners.size === 0) assignments.delete(target);
            }
        }
    }
}
