import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../../engine/Game';
import { GameObject } from '../../../engine/GameObject';
import type { TileMap } from '../TileMap';
import type { TileData } from '../TileMap';
import type { MapMaterials } from './MapMaterials';

export class RampRenderer {
    constructor(
        private game: Game,
        private tileMap: TileMap,
        private materials: MapMaterials
    ) {}

    public createRamp(x: number, y: number, tileData: TileData): void {
        const worldPos = this.tileMap.getWorldPosition(x, y);
        const tileSize = this.tileMap.getTileSize();
        
        const neighbors = this.getNeighborHeights(x, y);
        const myHeight = tileData.height;
        
        // Determine direction of the slope
        let direction: 'north' | 'south' | 'east' | 'west' = 'north';
        let heightDiff = 0;

        if (neighbors[0] !== null && neighbors[0] !== myHeight) { direction = 'north'; heightDiff = neighbors[0]! - myHeight; }
        else if (neighbors[1] !== null && neighbors[1] !== myHeight) { direction = 'south'; heightDiff = neighbors[1]! - myHeight; }
        else if (neighbors[2] !== null && neighbors[2] !== myHeight) { direction = 'east'; heightDiff = neighbors[2]! - myHeight; }
        else if (neighbors[3] !== null && neighbors[3] !== myHeight) { direction = 'west'; heightDiff = neighbors[3]! - myHeight; }

        // If no height difference found, it's a flat tile, render nothing extra (base floor handles it)
        if (heightDiff === 0) return;

        const verticalRise = Math.abs(heightDiff * tileSize); 
        const rampLength = Math.sqrt(Math.pow(tileSize, 2) + Math.pow(verticalRise, 2));
        const slopeAngle = Math.atan2(verticalRise, tileSize);

        const go = new GameObject(this.game);
        const thickness = 0.2;

        const geo = new THREE.BoxGeometry(tileSize, thickness, rampLength);
        const mat = tileData.indoor ? this.materials.indoorFloor : this.materials.floor;
        go.mesh = new THREE.Mesh(geo, mat);

        // Position ramp. 
        // We lift y by (verticalRise / 2) + small offset to sit ON TOP of the base floor we just created.
        go.mesh.position.set(worldPos.x, worldPos.y + verticalRise / 2 + 0.01, worldPos.z);

        let yRotation = 0;
        if (direction === 'south') yRotation = Math.PI;
        else if (direction === 'east') yRotation = -Math.PI / 2;
        else if (direction === 'west') yRotation = Math.PI / 2;

        go.mesh.rotation.y = yRotation;
        
        const inclineDir = heightDiff > 0 ? 1 : -1;
        go.mesh.rotateX(slopeAngle * inclineDir);

        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, thickness / 2, rampLength / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(go.mesh.position.x, go.mesh.position.y, go.mesh.position.z),
            shape: shape,
            material: new CANNON.Material({ friction: 0.8, restitution: 0 })
        });
        go.body.quaternion.copy(go.mesh.quaternion as any);

        this.game.addGameObject(go);
    }

    private getNeighborHeights(x: number, y: number): (number | null)[] {
        return [
            this.tileMap.getTileData(x, y - 1)?.height ?? null, // north
            this.tileMap.getTileData(x, y + 1)?.height ?? null, // south
            this.tileMap.getTileData(x + 1, y)?.height ?? null, // east
            this.tileMap.getTileData(x - 1, y)?.height ?? null  // west
        ];
    }
}



