import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from './Game';

export class GameObject {
    public mesh: THREE.Object3D | null = null;
    public body: CANNON.Body | null = null;
    public game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public update(_dt: number) {
        // Sync graphics with physics
        if (this.body && this.mesh) {
            this.mesh.position.copy(this.body.position as any);
            this.mesh.quaternion.copy(this.body.quaternion as any);
        }
    }
}
