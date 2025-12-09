import type {
    TextMapDefinition,
    TextMapLayer,
    TextMapBrush,
    TextMapEntity,
    EntityType,
    Team,
    AIBehavior,
    BrushType,
} from './TextMap';
import { TextBlockType } from './TextMap';

/**
 * Parser for .textmap files.
 * Converts text-based map definitions into TextMapDefinition objects.
 */
export class TextMapParser {
    /**
     * Parse a .textmap file content string into a TextMapDefinition.
     */
    public static parse(content: string): TextMapDefinition {
        const lines = content.split(/\r?\n/);

        const result: TextMapDefinition = {
            name: 'Untitled Map',
            version: '1.0',
            scale: 2,
            legend: new Map(),
            layers: [],
            brushes: [],
            entities: [],
        };

        let currentSection: 'none' | 'legend' | 'layer' | 'brush' | 'entity' = 'none';
        let currentLayer: TextMapLayer | null = null;
        let currentBrush: Partial<TextMapBrush> = {};
        let currentEntity: Partial<TextMapEntity> = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines and comments (unless in a layer grid)
            if (currentSection !== 'layer') {
                if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#')) {
                    continue;
                }
            }

            // Handle metadata directives
            if (trimmed.startsWith('@')) {
                // Save any pending layer/brush/entity
                this.finishCurrentSection(currentSection, currentLayer, currentBrush, currentEntity, result);
                currentLayer = null;
                currentBrush = {};
                currentEntity = {};

                const directive = this.parseDirective(trimmed);

                switch (directive.name) {
                    case 'name':
                        result.name = directive.value;
                        currentSection = 'none';
                        break;
                    case 'version':
                        result.version = directive.value;
                        currentSection = 'none';
                        break;
                    case 'scale':
                        result.scale = parseFloat(directive.value) || 2;
                        currentSection = 'none';
                        break;
                    case 'legend':
                        currentSection = 'legend';
                        break;
                    case 'layer':
                        currentSection = 'layer';
                        currentLayer = this.parseLayerHeader(directive.value);
                        break;
                    case 'brush':
                        currentSection = 'brush';
                        currentBrush = { name: directive.value.replace(/"/g, '') };
                        break;
                    case 'entity':
                        currentSection = 'entity';
                        currentEntity = { type: directive.value as EntityType };
                        break;
                    default:
                        console.warn(`Unknown directive: @${directive.name}`);
                        currentSection = 'none';
                }
                continue;
            }

            // Handle section content
            switch (currentSection) {
                case 'legend':
                    this.parseLegendLine(trimmed, result.legend);
                    break;
                case 'layer':
                    if (currentLayer && trimmed !== '') {
                        // Remove inline comments
                        const gridLine = trimmed.split('//')[0].trimEnd();
                        if (gridLine) {
                            currentLayer.grid.push(gridLine);
                        }
                    }
                    break;
                case 'brush':
                    this.parseBrushProperty(trimmed, currentBrush);
                    break;
                case 'entity':
                    this.parseEntityProperty(trimmed, currentEntity);
                    break;
            }
        }

        // Finish any pending section at end of file
        this.finishCurrentSection(currentSection, currentLayer, currentBrush, currentEntity, result);

        return result;
    }

    /**
     * Parse a directive line like "@name Tower Map" into { name: 'name', value: 'Tower Map' }
     */
    private static parseDirective(line: string): { name: string; value: string } {
        const match = line.match(/^@(\w+)\s*(.*)?$/);
        if (!match) {
            return { name: '', value: '' };
        }
        return { name: match[1], value: (match[2] || '').trim() };
    }

    /**
     * Parse a layer header like 'y=0 "Ground Floor"'
     */
    private static parseLayerHeader(value: string): TextMapLayer {
        const yMatch = value.match(/y=(-?\d+)/);
        const labelMatch = value.match(/"([^"]+)"/);

        return {
            y: yMatch ? parseInt(yMatch[1], 10) : 0,
            label: labelMatch ? labelMatch[1] : undefined,
            grid: [],
        };
    }

    /**
     * Parse a legend line like ". = air" or "# = concrete"
     */
    private static parseLegendLine(line: string, legend: Map<string, TextBlockType | EntityType>): void {
        const match = line.match(/^(.)\s*=\s*(\w+)$/);
        if (!match) return;

        const char = match[1];
        const typeName = match[2].toLowerCase();

        const blockType = this.resolveTypeName(typeName);
        if (blockType !== null) {
            legend.set(char, blockType);
        }
    }

    /**
     * Resolve a type name string to a BlockType or EntityType.
     */
    private static resolveTypeName(name: string): TextBlockType | EntityType | null {
        const blockTypeMap: Record<string, TextBlockType> = {
            'air': TextBlockType.AIR,
            'concrete': TextBlockType.CONCRETE,
            'brick': TextBlockType.BRICK,
            'wood': TextBlockType.WOOD_PLANKS,
            'wood_planks': TextBlockType.WOOD_PLANKS,
            'grass': TextBlockType.GRASS,
            'dirt': TextBlockType.DIRT,
            'stone': TextBlockType.STONE,
            'metal': TextBlockType.METAL,
            'crate': TextBlockType.CRATE,
        };

        const entityTypeMap: Record<string, EntityType> = {
            'player_spawn': 'player_spawn',
            'enemy_spawn': 'enemy_spawn',
            'squad_spawn': 'squad_spawn',
            'pickup': 'pickup',
            'objective': 'objective',
        };

        if (name in blockTypeMap) {
            return blockTypeMap[name];
        }
        if (name in entityTypeMap) {
            return entityTypeMap[name];
        }
        return null;
    }

    /**
     * Parse a brush property line like "type: stairs" or "position: 5,0,5"
     */
    private static parseBrushProperty(line: string, brush: Partial<TextMapBrush>): void {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (!match) return;

        const key = match[1].toLowerCase();
        const value = match[2].trim();

        switch (key) {
            case 'type':
                brush.type = value as BrushType;
                break;
            case 'position':
                brush.position = this.parseVector3(value);
                break;
            case 'from':
                brush.from = this.parseVector3(value);
                break;
            case 'to':
                brush.to = this.parseVector3(value);
                break;
            case 'size':
                brush.size = this.parseVector3(value);
                break;
            case 'direction':
                brush.direction = value as 'north' | 'south' | 'east' | 'west';
                break;
            case 'material':
                brush.material = value;
                break;
            case 'destructible':
                brush.destructible = value === 'true';
                break;
            case 'color':
                brush.color = parseInt(value, 16) || parseInt(value, 10);
                break;
        }
    }

    /**
     * Parse an entity property line like "position: 3,0,2" or "team: ct"
     */
    private static parseEntityProperty(line: string, entity: Partial<TextMapEntity>): void {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (!match) return;

        const key = match[1].toLowerCase();
        const value = match[2].trim().replace(/"/g, '');

        switch (key) {
            case 'position':
                entity.position = this.parseVector3(value);
                break;
            case 'team':
                entity.team = value as Team;
                break;
            case 'name':
                entity.name = value;
                break;
            case 'ai':
                entity.ai = value as AIBehavior;
                break;
            default:
                // Store unknown properties in properties map
                if (!entity.properties) {
                    entity.properties = {};
                }
                entity.properties[key] = value;
                break;
        }
    }

    /**
     * Parse a vector3 string like "5,0,5" or "5, 0, 5"
     */
    private static parseVector3(value: string): { x: number; y: number; z: number } {
        const parts = value.split(',').map(s => parseFloat(s.trim()));
        return {
            x: parts[0] || 0,
            y: parts[1] || 0,
            z: parts[2] || 0,
        };
    }

    /**
     * Finish the current section and add it to the result.
     */
    private static finishCurrentSection(
        section: string,
        layer: TextMapLayer | null,
        brush: Partial<TextMapBrush>,
        entity: Partial<TextMapEntity>,
        result: TextMapDefinition
    ): void {
        switch (section) {
            case 'layer':
                if (layer && layer.grid.length > 0) {
                    result.layers.push(layer);
                }
                break;
            case 'brush':
                if (brush.type) {
                    result.brushes.push(brush as TextMapBrush);
                }
                break;
            case 'entity':
                if (entity.type && entity.position) {
                    result.entities.push(entity as TextMapEntity);
                }
                break;
        }
    }
}
