import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../../engine/Game';
import { GameObject } from '../../../engine/GameObject';
import { TileType } from '../TileMap';
import type { TileMap } from '../TileMap';
import type { TileData } from '../TileMap';
import type { MapMaterials } from './MapMaterials';

export class WallRenderer {
    private game: Game;
    private tileMap: TileMap;
    private materials: MapMaterials;

    constructor(
        game: Game,
        tileMap: TileMap,
        materials: MapMaterials
    ) {
        this.game = game;
        this.tileMap = tileMap;
        this.materials = materials;
    }

    public renderWalls(): void {
        const width = this.tileMap.getWidth();
        const height = this.tileMap.getHeight();
        const tileSize = this.tileMap.getTileSize();
        const processedWalls = new Set<string>();

        const getWallKey = (x1: number, y1: number, x2: number, y2: number) => {
            if (x1 < x2 || (x1 === x2 && y1 < y2)) return `${x1},${y1}-${x2},${y2}`;
            return `${x2},${y2}-${x1},${y1}`;
        };

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const tileData = this.tileMap.getTileData(x, y);
                if (!tileData || tileData.type === TileType.EMPTY) continue;

                const worldPos = this.tileMap.getWorldPosition(x, y);
                const checks = [
                    { x: x, y: y - 1, dir: 'north' },
                    { x: x, y: y + 1, dir: 'south' },
                    { x: x + 1, y: y, dir: 'east' },
                    { x: x - 1, y: y, dir: 'west' }
                ];

                for (const check of checks) {
                    const neighbor = this.tileMap.getTileData(check.x, check.y);

                    if (this.shouldCreateWall(tileData, neighbor, check.dir)) {
                        const key = getWallKey(x, y, check.x, check.y);
                        if (!processedWalls.has(key)) {
                            this.createWall(worldPos, tileSize, check.dir as any, tileData);
                            processedWalls.add(key);
                        }
                    }
                }
            }
        }
    }

    private shouldCreateWall(tile1: TileData, tile2: TileData | null, direction: string): boolean {
        // 1. Map Edge or Empty Void: Always Wall
        if (!tile2 || tile2.type === TileType.EMPTY) return true;

        // 2. Explicit Wall Tiles: If connection is Wall<->Wall, assume smooth (no extra wall).
        if (tile1.type === TileType.WALL && tile2.type === TileType.WALL) return false;

        // 3. Ramps/Stairs Logic:
        const isSlope1 = this.isSlope(tile1.type);
        const isSlope2 = this.isSlope(tile2.type);

        if (isSlope1 || isSlope2) {
            // If heights differ excessively, it's a cliff
            if (Math.abs(tile1.height - tile2.height) > 1.5) return true;

            // If one is a slope and the other is a walkable floor, check if they connect
            if (isSlope1 && !isSlope2) {
                if (Math.abs(tile1.height - tile2.height) <= 1.0) return false;
            } else if (isSlope2 && !isSlope1) {
                if (Math.abs(tile1.height - tile2.height) <= 1.0) return false;
            } else {
                // Both slopes
                return false;
            }

            return true;
        }

        // 4. Height Differences (Cliffs): 
        // If standard floors differ in height significantly, build a wall.
        if (Math.abs(tile1.height - tile2.height) > 0.5) return true;

        // 5. Only build a wall if one of them is explicitly a WALL type.
        if (tile1.type === TileType.WALL || tile2.type === TileType.WALL) return true;

        return false;
    }

    private isSlope(type: TileType): boolean {
        return type === TileType.RAMP_UP || type === TileType.RAMP_DOWN ||
            type === TileType.STAIRS_UP || type === TileType.STAIRS_DOWN;
    }

    private createWall(pos: THREE.Vector3, tileSize: number, direction: 'north' | 'south' | 'east' | 'west', tileData: TileData): void {
        const wallHeight = 3.0;
        const wallThickness = 0.2;

        let wallX = pos.x;
        let wallZ = pos.z;
        let rotationY = 0;

        if (direction === 'north') { wallZ -= tileSize / 2; rotationY = 0; }
        else if (direction === 'south') { wallZ += tileSize / 2; rotationY = Math.PI; }
        else if (direction === 'east') { wallX += tileSize / 2; rotationY = Math.PI / 2; }
        else if (direction === 'west') { wallX -= tileSize / 2; rotationY = -Math.PI / 2; }

        // Skip if door/window exists
        if (tileData.doorDirection === direction || tileData.windowDirection === direction) return;

        const go = new GameObject(this.game);

        // Visuals
        const geo = new THREE.BoxGeometry(tileSize, wallHeight, wallThickness);
        const mat = tileData.indoor ? this.materials.indoorWall : this.materials.wall;
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.set(wallX, pos.y + wallHeight / 2, wallZ);
        go.mesh.rotation.y = rotationY;
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, wallHeight / 2, wallThickness / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(wallX, pos.y + wallHeight / 2, wallZ),
            shape: shape,
            material: new CANNON.Material({ friction: 0.1, restitution: 0 })
        });
        go.body.quaternion.copy(go.mesh.quaternion as any);

        this.game.addGameObject(go);
    }
}
