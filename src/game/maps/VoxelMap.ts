import * as THREE from 'three';
import { Game } from '../../engine/Game';

export const BlockType = {
    AIR: 0,
    CONCRETE: 1,
    BRICK: 2,
    WOOD_PLANKS: 3,
    GRASS: 4,
    DIRT: 5,
    STONE: 6,
    METAL: 7,
    CRATE: 8,
    // Special
    SPAWN_POINT: 99
} as const;

export type BlockType = typeof BlockType[keyof typeof BlockType];

export type Block = {
    x: number;
    y: number;
    z: number;
    type: BlockType;
};

export type VoxelMapDefinition = {
    name: string;
    version: string;
    scale: number; // Size of one voxel unit (usually 1 or 2 world units)
    blocks: Block[];
    spawnPoints?: Array<{
        x: number;
        y: number;
        z: number;
        team?: 'ct' | 't' | 'neutral';
        type?: 'player' | 'enemy';
    }>;
};

export class VoxelMap {
    private game: Game;
    private mapData: VoxelMapDefinition;
    public scale: number;

    // Spatial hash for fast lookups: "x,y,z" -> Block
    private blockMap: Map<string, Block> = new Map();

    constructor(game: Game, mapData: VoxelMapDefinition) {
        this.game = game;
        this.mapData = mapData;
        this.scale = mapData.scale || 1;

        // Index blocks
        for (const block of mapData.blocks) {
            this.setBlock(block.x, block.y, block.z, block);
        }
    }

    private getKey(x: number, y: number, z: number): string {
        return `${x},${y},${z}`;
    }

    public getBlock(x: number, y: number, z: number): Block | undefined {
        return this.blockMap.get(this.getKey(x, y, z));
    }

    public setBlock(x: number, y: number, z: number, block: Block) {
        this.blockMap.set(this.getKey(x, y, z), block);
    }

    public hasBlock(x: number, y: number, z: number): boolean {
        return this.blockMap.has(this.getKey(x, y, z));
    }

    // Convert grid coords to world position (center of block)
    public getWorldPosition(x: number, y: number, z: number): THREE.Vector3 {
        return new THREE.Vector3(
            x * this.scale,
            y * this.scale + (this.scale / 2), // Pivot at bottom center usually? Or center? Let's say center for voxels.
            z * this.scale
        );
    }

    // Convert world position to grid coords
    public getGridCoords(worldPos: THREE.Vector3): { x: number, y: number, z: number } {
        return {
            x: Math.round(worldPos.x / this.scale),
            y: Math.round((worldPos.y - (this.scale / 2)) / this.scale), // Adjust for center pivot
            z: Math.round(worldPos.z / this.scale)
        };
    }

    public getAllBlocks(): Block[] {
        return this.mapData.blocks;
    }

    public getSpawnPoints() {
        return this.mapData.spawnPoints || [];
    }
}
