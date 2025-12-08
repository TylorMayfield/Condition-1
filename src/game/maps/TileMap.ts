import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { DestructibleWall } from '../components/DestructibleWall';

export enum TileType {
    EMPTY = 0,
    FLOOR = 1,
    WALL = 2,
    DOOR = 3,
    WINDOW = 4,
    INDOOR_FLOOR = 5,
    INDOOR_WALL = 6,
    STAIRS_UP = 7,
    STAIRS_DOWN = 8,
    RAMP_UP = 9,
    RAMP_DOWN = 10,
    BUILDING = 11,
    COVER = 12
}

export type TileData = {
    type: TileType;
    height: number; // Height offset for this tile (0 = ground level)
    indoor: boolean; // Is this tile indoors?
    hasRoof: boolean; // Does this tile have a roof above it?
    doorDirection?: 'north' | 'south' | 'east' | 'west'; // For door tiles
    windowDirection?: 'north' | 'south' | 'east' | 'west'; // For window tiles
};

export type TileMapDefinition = {
    name: string;
    version: string;
    tileSize: number; // Size of each tile in world units (default: 2)
    tiles: number[][]; // 2D array of tile types
    heights: number[][]; // 2D array of height offsets
    indoor: boolean[][]; // 2D array indicating indoor tiles
    roofs: boolean[][]; // 2D array indicating roof tiles
    doors?: Array<{
        x: number;
        y: number;
        direction: 'north' | 'south' | 'east' | 'west';
    }>;
    windows?: Array<{
        x: number;
        y: number;
        direction: 'north' | 'south' | 'east' | 'west';
    }>;
    spawnPoints?: Array<{
        x: number;
        y: number;
        team?: 'ct' | 't' | 'neutral';
        type?: 'player' | 'enemy' | 'squad';
    }>;
    materials?: {
        floor?: number;
        wall?: number;
        indoorFloor?: number;
        indoorWall?: number;
        roof?: number;
    };
}

export class TileMap {
    private game: Game;
    private mapData: TileMapDefinition;
    private tileSize: number;
    private width: number;
    private height: number;

    constructor(game: Game, mapData: TileMapDefinition) {
        this.game = game;
        this.mapData = mapData;
        this.tileSize = mapData.tileSize || 2;
        this.height = mapData.tiles.length;
        this.width = mapData.tiles[0]?.length || 0;
    }

    public getTileData(x: number, y: number): TileData | null {
        if (y < 0 || y >= this.height || x < 0 || x >= this.width) {
            return null;
        }

        const type = this.mapData.tiles[y][x];
        const height = this.mapData.heights?.[y]?.[x] || 0;
        const indoor = this.mapData.indoor?.[y]?.[x] || false;
        const hasRoof = this.mapData.roofs?.[y]?.[x] || false;

        // Check for door/window at this position
        let doorDirection: 'north' | 'south' | 'east' | 'west' | undefined;
        let windowDirection: 'north' | 'south' | 'east' | 'west' | undefined;

        if (this.mapData.doors) {
            const door = this.mapData.doors.find(d => d.x === x && d.y === y);
            if (door) doorDirection = door.direction;
        }

        if (this.mapData.windows) {
            const window = this.mapData.windows.find(w => w.x === x && w.y === y);
            if (window) windowDirection = window.direction;
        }

        return {
            type,
            height,
            indoor,
            hasRoof,
            doorDirection,
            windowDirection
        };
    }

    public getWorldPosition(tileX: number, tileY: number, includeBodyOffset: boolean = false): THREE.Vector3 {
        const centerX = (tileX - this.width / 2) * this.tileSize;
        const centerZ = (tileY - this.height / 2) * this.tileSize;
        const tileData = this.getTileData(tileX, tileY);
        const floorHeight = (tileData?.height || 0) * this.tileSize;
        // For player/enemy spawns, add body center offset (0.8m for human-sized entities)
        const y = includeBodyOffset ? floorHeight + 0.8 : floorHeight;
        return new THREE.Vector3(centerX, y, centerZ);
    }

    public getTileCoords(worldPos: THREE.Vector3): { x: number; y: number } {
        const x = Math.floor((worldPos.x / this.tileSize) + this.width / 2);
        const y = Math.floor((worldPos.z / this.tileSize) + this.height / 2);
        return { x, y };
    }

    public getWidth(): number {
        return this.width;
    }

    public getHeight(): number {
        return this.height;
    }

    public getTileSize(): number {
        return this.tileSize;
    }

    public getSpawnPoints(): Array<{ position: THREE.Vector3; team?: string; type?: string }> {
        if (!this.mapData.spawnPoints) return [];

        return this.mapData.spawnPoints.map(spawn => {
            // Validate spawn point is on a valid floor tile
            const tileData = this.getTileData(spawn.x, spawn.y);
            if (!tileData || tileData.type === TileType.EMPTY || tileData.type === TileType.WALL) {
                console.warn(`Invalid spawn point at (${spawn.x}, ${spawn.y}): tile type ${tileData?.type || 'out of bounds'}`);
                // Find nearest valid floor tile
                const validPos = this.findNearestValidSpawn(spawn.x, spawn.y);
                return {
                    position: this.getWorldPosition(validPos.x, validPos.y, true),
                    team: spawn.team,
                    type: spawn.type
                };
            }
            
            return {
                position: this.getWorldPosition(spawn.x, spawn.y, true),
                team: spawn.team,
                type: spawn.type
            };
        });
    }

    private findNearestValidSpawn(startX: number, startY: number): { x: number; y: number } {
        // Search in expanding radius for a valid floor tile
        for (let radius = 1; radius < Math.max(this.width, this.height); radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // Only check perimeter
                    
                    const x = startX + dx;
                    const y = startY + dy;
                    const tileData = this.getTileData(x, y);
                    
                    if (tileData && tileData.type !== TileType.EMPTY && tileData.type !== TileType.WALL) {
                        return { x, y };
                    }
                }
            }
        }
        // Fallback to center of map
        return { x: Math.floor(this.width / 2), y: Math.floor(this.height / 2) };
    }
}

