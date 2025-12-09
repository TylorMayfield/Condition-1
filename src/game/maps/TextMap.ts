import * as THREE from 'three';
import { Game } from '../../engine/Game';

/**
 * Block types for the TextMap format.
 * Maps to visual/physical properties in the renderer.
 */
export const TextBlockType = {
    AIR: 0,
    CONCRETE: 1,
    BRICK: 2,
    WOOD_PLANKS: 3,
    GRASS: 4,
    DIRT: 5,
    STONE: 6,
    METAL: 7,
    CRATE: 8,
} as const;

export type TextBlockType = typeof TextBlockType[keyof typeof TextBlockType];

/**
 * Entity types for spawns and interactive objects.
 */
export type EntityType = 'player_spawn' | 'enemy_spawn' | 'squad_spawn' | 'pickup' | 'objective';

/**
 * Team affiliations.
 */
export type Team = 'ct' | 't' | 'neutral';

/**
 * AI behavior patterns for enemies.
 */
export type AIBehavior = 'patrol' | 'guard' | 'aggressive' | 'passive';

/**
 * Brush geometry types for complex 3D shapes.
 */
export type BrushType = 'box' | 'stairs' | 'ramp' | 'cylinder';

/**
 * A single layer (horizontal slice) of the map at a specific Y level.
 */
export type TextMapLayer = {
    y: number;
    label?: string;
    grid: string[];  // Array of strings, each character maps to a block type via legend
};

/**
 * A 3D brush for complex geometry like stairs, ramps, etc.
 */
export type TextMapBrush = {
    name?: string;
    type: BrushType;
    position?: { x: number; y: number; z: number };
    from?: { x: number; y: number; z: number };
    to?: { x: number; y: number; z: number };
    size?: { x: number; y: number; z: number };
    direction?: 'north' | 'south' | 'east' | 'west';
    material?: string;
    destructible?: boolean;
    color?: number;
};

/**
 * An entity definition (spawn point, pickup, objective, etc.)
 */
export type TextMapEntity = {
    type: EntityType;
    position: { x: number; y: number; z: number };
    team?: Team;
    name?: string;
    ai?: AIBehavior;
    properties?: Record<string, string | number | boolean>;
};

/**
 * The complete definition of a TextMap parsed from a .textmap file.
 */
export type TextMapDefinition = {
    name: string;
    version: string;
    scale: number;
    legend: Map<string, TextBlockType | EntityType>;
    layers: TextMapLayer[];
    brushes: TextMapBrush[];
    entities: TextMapEntity[];
};

/**
 * A resolved 3D block (after legend lookup).
 */
export type TextMapBlock = {
    x: number;
    y: number;
    z: number;
    type: TextBlockType;
};

/**
 * TextMap class - holds parsed map data and provides utility methods.
 */
export class TextMap {
    private _game: Game;
    private mapData: TextMapDefinition;
    public scale: number;

    // Spatial hash for fast lookups: "x,y,z" -> Block
    private blockMap: Map<string, TextMapBlock> = new Map();

    // Default legend mapping characters to block types
    private static readonly DEFAULT_LEGEND: Record<string, TextBlockType | EntityType> = {
        '.': TextBlockType.AIR,
        ' ': TextBlockType.AIR,
        '#': TextBlockType.CONCRETE,
        'B': TextBlockType.BRICK,
        'W': TextBlockType.WOOD_PLANKS,
        'G': TextBlockType.GRASS,
        'D': TextBlockType.DIRT,
        'S': TextBlockType.STONE,
        'M': TextBlockType.METAL,
        'C': TextBlockType.CRATE,
        'P': 'player_spawn',
        'E': 'enemy_spawn',
        'Q': 'squad_spawn',
    };

    constructor(game: Game, mapData: TextMapDefinition) {
        this._game = game;
        this.mapData = mapData;
        this.scale = mapData.scale || 2;

        // Build 3D block map from layers
        this.buildBlockMap();
    }

    /**
     * Converts parsed layers into a 3D block map.
     */
    private buildBlockMap(): void {
        for (const layer of this.mapData.layers) {
            const y = layer.y;
            for (let z = 0; z < layer.grid.length; z++) {
                const row = layer.grid[z];
                for (let x = 0; x < row.length; x++) {
                    const char = row[x];
                    const blockType = this.resolveCharacter(char);

                    // If it's a spawn character, add as entity and treat as air
                    if (typeof blockType === 'string') {
                        // It's an entity type, add to entities if not already present
                        this.addEntityFromCharacter(blockType as EntityType, x, y, z);
                        continue; // Don't add a block for spawn points
                    }

                    if (blockType !== TextBlockType.AIR) {
                        this.setBlock(x, y, z, { x, y, z, type: blockType });
                    }
                }
            }
        }
    }

    /**
     * Resolves a character to a block type or entity type using the legend.
     */
    private resolveCharacter(char: string): TextBlockType | EntityType {
        // Check custom legend first
        if (this.mapData.legend.has(char)) {
            return this.mapData.legend.get(char)!;
        }
        // Fall back to default legend
        if (char in TextMap.DEFAULT_LEGEND) {
            return TextMap.DEFAULT_LEGEND[char];
        }
        // Unknown character treated as air
        return TextBlockType.AIR;
    }

    /**
     * Adds an entity from a character in the layer grid.
     */
    private addEntityFromCharacter(type: EntityType, x: number, y: number, z: number): void {
        // Check if entity already exists at this position from explicit @entity blocks
        const existingEntity = this.mapData.entities.find(
            e => e.position.x === x && e.position.y === y && e.position.z === z
        );

        if (!existingEntity) {
            this.mapData.entities.push({
                type,
                position: { x, y, z },
                team: type === 'enemy_spawn' ? 't' : 'ct',
            });
        }
    }

    private getKey(x: number, y: number, z: number): string {
        return `${x},${y},${z}`;
    }

    public getBlock(x: number, y: number, z: number): TextMapBlock | undefined {
        return this.blockMap.get(this.getKey(x, y, z));
    }

    public setBlock(x: number, y: number, z: number, block: TextMapBlock): void {
        this.blockMap.set(this.getKey(x, y, z), block);
    }

    public hasBlock(x: number, y: number, z: number): boolean {
        return this.blockMap.has(this.getKey(x, y, z));
    }

    /**
     * Convert grid coords to world position (center of block).
     */
    public getWorldPosition(x: number, y: number, z: number): THREE.Vector3 {
        return new THREE.Vector3(
            x * this.scale,
            y * this.scale + (this.scale / 2),
            z * this.scale
        );
    }

    /**
     * Convert world position to grid coords.
     */
    public getGridCoords(worldPos: THREE.Vector3): { x: number; y: number; z: number } {
        return {
            x: Math.round(worldPos.x / this.scale),
            y: Math.round((worldPos.y - (this.scale / 2)) / this.scale),
            z: Math.round(worldPos.z / this.scale),
        };
    }

    public getAllBlocks(): TextMapBlock[] {
        return Array.from(this.blockMap.values());
    }

    public getBrushes(): TextMapBrush[] {
        return this.mapData.brushes;
    }

    /**
     * Get spawn points with world positions.
     */
    public getSpawnPoints(): Array<{
        position: THREE.Vector3;
        type: EntityType;
        team?: Team;
        name?: string;
        ai?: AIBehavior;
    }> {
        return this.mapData.entities
            .filter(e => e.type.endsWith('_spawn'))
            .map(e => ({
                position: this.getWorldPosition(e.position.x, e.position.y, e.position.z),
                type: e.type,
                team: e.team,
                name: e.name,
                ai: e.ai,
            }));
    }

    public getEntities(): TextMapEntity[] {
        return this.mapData.entities;
    }

    public getName(): string {
        return this.mapData.name;
    }

    public getVersion(): string {
        return this.mapData.version;
    }
}
