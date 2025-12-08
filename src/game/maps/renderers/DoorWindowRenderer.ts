import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../../engine/Game';
import { GameObject } from '../../../engine/GameObject';
import type { TileMap } from '../TileMap';
import type { TileData } from '../TileMap';
import type { MapMaterials } from './MapMaterials';

export class DoorWindowRenderer {
    constructor(
        private game: Game,
        private tileMap: TileMap,
        private materials: MapMaterials
    ) {}

    public createDoor(x: number, y: number, tileData: TileData): void {
        const worldPos = this.tileMap.getWorldPosition(x, y);
        const tileSize = this.tileMap.getTileSize();
        const direction = tileData.doorDirection || 'north';
        const doorHeight = 2.5;
        const doorWidth = 1.0;
        const doorThickness = 0.1;

        const go = new GameObject(this.game);

        // Position door on the edge of the tile based on direction
        let doorX = worldPos.x;
        let doorZ = worldPos.z;
        let rotationY = 0;

        if (direction === 'north') {
            doorZ -= tileSize / 2;
            rotationY = 0;
        } else if (direction === 'south') {
            doorZ += tileSize / 2;
            rotationY = Math.PI;
        } else if (direction === 'east') {
            doorX += tileSize / 2;
            rotationY = Math.PI / 2;
        } else if (direction === 'west') {
            doorX -= tileSize / 2;
            rotationY = -Math.PI / 2;
        }

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(doorWidth / 2, doorHeight / 2, doorThickness / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(doorX, worldPos.y + doorHeight / 2, doorZ),
            shape: shape,
            material: new CANNON.Material({ friction: 0.8, restitution: 0 })
        });
        go.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), rotationY);

        // Visuals
        const geo = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
        go.mesh = new THREE.Mesh(geo, this.materials.door);
        go.mesh.position.copy(go.body.position as any);
        go.mesh.quaternion.copy(go.body.quaternion as any);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    public createWindow(x: number, y: number, tileData: TileData): void {
        const worldPos = this.tileMap.getWorldPosition(x, y);
        const tileSize = this.tileMap.getTileSize();
        const direction = tileData.windowDirection || 'north';
        const windowHeight = 1.5;
        const windowWidth = 1.5;
        const windowThickness = 0.05;
        const wallThickness = 0.2; // Match wall thickness from WallRenderer

        const go = new GameObject(this.game);

        // Position window on the wall surface (same position as wall center)
        let windowX = worldPos.x;
        let windowZ = worldPos.z;
        let rotationY = 0;

        // Position window at the same location as the wall center
        // The wall is positioned at tileSize/2 from center, so window should be there too
        if (direction === 'north') {
            windowZ -= tileSize / 2;
            rotationY = 0;
        } else if (direction === 'south') {
            windowZ += tileSize / 2;
            rotationY = Math.PI;
        } else if (direction === 'east') {
            windowX += tileSize / 2;
            rotationY = Math.PI / 2;
        } else if (direction === 'west') {
            windowX -= tileSize / 2;
            rotationY = -Math.PI / 2;
        }

        // Visuals only (windows don't block physics)
        // Position window slightly inset into the wall to avoid z-fighting
        // The wall extends from -wallThickness/2 to +wallThickness/2 from its center
        // Position window at the wall surface (wallThickness/2 from center, then inset by windowThickness/2)
        const inset = (wallThickness / 2) - (windowThickness / 2) - 0.01; // Small offset to avoid z-fighting
        
        let finalX = windowX;
        let finalZ = windowZ;
        if (direction === 'north') {
            finalZ += inset; // Move slightly south (positive Z) into the wall
        } else if (direction === 'south') {
            finalZ -= inset; // Move slightly north (negative Z) into the wall
        } else if (direction === 'east') {
            finalX -= inset; // Move slightly west (negative X) into the wall
        } else if (direction === 'west') {
            finalX += inset; // Move slightly east (positive X) into the wall
        }

        const geo = new THREE.BoxGeometry(windowWidth, windowHeight, windowThickness);
        go.mesh = new THREE.Mesh(geo, this.materials.window);
        go.mesh.position.set(finalX, worldPos.y + windowHeight / 2 + 0.5, finalZ);
        go.mesh.rotation.y = rotationY;
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }
}

