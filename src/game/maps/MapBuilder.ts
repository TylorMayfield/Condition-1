import type { EntityType, Team } from './TextMap';

/**
 * Represents the editable state of a map layer.
 */
export type EditorLayer = {
    y: number;
    label: string;
    grid: string[][];  // 2D array of characters
};

/**
 * Represents a brush entity in the editor.
 */
export type EditorBrush = {
    name: string;
    type: 'box' | 'stairs' | 'ramp' | 'cylinder';
    position: { x: number; y: number; z: number };
    size?: { x: number; y: number; z: number };
    from?: { x: number; y: number; z: number };
    to?: { x: number; y: number; z: number };
    direction?: 'north' | 'south' | 'east' | 'west';
    material: string;
    destructible: boolean;
};

/**
 * Represents a spawn entity in the editor.
 */
export type EditorEntity = {
    type: EntityType;
    position: { x: number; y: number; z: number };
    team: Team;
    name?: string;
    ai?: string;
};

/**
 * The complete editable map state.
 */
export type EditorMapData = {
    name: string;
    version: string;
    scale: number;
    width: number;
    height: number;
    layers: EditorLayer[];
    brushes: EditorBrush[];
    entities: EditorEntity[];
};

/**
 * Block palette - available block types for painting.
 */
export const BLOCK_PALETTE: { char: string; name: string; color: string }[] = [
    { char: '.', name: 'Air', color: '#1a1a2e' },
    { char: '#', name: 'Concrete', color: '#888888' },
    { char: 'B', name: 'Brick', color: '#a05040' },
    { char: 'W', name: 'Wood', color: '#8b5a2b' },
    { char: 'G', name: 'Grass', color: '#44aa44' },
    { char: 'D', name: 'Dirt', color: '#6b4423' },
    { char: 'S', name: 'Stone', color: '#555555' },
    { char: 'M', name: 'Metal', color: '#aaaaaa' },
    { char: 'C', name: 'Crate', color: '#cda434' },
];

/**
 * Spawn palette - available spawn point types.
 */
export const SPAWN_PALETTE: { char: string; name: string; color: string; type: EntityType }[] = [
    { char: 'P', name: 'Player', color: '#00ff00', type: 'player_spawn' },
    { char: 'E', name: 'Enemy', color: '#ff0000', type: 'enemy_spawn' },
    { char: 'Q', name: 'Squad', color: '#0088ff', type: 'squad_spawn' },
];

/**
 * MapBuilder - Core logic for the map editor.
 * Manages map state, editing operations, and export.
 */
export class MapBuilder {
    private mapData: EditorMapData;
    private currentLayerIndex: number = 0;
    private currentTool: 'block' | 'spawn' | 'erase' | 'fill' = 'block';
    private currentBlockChar: string = '#';
    private currentSpawnType: EntityType = 'player_spawn';

    // Undo/Redo stacks
    private undoStack: string[] = [];
    private redoStack: string[] = [];
    private maxUndoSteps = 50;

    constructor(width: number = 20, height: number = 20) {
        this.mapData = this.createEmptyMap(width, height);
    }

    /**
     * Create an empty map with default settings.
     */
    private createEmptyMap(width: number, height: number): EditorMapData {
        const emptyRow = () => Array(width).fill('.');
        const emptyGrid = () => Array(height).fill(null).map(() => emptyRow());

        return {
            name: 'New Map',
            version: '1.0',
            scale: 2,
            width,
            height,
            layers: [
                { y: -1, label: 'Foundation', grid: emptyGrid() },
                { y: 0, label: 'Ground Floor', grid: emptyGrid() },
                { y: 1, label: 'First Floor', grid: emptyGrid() },
                { y: 2, label: 'Second Floor', grid: emptyGrid() },
            ],
            brushes: [],
            entities: [],
        };
    }

    /**
     * Save current state to undo stack.
     */
    private saveUndoState(): void {
        this.undoStack.push(JSON.stringify(this.mapData));
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    /**
     * Undo last action.
     */
    public undo(): boolean {
        const state = this.undoStack.pop();
        if (state) {
            this.redoStack.push(JSON.stringify(this.mapData));
            this.mapData = JSON.parse(state);
            return true;
        }
        return false;
    }

    /**
     * Redo last undone action.
     */
    public redo(): boolean {
        const state = this.redoStack.pop();
        if (state) {
            this.undoStack.push(JSON.stringify(this.mapData));
            this.mapData = JSON.parse(state);
            return true;
        }
        return false;
    }

    // ==================== Layer Management ====================

    public getCurrentLayer(): EditorLayer {
        return this.mapData.layers[this.currentLayerIndex];
    }

    public getCurrentLayerIndex(): number {
        return this.currentLayerIndex;
    }

    public setCurrentLayer(index: number): void {
        if (index >= 0 && index < this.mapData.layers.length) {
            this.currentLayerIndex = index;
        }
    }

    public getLayers(): EditorLayer[] {
        return this.mapData.layers;
    }

    public addLayer(y: number, label: string): void {
        this.saveUndoState();
        const emptyRow = () => Array(this.mapData.width).fill('.');
        const emptyGrid = () => Array(this.mapData.height).fill(null).map(() => emptyRow());
        this.mapData.layers.push({ y, label, grid: emptyGrid() });
        this.mapData.layers.sort((a, b) => a.y - b.y);
    }

    public removeLayer(index: number): void {
        if (this.mapData.layers.length > 1) {
            this.saveUndoState();
            this.mapData.layers.splice(index, 1);
            this.currentLayerIndex = Math.min(this.currentLayerIndex, this.mapData.layers.length - 1);
        }
    }

    // ==================== Block Editing ====================

    public setTool(tool: 'block' | 'spawn' | 'erase' | 'fill'): void {
        this.currentTool = tool;
    }

    public getTool(): string {
        return this.currentTool;
    }

    public setCurrentBlock(char: string): void {
        this.currentBlockChar = char;
    }

    public getCurrentBlock(): string {
        return this.currentBlockChar;
    }

    public setCurrentSpawn(type: EntityType): void {
        this.currentSpawnType = type;
    }

    public getCurrentSpawn(): EntityType {
        return this.currentSpawnType;
    }

    /**
     * Paint a cell at the given coordinates.
     */
    public paintCell(x: number, z: number): void {
        const layer = this.getCurrentLayer();
        if (x < 0 || x >= this.mapData.width || z < 0 || z >= this.mapData.height) return;

        this.saveUndoState();

        if (this.currentTool === 'erase') {
            layer.grid[z][x] = '.';
            // Also remove any entity at this position
            this.removeEntityAt(x, layer.y, z);
        } else if (this.currentTool === 'block') {
            layer.grid[z][x] = this.currentBlockChar;
        } else if (this.currentTool === 'spawn') {
            // Place spawn character in grid and add entity
            const spawnChar = SPAWN_PALETTE.find(s => s.type === this.currentSpawnType)?.char || 'P';
            layer.grid[z][x] = spawnChar;
            this.addEntity(this.currentSpawnType, x, layer.y, z);
        }
    }

    /**
     * Fill an area with the current block.
     */
    public fill(startX: number, startZ: number): void {
        const layer = this.getCurrentLayer();
        if (startX < 0 || startX >= this.mapData.width || startZ < 0 || startZ >= this.mapData.height) return;

        const targetChar = layer.grid[startZ][startX];
        if (targetChar === this.currentBlockChar) return;

        this.saveUndoState();
        this.floodFill(layer.grid, startX, startZ, targetChar, this.currentBlockChar);
    }

    private floodFill(grid: string[][], x: number, z: number, target: string, replacement: string): void {
        if (x < 0 || x >= this.mapData.width || z < 0 || z >= this.mapData.height) return;
        if (grid[z][x] !== target) return;

        grid[z][x] = replacement;
        this.floodFill(grid, x + 1, z, target, replacement);
        this.floodFill(grid, x - 1, z, target, replacement);
        this.floodFill(grid, x, z + 1, target, replacement);
        this.floodFill(grid, x, z - 1, target, replacement);
    }

    public getCell(x: number, z: number): string {
        const layer = this.getCurrentLayer();
        if (x < 0 || x >= this.mapData.width || z < 0 || z >= this.mapData.height) return '.';
        return layer.grid[z][x];
    }

    // ==================== Entity Management ====================

    private addEntity(type: EntityType, x: number, y: number, z: number): void {
        // Remove existing entity at this position
        this.removeEntityAt(x, y, z);

        const team: Team = type === 'enemy_spawn' ? 't' : 'ct';
        this.mapData.entities.push({
            type,
            position: { x, y, z },
            team,
        });
    }

    private removeEntityAt(x: number, y: number, z: number): void {
        this.mapData.entities = this.mapData.entities.filter(
            e => !(e.position.x === x && e.position.y === y && e.position.z === z)
        );
    }

    public getEntities(): EditorEntity[] {
        return this.mapData.entities;
    }

    // ==================== Map Properties ====================

    public getMapData(): EditorMapData {
        return this.mapData;
    }

    public setMapName(name: string): void {
        this.mapData.name = name;
    }

    public getMapName(): string {
        return this.mapData.name;
    }

    public setScale(scale: number): void {
        this.mapData.scale = scale;
    }

    public getWidth(): number {
        return this.mapData.width;
    }

    public getHeight(): number {
        return this.mapData.height;
    }

    /**
     * Resize the map (destructive operation).
     */
    public resize(newWidth: number, newHeight: number): void {
        this.saveUndoState();

        for (const layer of this.mapData.layers) {
            const newGrid: string[][] = [];
            for (let z = 0; z < newHeight; z++) {
                const row: string[] = [];
                for (let x = 0; x < newWidth; x++) {
                    row.push(z < layer.grid.length && x < layer.grid[z].length ? layer.grid[z][x] : '.');
                }
                newGrid.push(row);
            }
            layer.grid = newGrid;
        }

        this.mapData.width = newWidth;
        this.mapData.height = newHeight;
    }

    // ==================== Import/Export ====================

    /**
     * Export the map to TextMap format string.
     */
    public exportToTextMap(): string {
        const lines: string[] = [];

        // Header
        lines.push(`# ${this.mapData.name}`);
        lines.push(`# Generated by Map Builder`);
        lines.push('');
        lines.push(`@name ${this.mapData.name}`);
        lines.push(`@version ${this.mapData.version}`);
        lines.push(`@scale ${this.mapData.scale}`);
        lines.push('');

        // Legend
        lines.push('# ============================================');
        lines.push('# LEGEND');
        lines.push('# ============================================');
        lines.push('@legend');
        lines.push('. = air');
        lines.push('# = concrete');
        lines.push('B = brick');
        lines.push('W = wood_planks');
        lines.push('G = grass');
        lines.push('D = dirt');
        lines.push('S = stone');
        lines.push('M = metal');
        lines.push('C = crate');
        lines.push('P = player_spawn');
        lines.push('E = enemy_spawn');
        lines.push('Q = squad_spawn');
        lines.push('');

        // Layers
        lines.push('# ============================================');
        lines.push('# LAYERS');
        lines.push('# ============================================');
        lines.push('');

        for (const layer of this.mapData.layers) {
            lines.push(`@layer y=${layer.y} "${layer.label}"`);
            for (const row of layer.grid) {
                lines.push(row.join(''));
            }
            lines.push('');
        }

        // Entities (explicit spawn definitions)
        if (this.mapData.entities.length > 0) {
            lines.push('# ============================================');
            lines.push('# ENTITIES');
            lines.push('# ============================================');
            lines.push('');

            for (const entity of this.mapData.entities) {
                lines.push(`@entity ${entity.type}`);
                lines.push(`  position: ${entity.position.x},${entity.position.y},${entity.position.z}`);
                lines.push(`  team: ${entity.team}`);
                if (entity.name) {
                    lines.push(`  name: "${entity.name}"`);
                }
                if (entity.ai) {
                    lines.push(`  ai: ${entity.ai}`);
                }
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * Import a TextMap format string.
     */
    public importFromTextMap(content: string): void {
        // Use the TextMapParser and convert to EditorMapData
        // For now, simple import - just re-create layers from parsed data
        this.saveUndoState();

        // Parse layers from content
        const lines = content.split(/\r?\n/);
        const newLayers: EditorLayer[] = [];
        let currentLayer: EditorLayer | null = null;
        let maxWidth = 0;

        for (const line of lines) {
            const trimmed = line.trim();

            // Parse metadata
            if (trimmed.startsWith('@name ')) {
                this.mapData.name = trimmed.substring(6).trim();
            } else if (trimmed.startsWith('@scale ')) {
                this.mapData.scale = parseFloat(trimmed.substring(7)) || 2;
            } else if (trimmed.startsWith('@layer ')) {
                // Save previous layer
                if (currentLayer) {
                    newLayers.push(currentLayer);
                }
                // Parse layer header
                const yMatch = trimmed.match(/y=(-?\d+)/);
                const labelMatch = trimmed.match(/"([^"]+)"/);
                currentLayer = {
                    y: yMatch ? parseInt(yMatch[1], 10) : 0,
                    label: labelMatch ? labelMatch[1] : `Layer ${newLayers.length}`,
                    grid: [],
                };
            } else if (currentLayer && trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('#')) {
                // This is a grid row
                const row = trimmed.split('');
                currentLayer.grid.push(row);
                maxWidth = Math.max(maxWidth, row.length);
            }
        }

        // Save last layer
        if (currentLayer) {
            newLayers.push(currentLayer);
        }

        if (newLayers.length > 0) {
            this.mapData.layers = newLayers;
            this.mapData.width = maxWidth;
            this.mapData.height = Math.max(...newLayers.map(l => l.grid.length));
            this.currentLayerIndex = 0;
        }
    }

    /**
     * Clear the current layer.
     */
    public clearCurrentLayer(): void {
        this.saveUndoState();
        const layer = this.getCurrentLayer();
        for (let z = 0; z < layer.grid.length; z++) {
            for (let x = 0; x < layer.grid[z].length; x++) {
                layer.grid[z][x] = '.';
            }
        }
    }

    /**
     * Clear entire map.
     */
    public clearAll(): void {
        this.mapData = this.createEmptyMap(this.mapData.width, this.mapData.height);
        this.undoStack = [];
        this.redoStack = [];
    }
}
