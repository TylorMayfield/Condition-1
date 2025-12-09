import * as THREE from 'three';
import { Game } from '../../engine/Game';

/**
 * Brush types determine how a brush is used in the map.
 */
export type BrushType = 'solid' | 'detail' | 'trigger' | 'clip';

/**
 * Material types for visual appearance.
 */
export const BrushMaterial = {
    CONCRETE: 'concrete',
    BRICK: 'brick',
    WOOD: 'wood',
    METAL: 'metal',
    GRASS: 'grass',
    DIRT: 'dirt',
    STONE: 'stone',
    CRATE: 'crate',
    GLASS: 'glass',
} as const;

export type BrushMaterialType = typeof BrushMaterial[keyof typeof BrushMaterial];

/**
 * Surface properties for material blending and bumpmaps.
 */
export interface BrushSurface {
    roughness: number;          // 0-1 for bumpmap intensity
    metalness?: number;         // 0-1 for metallic look
    blend?: BrushMaterialType;  // Material to blend with at edges
    blendWidth?: number;        // Blend transition width in units
    normalScale?: number;       // Normal map intensity
    transparent?: boolean;      // Enable transparency for this surface
    opacity?: number;           // 0-1 opacity level (1 = fully opaque, 0 = fully transparent)
}

/**
 * A brush is a 3D volume (box) that forms the building blocks of a map.
 */
export interface Brush {
    id: string;                 // Unique identifier
    type: BrushType;            // solid, detail, trigger, clip
    material: BrushMaterialType;

    // Position (corner origin)
    x: number;
    y: number;
    z: number;

    // Dimensions
    width: number;              // X size
    height: number;             // Y size
    depth: number;              // Z size

    // Optional properties
    surface?: BrushSurface;
    destructible?: boolean;
    color?: number;             // Override color
    name?: string;              // Human-readable name
}

/**
 * Entity types for spawns and interactive objects.
 */
export type EntityType = 'player_spawn' | 'enemy_spawn' | 'squad_spawn' | 'pickup' | 'objective';

/**
 * Team affiliations.
 */
export type Team = 'ct' | 't' | 'neutral';

/**
 * AI behavior patterns.
 */
export type AIBehavior = 'patrol' | 'guard' | 'aggressive' | 'passive';

/**
 * An entity in the map (spawn point, pickup, objective).
 */
export interface BrushMapEntity {
    type: EntityType;
    position: { x: number; y: number; z: number };
    team?: Team;
    name?: string;
    ai?: AIBehavior;
    properties?: Record<string, string | number | boolean>;
}

/**
 * Complete brush map definition.
 */
export interface BrushMapDefinition {
    name: string;
    version: string;
    scale: number;
    brushes: Brush[];
    entities: BrushMapEntity[];
}

/**
 * BrushMap class - holds parsed map data and provides utility methods.
 */
export class BrushMap {
    private game: Game;
    private mapData: BrushMapDefinition;
    public scale: number;

    // Spatial index for fast brush lookups
    private brushIndex: Map<string, Brush[]> = new Map();

    constructor(game: Game, mapData: BrushMapDefinition) {
        this.game = game;
        this.mapData = mapData;
        this.scale = mapData.scale || 2;

        this.buildSpatialIndex();
    }

    /**
     * Build spatial index for fast queries.
     * Uses a grid-based hash where each cell contains overlapping brushes.
     */
    private buildSpatialIndex(): void {
        const cellSize = this.scale * 4; // 4 blocks per cell

        for (const brush of this.mapData.brushes) {
            // Calculate all cells this brush overlaps
            const minCellX = Math.floor(brush.x / cellSize);
            const maxCellX = Math.floor((brush.x + brush.width) / cellSize);
            const minCellY = Math.floor(brush.y / cellSize);
            const maxCellY = Math.floor((brush.y + brush.height) / cellSize);
            const minCellZ = Math.floor(brush.z / cellSize);
            const maxCellZ = Math.floor((brush.z + brush.depth) / cellSize);

            for (let cx = minCellX; cx <= maxCellX; cx++) {
                for (let cy = minCellY; cy <= maxCellY; cy++) {
                    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
                        const key = `${cx},${cy},${cz}`;
                        if (!this.brushIndex.has(key)) {
                            this.brushIndex.set(key, []);
                        }
                        this.brushIndex.get(key)!.push(brush);
                    }
                }
            }
        }
    }

    /**
     * Get all brushes.
     */
    public getBrushes(): Brush[] {
        return this.mapData.brushes;
    }

    /**
     * Get brushes at a specific point.
     */
    public getBrushesAt(x: number, y: number, z: number): Brush[] {
        const cellSize = this.scale * 4;
        const cellKey = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;

        const candidates = this.brushIndex.get(cellKey) || [];

        return candidates.filter(brush =>
            x >= brush.x && x < brush.x + brush.width &&
            y >= brush.y && y < brush.y + brush.height &&
            z >= brush.z && z < brush.z + brush.depth
        );
    }

    /**
     * Check if a point is inside any solid brush.
     */
    public isSolid(x: number, y: number, z: number): boolean {
        const brushes = this.getBrushesAt(x, y, z);
        return brushes.some(b => b.type === 'solid' || b.type === 'detail');
    }

    /**
     * Get brush by ID.
     */
    public getBrushById(id: string): Brush | undefined {
        return this.mapData.brushes.find(b => b.id === id);
    }

    /**
     * Get world position for a point (applies scale).
     */
    public getWorldPosition(x: number, y: number, z: number): THREE.Vector3 {
        return new THREE.Vector3(
            x * this.scale,
            y * this.scale,
            z * this.scale
        );
    }

    /**
     * Get all entities.
     */
    public getEntities(): BrushMapEntity[] {
        return this.mapData.entities;
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

    /**
     * Get map bounds.
     */
    public getBounds(): { min: THREE.Vector3; max: THREE.Vector3 } {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const brush of this.mapData.brushes) {
            minX = Math.min(minX, brush.x);
            minY = Math.min(minY, brush.y);
            minZ = Math.min(minZ, brush.z);
            maxX = Math.max(maxX, brush.x + brush.width);
            maxY = Math.max(maxY, brush.y + brush.height);
            maxZ = Math.max(maxZ, brush.z + brush.depth);
        }

        return {
            min: new THREE.Vector3(minX, minY, minZ),
            max: new THREE.Vector3(maxX, maxY, maxZ),
        };
    }

    public getName(): string {
        return this.mapData.name;
    }

    public getVersion(): string {
        return this.mapData.version;
    }
}
