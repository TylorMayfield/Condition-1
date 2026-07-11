import * as THREE from 'three';
import type { AIPersonality } from './AIPersonality';
import { AIPersonality as AIPersonalityEnum } from './AIPersonality';
import type { Game } from '../../engine/Game';
import type { EnemyAI } from '../components/EnemyAI';

export interface PersonalityTactics {
    flankDistance: number;
    coverEagerness: number;
    strafeAggression: number;
    accuracyBonus: number;
}

const PERSONALITY_TACTICS: Record<AIPersonality, PersonalityTactics> = {
    [AIPersonalityEnum.Rusher]: {
        flankDistance: 18,
        coverEagerness: 0.35,
        strafeAggression: 0.4,
        accuracyBonus: 0.85,
    },
    [AIPersonalityEnum.Sniper]: {
        flankDistance: 28,
        coverEagerness: 0.9,
        strafeAggression: 0.15,
        accuracyBonus: 0.55,
    },
    [AIPersonalityEnum.Tactical]: {
        flankDistance: 12,
        coverEagerness: 0.75,
        strafeAggression: 0.7,
        accuracyBonus: 0.7,
    },
};

export class AITactics {
    static getPersonality(ai: EnemyAI): PersonalityTactics {
        return PERSONALITY_TACTICS[ai.personality];
    }

    static snapToNavMesh(game: Game, position: THREE.Vector3): THREE.Vector3 {
        const snapped = game.recastNav?.closestPointTo(position);
        return snapped ?? position.clone();
    }

    /** Pick a movement goal that uses cover, vantage, or flanking offsets — not a straight rush. */
    static findChasePosition(ai: EnemyAI, targetPos: THREE.Vector3): THREE.Vector3 {
        const ownerPos = ai.getOwnerPosition();
        if (!ownerPos) return targetPos.clone();

        const threatDir = new THREE.Vector3().subVectors(targetPos, ownerPos);
        const distance = threatDir.length();
        if (distance < 0.1) return targetPos.clone();
        threatDir.normalize();

        const tactics = this.getPersonality(ai);
        const underPressure = ai.owner.isUnderFire || ai.blackboard.timeSinceDamaged < 3;

        // Sniper: prefer elevated vantage with distance
        if (ai.personality === AIPersonalityEnum.Sniper) {
            const vantage = this.findBestVantage(ai, ownerPos, targetPos);
            if (vantage) return vantage;
        }

        // Under fire: step toward nearest cover that still allows angle on target
        if (underPressure && ai.blackboard.canSeekCover() && Math.random() < tactics.coverEagerness) {
            const cover = ai.cover.findCover(targetPos, ai);
            if (cover && cover.distance < 18) {
                return this.snapToNavMesh(ai.game, cover.position);
            }
        }

        // Tactical / general: approach via choke waypoint when available
        const choke = this.findChokeWaypoint(ai, ownerPos, targetPos);
        if (choke && distance > 10) {
            return choke;
        }

        // Flanking offset arc — spread bots and avoid head-on charges
        const perp = new THREE.Vector3(-threatDir.z, 0, threatDir.x);
        const spreadSign = (ai.entityId % 2 === 0 ? 1 : -1);
        const arcStrength = ai.personality === AIPersonalityEnum.Rusher ? 1.5 : 3.5;
        const offset = perp.multiplyScalar(spreadSign * arcStrength);

        let approach = targetPos.clone().add(offset);

        // Stop short of target — hold optimal engagement distance
        const holdDistance =
            ai.personality === AIPersonalityEnum.Rusher
                ? ai.attackRange * 0.55
                : ai.personality === AIPersonalityEnum.Sniper
                  ? Math.max(ai.minAttackRange, ai.attackRange * 0.75)
                  : ai.attackRange * 0.65;

        if (distance > holdDistance) {
            approach = ownerPos.clone().add(threatDir.multiplyScalar(Math.min(distance - holdDistance, 6)));
            approach.add(offset);
        }

        return this.snapToNavMesh(ai.game, approach);
    }

    static findBestVantage(ai: EnemyAI, ownerPos: THREE.Vector3, targetPos: THREE.Vector3): THREE.Vector3 | null {
        const vantages = ai.game.recastNav?.strategicPoints?.vantagePoints;
        if (!vantages?.length) return null;

        let best: THREE.Vector3 | null = null;
        let bestScore = -1;

        for (const v of vantages) {
            const pos = new THREE.Vector3(...v.position);
            const distToTarget = pos.distanceTo(targetPos);
            const distToSelf = pos.distanceTo(ownerPos);

            if (distToTarget < ai.minAttackRange || distToTarget > ai.attackRange) continue;
            if (distToSelf > 35) continue;

            const score = v.visibilityScore * (1 - distToSelf / 40);
            if (score > bestScore) {
                bestScore = score;
                best = pos;
            }
        }

        return best ? this.snapToNavMesh(ai.game, best) : null;
    }

    static findChokeWaypoint(ai: EnemyAI, ownerPos: THREE.Vector3, targetPos: THREE.Vector3): THREE.Vector3 | null {
        const chokes = ai.game.recastNav?.strategicPoints?.chokePoints;
        if (!chokes?.length) return null;

        let best: THREE.Vector3 | null = null;
        let bestScore = -1;

        for (const c of chokes) {
            const pos = new THREE.Vector3(...c.position);
            const toTarget = pos.distanceTo(targetPos);
            const toSelf = pos.distanceTo(ownerPos);

            if (toSelf > toTarget || toSelf < 3) continue;

            const score = (1 / Math.max(c.width, 1)) * (1 - toSelf / 40);
            if (score > bestScore) {
                bestScore = score;
                best = pos;
            }
        }

        return best ? this.snapToNavMesh(ai.game, best) : null;
    }

    static findRetreatPosition(ai: EnemyAI): THREE.Vector3 | null {
        const pos = ai.getOwnerPosition();
        const target = ai.target;
        if (!pos || !target?.body) return null;

        const away = new THREE.Vector3(
            pos.x - target.body.position.x,
            0,
            pos.z - target.body.position.z,
        );
        if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        away.normalize();

        const retreatDist = ai.personality === AIPersonalityEnum.Sniper ? 14 : 10;
        let retreatPos = pos.clone().add(away.multiplyScalar(retreatDist));

        const cover = ai.cover.findCover(
            new THREE.Vector3(target.body.position.x, target.body.position.y, target.body.position.z),
            ai,
        );
        if (cover && cover.position.distanceTo(pos) < 20) {
            retreatPos = cover.position.clone();
        }

        const random = ai.game.recastNav?.getRandomPointAround(retreatPos, 4);
        return this.snapToNavMesh(ai.game, random ?? retreatPos);
    }

    static isCombatState(state: number): boolean {
        return state === 1 || state === 2 || state === 5 || state === 6; // Chase, Attack, TakeCover, Flank (legacy AIState values)
    }
}
