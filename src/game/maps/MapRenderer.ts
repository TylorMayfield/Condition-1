import { Game } from '../../engine/Game';
import { TileMap, TileType } from './TileMap';
import type { TileData } from './TileMap';
import { MapMaterials } from './renderers/MapMaterials';
import { FloorRenderer } from './renderers/FloorRenderer';
import { RampRenderer } from './renderers/RampRenderer';
import { StairRenderer } from './renderers/StairRenderer';
import { WallRenderer } from './renderers/WallRenderer';
import { DoorWindowRenderer } from './renderers/DoorWindowRenderer';
import { CoverRenderer } from './renderers/CoverRenderer';
import { RoofRenderer } from './renderers/RoofRenderer';

export class MapRenderer {
    private materials: MapMaterials;
    private floorRenderer: FloorRenderer;
    private rampRenderer: RampRenderer;
    private stairRenderer: StairRenderer;
    private wallRenderer: WallRenderer;
    private doorWindowRenderer: DoorWindowRenderer;
    private coverRenderer: CoverRenderer;
    private roofRenderer: RoofRenderer;

    constructor(game: Game, private tileMap: TileMap) {
        this.materials = new MapMaterials(tileMap);
        this.floorRenderer = new FloorRenderer(game, this.materials);
        this.rampRenderer = new RampRenderer(game, tileMap, this.materials);
        this.stairRenderer = new StairRenderer(game, tileMap, this.materials);
        this.wallRenderer = new WallRenderer(game, tileMap, this.materials);
        this.doorWindowRenderer = new DoorWindowRenderer(game, tileMap, this.materials);
        this.coverRenderer = new CoverRenderer(game, this.materials);
        this.roofRenderer = new RoofRenderer(game, tileMap, this.materials);
    }

    public render(): void {
        const width = this.tileMap.getWidth();
        const height = this.tileMap.getHeight();

        // 1. Render Tiles (Floors, Ramps, Objects)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const tileData = this.tileMap.getTileData(x, y);
                if (!tileData) continue;
                this.renderTile(x, y, tileData);
            }
        }

        // 2. Render Walls (with deduplication)
        this.wallRenderer.renderWalls();

        // 3. Render Roofs
        this.roofRenderer.renderRoofs();
    }

    private renderTile(x: number, y: number, tileData: TileData): void {
        const worldPos = this.tileMap.getWorldPosition(x, y);
        const tileSize = this.tileMap.getTileSize();

        // Always render a base floor for walkable tiles to prevent "holes"
        // For ramps/stairs, this acts as the foundation.
        if (tileData.type !== TileType.EMPTY && tileData.type !== TileType.WALL) {
            this.floorRenderer.createFloorTile(worldPos, tileSize, tileData);
        }

        switch (tileData.type) {
            case TileType.STAIRS_UP:
            case TileType.STAIRS_DOWN:
                this.stairRenderer.createStairs(x, y, tileData);
                break;

            case TileType.RAMP_UP:
            case TileType.RAMP_DOWN:
                this.rampRenderer.createRamp(x, y, tileData);
                break;

            case TileType.DOOR:
                this.doorWindowRenderer.createDoor(x, y, tileData);
                break;

            case TileType.WINDOW:
                this.doorWindowRenderer.createWindow(x, y, tileData);
                break;

            case TileType.COVER:
                this.coverRenderer.createCover(worldPos, tileSize, tileData);
                break;
        }
    }
}
