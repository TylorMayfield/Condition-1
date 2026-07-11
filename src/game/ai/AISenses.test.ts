import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { AISenses } from './AISenses';
import type { Game } from '../../engine/Game';
import type { Enemy } from '../Enemy';

function fixture(withWall = false) {
    const world = new CANNON.World();
    const ownerBody = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(0.4), position: new CANNON.Vec3(0, 0, 0) });
    const targetBody = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(0.4), position: new CANNON.Vec3(0, 0, 5) });
    world.addBody(ownerBody); world.addBody(targetBody);
    if (withWall) world.addBody(new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(1, 1, 0.2)), position: new CANNON.Vec3(0, 0.5, 2.5) }));
    const owner = { body: ownerBody, mesh: new THREE.Group() } as unknown as Enemy;
    return { senses: new AISenses({ world } as Game, owner), target: { body: targetBody } };
}

describe('AISenses', () => {
    it('ignores the owner collider when checking visible targets', () => { const { senses, target } = fixture(); expect(senses.canSee(target)).toBe(true); });
    it('rejects targets occluded by world geometry', () => { const { senses, target } = fixture(true); expect(senses.canSee(target)).toBe(false); });
});
