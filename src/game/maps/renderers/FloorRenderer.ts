import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../../engine/Game';
import { GameObject } from '../../../engine/GameObject';
import type { TileData } from '../TileMap';
import type { MapMaterials } from './MapMaterials';

export class FloorRenderer {
    constructor(
        private game: Game,
        private materials: MapMaterials
    ) {}

    public createFloorTile(pos: THREE.Vector3, size: number, tileData: TileData): void {
        const go = new GameObject(this.game);
        const floorThickness = 0.2;

        // pos.y is the surface level (from height * tileSize in getWorldPosition)
        // Position floor so its top surface is at pos.y
        const floorCenterY = pos.y - floorThickness / 2;

        const shape = new CANNON.Box(new CANNON.Vec3(size / 2, floorThickness / 2, size / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(pos.x, floorCenterY, pos.z),
            shape: shape,
            material: new CANNON.Material({ friction: 0.8, restitution: 0 })
        });

        const geo = new THREE.BoxGeometry(size, floorThickness, size);
        const mat = tileData.indoor ? this.materials.indoorFloor : this.materials.floor;
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.set(pos.x, floorCenterY, pos.z);
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }
}

