import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../../engine/Game';
import { GameObject } from '../../../engine/GameObject';
import type { TileData } from '../TileMap';
import type { MapMaterials } from './MapMaterials';

export class CoverRenderer {
    constructor(
        private game: Game,
        private materials: MapMaterials
    ) {}

    public createCover(pos: THREE.Vector3, size: number, tileData: TileData): void {
        const coverHeight = 1.5;
        const coverWidth = size * 0.8;

        const go = new GameObject(this.game);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(coverWidth / 2, coverHeight / 2, 0.2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(pos.x, pos.y + coverHeight / 2, pos.z),
            shape: shape,
            material: new CANNON.Material({ friction: 0.8, restitution: 0 })
        });

        // Visuals
        const geo = new THREE.BoxGeometry(coverWidth, coverHeight, 0.4);
        go.mesh = new THREE.Mesh(geo, this.materials.wall);
        go.mesh.position.copy(go.body.position as any);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }
}



