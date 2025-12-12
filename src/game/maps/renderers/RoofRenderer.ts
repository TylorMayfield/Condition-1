import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../../engine/Game';
import { GameObject } from '../../../engine/GameObject';
import type { TileMap } from '../TileMap';
import type { MapMaterials } from './MapMaterials';

export class RoofRenderer {
    constructor(
        private game: Game,
        private tileMap: TileMap,
        private materials: MapMaterials
    ) {}

    public renderRoofs(): void {
        const width = this.tileMap.getWidth();
        const height = this.tileMap.getHeight();
        const tileSize = this.tileMap.getTileSize();

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const tileData = this.tileMap.getTileData(x, y);
                if (!tileData || !tileData.hasRoof) continue;

                const worldPos = this.tileMap.getWorldPosition(x, y);
                const roofHeight = 3.0;

                const go = new GameObject(this.game);

                // Physics
                const shape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, 0.2, tileSize / 2));
                go.body = new CANNON.Body({
                    mass: 0,
                    position: new CANNON.Vec3(worldPos.x, worldPos.y + roofHeight, worldPos.z),
                    shape: shape,
                    material: new CANNON.Material({ friction: 0.8, restitution: 0 })
                });

                // Visuals
                const geo = new THREE.BoxGeometry(tileSize, 0.4, tileSize);
                go.mesh = new THREE.Mesh(geo, this.materials.roof);
                go.mesh.position.copy(go.body.position as any);
                go.mesh.castShadow = true;
                go.mesh.receiveShadow = true;

                this.game.addGameObject(go);
            }
        }
    }
}



