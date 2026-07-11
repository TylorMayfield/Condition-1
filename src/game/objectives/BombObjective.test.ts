import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BombObjective } from './BombObjective';
import { DEFAULT_MATCH_RULES, ObjectiveState } from '../gamemodes/round/MatchTypes';

const actor = (id: string, team: 'TaskForce' | 'OpFor', kit = false) => ({ id, team, position: new THREE.Vector3(), alive: true, hasDefuseKit: kit });
describe('BombObjective', () => {
    it('interrupts and completes planting', () => {
        const bomb = new BombObjective(DEFAULT_MATCH_RULES); const carrier = actor('t', 'OpFor'); bomb.reset(carrier.id);
        expect(bomb.updatePlant(carrier, 'A', true, 2)).toBe(false); bomb.updatePlant(carrier, null, false, 0.1); expect(bomb.state).toBe(ObjectiveState.Carried);
        expect(bomb.updatePlant(carrier, 'A', true, 3)).toBe(true); expect(bomb.state).toBe(ObjectiveState.Planted);
    });
    it('uses kit timing and explodes when not defused', () => {
        const bomb = new BombObjective(DEFAULT_MATCH_RULES); const carrier = actor('t', 'OpFor'); bomb.reset(carrier.id); bomb.updatePlant(carrier, 'B', true, 3);
        expect(bomb.updateDefuse(actor('ct', 'TaskForce', true), true, 5)).toBe(true);
        bomb.reset(carrier.id); bomb.updatePlant(carrier, 'A', true, 3); expect(bomb.update(40)).toBe(true); expect(bomb.state).toBe(ObjectiveState.Exploded);
    });
});
