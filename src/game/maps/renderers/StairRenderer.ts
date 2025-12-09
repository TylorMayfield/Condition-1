import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../../engine/Game';
import { GameObject } from '../../../engine/GameObject';
import { TileType } from '../TileMap';
import type { TileMap } from '../TileMap';
import type { TileData } from '../TileMap';
import type { MapMaterials } from './MapMaterials';

export class StairRenderer {
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
            let localZ: number = 0;
            let localX: number = 0;

            // CORRECTED LOGIC:
            // "Up North" means we travel North (-Z). Steps start at South edge (+Z) and move North (-Z).
            // "Down North" means we travel North (-Z) but go down. Steps start at South edge (+Z) and move North (-Z).
            // So for a given Direction, the horizontal placement logic is the same regardless of Up/Down.
            // The Height logic (stepY) handles the slope.

            if (direction === 'north') {
                // Move South -> North (+Z -> -Z)
                // Start (0) at +Z edge, End (count) at -Z edge
                localZ = tileSize / 2 - (stepDepth / 2) - (i * stepDepth);
            } else if (direction === 'south') {
                // Move North -> South (-Z -> +Z)
                // Start (0) at -Z edge, End (count) at +Z edge
                localZ = -tileSize / 2 + (stepDepth / 2) + (i * stepDepth);
            } else if (direction === 'east') {
                // Move West -> East (-X -> +X)
                // Start (0) at -X edge, End (count) at +X edge
                // Rotated local space? The previous code used rotationY. 
                // The Vector3 construction below uses localX, localZ and then applies rotationY.
                // If we apply rotation, we should just calculate "forward" motion in local Z and let rotation handle it?
                // The previous code had specific blocks for East/West setting localX.
                // Let's stick to setting local coordinates matching world axes roughly, but wait:
                // If we rotate, we should build the stairs along Z and rotate them? 
                // The previous code set 'rotationY' but also set localX for East/West.
                // If rotationY is set for East (-PI/2), then Local Forward (-Z) becomes World East (+X).
                // Let's look at how vec is made: new Vector3(localX, localY, localZ).applyAxisAngle...

                // Let's rely on the explicit coordinate setting from before but corrected:

                // East case in previous code used rotation -PI/2.
                // And set localX. 
                // If we rotate -90, (0,0,-1) becomes (-1,0,0) [West]. Wait.
                // North is -Z. East is +X.
                // Rotate -90 around Y (clockwise). North (-Z) -> (-1) * -Z -> East (+X). Correct.
                // So if we set localZ to move South->North, rotation makes it West->East.

                // HOWEVER, the previous code manually set localX for East/West and kept localZ 0.
                // This means it was NOT relying on the rotation to position the steps relative to center, separate from orientation.
                // It was calculating world-space-aligned offsets (before rotation? No, explicitly localX).
                // Let's stick to the previous pattern since rotation aligns the Box geometry "facing".

                if (direction === 'east') {
                    // Move West -> East (-X -> +X)
                    localX = -tileSize / 2 + (stepDepth / 2) + (i * stepDepth);
                    localZ = 0;
                } else if (direction === 'west') {
                    // Move East -> West (+X -> -X)
                    localX = tileSize / 2 - (stepDepth / 2) - (i * stepDepth);
                    localZ = 0;
                } else {
                    // North/South (already handled above but localX should be 0)
                    localX = 0;
                }
            } else { // west
                // Move East -> West (+X -> -X)
                localX = tileSize / 2 - (stepDepth / 2) - (i * stepDepth);
                localZ = 0;
            }

            // Calculate step height: interpolate between start and end heights
            const stepProgress = isStairUp ? (i + 0.5) / stepCount : 1 - (i + 0.5) / stepCount;
            const stepY = startHeight + (endHeight - startHeight) * stepProgress + stepHeight / 2;
            const localY = stepY - worldPos.y + 0.01; // Offset to sit on base floor

            const vec = new THREE.Vector3(localX, localY, localZ);
            // Verify: if we set localX for East, do we still rotate?
            // Previous code: yes. 
            // If direction East, rotation is -PI/2.
            // If we set localX to match World East... and then rotate?
            // If we act in local space, we should probably just build "Forward" stairs and rotate.
            // BUT, the 'getNeighborHeights' and logic uses world Grid.
            // Let's trust my derivation: explicit local offsets + explicit rotation for the mesh orientation.
            // Wait, if I set localX increasing (West->East), and then Rotate...
            // Rotation rotates the POSITION 'vec'.
            // If I want the final result to be West->East positions,
            // And I rotate by -90, what input gives West->East?
            // Input (North->South, +Z) rotated -90 -> (East->West, -X)? No.
            // Let's Simplify: Remove rotation from position calculation if we are manually setting X/Z.
            // Only apply rotation to the MESH/BODY orientation.

            // Actually, looking at previous code: `vec.applyAxisAngle(...)`.
            // This suggests local coords are in "Stair Space" and then rotated?
            // But the previous code had specific `if (direction == 'east') localX = ...`
            // If it was purely local "forward" logic, it wouldn't check direction inside the loop for X vs Z.
            // It suggests a mix.
            // Let's REMOVE the vector rotation for position and just use world-aligned local offsets!
            // We only need rotation for the Box shape (steps are wide and shallow).

            // So:
            // 1. Calculate localX, localY, localZ relative to tile center, assuming NO rotation for position.
            // 2. Set this position.
            // 3. Set rotation for the MESH/BODY only (to align step width).

            // Correct logic update:
            // remove `vec.applyAxisAngle`.
            // Use localX/Z as calculated.

            // Let's verify MESH rotation.
            // Box is Width=tileSize (X-axis usually), Height, Depth=stepDepth (Z-axis).
            // Default assumes steps go along Z axis (North/South).
            // If direction is East/West, steps should go along X axis.
            // So we need to rotate mesh 90 degrees?
            // Yes.
            // If direction North/South: Box is wide (X), short (Y), thin (Z). Correct.
            // If direction East/West: Box should be thin (X), short (Y), wide (Z).
            // So Rotate Y 90 deg.

            go.mesh = new THREE.Mesh(geo, mat);
            // Position
            go.mesh.position.set(worldPos.x + localX, worldPos.y + localY, worldPos.z + localZ);
            // Rotation
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
            go.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationY);

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
