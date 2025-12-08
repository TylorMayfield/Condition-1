import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../../engine/Game';
import { GameObject } from '../../../engine/GameObject';
import { TileType } from '../TileMap';
import type { TileMap } from '../TileMap';
import type { TileData } from '../TileMap';
import type { MapMaterials } from './MapMaterials';

export class StairRenderer {
    constructor(
        private game: Game,
        private tileMap: TileMap,
        private materials: MapMaterials
    ) {}

    public createStairs(x: number, y: number, tileData: TileData): void {
        const worldPos = this.tileMap.getWorldPosition(x, y);
        const tileSize = this.tileMap.getTileSize();
        const neighbors = this.getNeighborHeights(x, y);
        const myHeight = tileData.height;
        
        // Determine if stairs go up or down based on tile type
        const isStairUp = tileData.type === TileType.STAIRS_UP;
        
        // Find the neighbor with the height difference that matches the stair direction
        let direction: 'north' | 'south' | 'east' | 'west' = 'north';
        let targetHeight: number | null = null;
        let heightDiff = 0;

        // For STAIRS_UP, find the neighbor that's higher (or search further if needed)
        // For STAIRS_DOWN, find the neighbor that's lower
        for (let i = 0; i < 4; i++) {
            const neighborHeight = neighbors[i];
            if (neighborHeight === null) continue;
            
            const diff = neighborHeight - myHeight;
            
            if (isStairUp && diff > 0) {
                // Going up - find the highest neighbor
                if (targetHeight === null || diff > heightDiff) {
                    targetHeight = neighborHeight;
                    heightDiff = diff;
                    if (i === 0) direction = 'north';
                    else if (i === 1) direction = 'south';
                    else if (i === 2) direction = 'east';
                    else if (i === 3) direction = 'west';
                }
            } else if (!isStairUp && diff < 0) {
                // Going down - find the lowest neighbor
                if (targetHeight === null || diff < heightDiff) {
                    targetHeight = neighborHeight;
                    heightDiff = diff;
                    if (i === 0) direction = 'north';
                    else if (i === 1) direction = 'south';
                    else if (i === 2) direction = 'east';
                    else if (i === 3) direction = 'west';
                }
            }
        }
        
        // Also check immediate neighbors for any height difference if we haven't found one
        if (targetHeight === null) {
            for (let i = 0; i < 4; i++) {
                const neighborHeight = neighbors[i];
                if (neighborHeight !== null && neighborHeight !== myHeight) {
                    targetHeight = neighborHeight;
                    heightDiff = neighborHeight - myHeight;
                    if (i === 0) direction = 'north';
                    else if (i === 1) direction = 'south';
                    else if (i === 2) direction = 'east';
                    else if (i === 3) direction = 'west';
                    break;
                }
            }
        }

        // If no valid neighbor found matching the direction, search in a wider radius
        if (targetHeight === null) {
            const searchRadius = 5; // Increased radius to find distant height changes
            let bestDiff = isStairUp ? -Infinity : Infinity;
            let bestDist = Infinity;
            
            for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    const checkX = x + dx;
                    const checkY = y + dy;
                    const checkTile = this.tileMap.getTileData(checkX, checkY);
                    if (!checkTile) continue;
                    
                    const diff = checkTile.height - myHeight;
                    const dist = Math.abs(dx) + Math.abs(dy);
                    
                    // For stairs going up, find the closest higher tile
                    // For stairs going down, find the closest lower tile
                    if (isStairUp && diff > 0) {
                        // Prefer closer tiles, but if same distance, prefer larger height difference
                        if (bestDiff === -Infinity || dist < bestDist || (dist === bestDist && diff > bestDiff)) {
                            bestDiff = diff;
                            bestDist = dist;
                            targetHeight = checkTile.height;
                            heightDiff = diff;
                            // Determine primary direction based on which axis has larger movement
                            if (Math.abs(dy) >= Math.abs(dx)) {
                                direction = dy < 0 ? 'north' : 'south';
                            } else {
                                direction = dx > 0 ? 'east' : 'west';
                            }
                        }
                    } else if (!isStairUp && diff < 0) {
                        // Prefer closer tiles, but if same distance, prefer larger height difference (more negative)
                        if (bestDiff === Infinity || dist < bestDist || (dist === bestDist && diff < bestDiff)) {
                            bestDiff = diff;
                            bestDist = dist;
                            targetHeight = checkTile.height;
                            heightDiff = diff;
                            // Determine primary direction
                            if (Math.abs(dy) >= Math.abs(dx)) {
                                direction = dy < 0 ? 'north' : 'south';
                            } else {
                                direction = dx > 0 ? 'east' : 'west';
                            }
                        }
                    }
                }
            }
        }

        // If still no valid direction found, default based on tile type
        if (targetHeight === null || heightDiff === 0) {
            direction = 'north';
            heightDiff = isStairUp ? 1 : -1;
            targetHeight = myHeight + heightDiff;
        }

        const totalHeight = Math.abs(heightDiff * tileSize);
        const stepCount = 6; 
        const stepHeight = totalHeight / stepCount;
        const stepDepth = tileSize / stepCount;
        
        let rotationY = 0;
        if (direction === 'south') rotationY = Math.PI;
        else if (direction === 'east') rotationY = -Math.PI / 2;
        else if (direction === 'west') rotationY = Math.PI / 2;

        // Stairs always go from current height to target height
        // Steps should start from the edge in the direction of travel
        const startHeight = myHeight * tileSize;
        const endHeight = targetHeight * tileSize;
        
        for (let i = 0; i < stepCount; i++) {
            const go = new GameObject(this.game);
            
            // Visuals
            const geo = new THREE.BoxGeometry(tileSize, stepHeight, stepDepth);
            const mat = tileData.indoor ? this.materials.indoorFloor : this.materials.floor;
            go.mesh = new THREE.Mesh(geo, mat);

            // Calculate step position along the direction of travel
            // Steps should progress from the starting edge (lower height) toward the target edge (higher height)
            // In local coordinates before rotation: Z is forward (north = positive Z), X is right (east = positive X)
            
            let localZ: number = 0;
            let localX: number = 0;
            
            // For stairs going UP, steps start at the edge OPPOSITE to the direction and progress TOWARD the direction
            // For stairs going DOWN, steps start at the direction edge and progress AWAY from it
            // The first step (i=0) should be at the starting edge, last step at the target edge
            
            if (direction === 'north') {
                // North: steps go from south to north (negative Z to positive Z)
                if (isStairUp) {
                    // Going up north: start at south edge, move north
                    localZ = -tileSize/2 + (stepDepth/2) + (i * stepDepth);
                } else {
                    // Going down north: start at north edge, move south
                    localZ = tileSize/2 - (stepDepth/2) - (i * stepDepth);
                }
            } else if (direction === 'south') {
                // South: steps go from north to south (positive Z to negative Z)
                if (isStairUp) {
                    // Going up south: start at north edge, move south
                    localZ = tileSize/2 - (stepDepth/2) - (i * stepDepth);
                } else {
                    // Going down south: start at south edge, move north
                    localZ = -tileSize/2 + (stepDepth/2) + (i * stepDepth);
                }
            } else if (direction === 'east') {
                // East: steps go from west to east (negative X to positive X)
                // After -90° rotation, X becomes the forward axis (Z)
                if (isStairUp) {
                    // Going up east: start at west edge, move east
                    localX = -tileSize/2 + (stepDepth/2) + (i * stepDepth);
                } else {
                    // Going down east: start at east edge, move west
                    localX = tileSize/2 - (stepDepth/2) - (i * stepDepth);
                }
                localZ = 0;
            } else { // west
                // West: steps go from east to west (positive X to negative X)
                // After 90° rotation, X becomes the forward axis (Z)
                if (isStairUp) {
                    // Going up west: start at east edge, move west
                    localX = tileSize/2 - (stepDepth/2) - (i * stepDepth);
                } else {
                    // Going down west: start at west edge, move east
                    localX = -tileSize/2 + (stepDepth/2) + (i * stepDepth);
                }
                localZ = 0;
            }
            
            // Calculate step height: interpolate between start and end heights
            // For stairs going UP, first step (i=0) should be at startHeight, last step at endHeight
            // For stairs going DOWN, first step should be at endHeight, last step at startHeight
            const stepProgress = isStairUp ? (i + 0.5) / stepCount : 1 - (i + 0.5) / stepCount;
            const stepY = startHeight + (endHeight - startHeight) * stepProgress + stepHeight / 2;
            const localY = stepY - worldPos.y + 0.01; // Offset to sit on base floor

            const vec = new THREE.Vector3(localX, localY, localZ);
            vec.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);

            go.mesh.position.set(worldPos.x + vec.x, worldPos.y + vec.y, worldPos.z + vec.z);
            go.mesh.rotation.y = rotationY;
            go.mesh.castShadow = true;
            go.mesh.receiveShadow = true;

            // Physics
            const shape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, stepHeight / 2, stepDepth / 2));
            go.body = new CANNON.Body({
                mass: 0,
                position: new CANNON.Vec3(go.mesh.position.x, go.mesh.position.y, go.mesh.position.z),
                shape: shape,
            });
            go.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), rotationY);

            this.game.addGameObject(go);
        }
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

