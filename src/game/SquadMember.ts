import * as THREE from 'three';
import { Game } from '../engine/Game';
import { Enemy } from './Enemy';

export class SquadMember extends Enemy {
    constructor(game: Game, position: THREE.Vector3, name: string) {
        super(game, position, 'Player'); // Squad members are on Player team
        console.log(`Spawned squad member: ${name}`);

        // Visual Distinction (Green/Blue)
        if (this.mesh) {
            this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    (child.material as THREE.MeshStandardMaterial).color.setHex(0x0000ff);
                }
            });
        }
    }

    public update(dt: number) {
        // Let standard Enemy AI handle it.
        // It will now see it's on 'Player' team and default to Follow behavior if Idle.
        super.update(dt);
    }
}
