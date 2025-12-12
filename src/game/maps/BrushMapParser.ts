import type {
    BrushMapDefinition,
    Brush,
    BrushType,
    BrushMaterialType,

    BrushMapEntity,
    EntityType,
    Team,
    AIBehavior,
} from './BrushMap';


/**
 * Parser for .brushmap files.
 * Converts text-based brush definitions into BrushMapDefinition objects.
 */
export class BrushMapParser {
    private static brushCounter = 0;

    /**
     * Parse a .brushmap file content string into a BrushMapDefinition.
     */
    public static parse(content: string): BrushMapDefinition {
        this.brushCounter = 0;
        const lines = content.split(/\r?\n/);

        const result: BrushMapDefinition = {
            name: 'Untitled Map',
            version: '1.0',
            scale: 2,
            brushes: [],
            entities: [],
        };

        let currentSection: 'none' | 'brush' | 'entity' = 'none';
        let currentBrush: Partial<Brush> = {};
        let currentEntity: Partial<BrushMapEntity> = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#')) {
                continue;
            }

            // Handle directives
            if (trimmed.startsWith('@')) {
                // Save any pending brush/entity
                this.finishCurrentSection(currentSection, currentBrush, currentEntity, result);
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
                    case 'brush':
                        currentSection = 'brush';
                        const brushId = directive.value.replace(/"/g, '').trim() || `brush_${++this.brushCounter}`;
                        currentBrush = { id: brushId };
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
                case 'brush':
                    this.parseBrushProperty(trimmed, currentBrush);
                    break;
                case 'entity':
                    this.parseEntityProperty(trimmed, currentEntity);
                    break;
            }
        }

        // Finish any pending section
        this.finishCurrentSection(currentSection, currentBrush, currentEntity, result);

        return result;
    }

    /**
     * Parse a directive line like "@name Kill House"
     */
    private static parseDirective(line: string): { name: string; value: string } {
        const match = line.match(/^@(\w+)\s*(.*)?$/);
        if (!match) {
            return { name: '', value: '' };
        }
        return { name: match[1], value: (match[2] || '').trim() };
    }

    /**
     * Parse a brush property line.
     */
    private static parseBrushProperty(line: string, brush: Partial<Brush>): void {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (!match) return;

        const key = match[1].toLowerCase();
        const value = match[2].trim();

        switch (key) {
            case 'type':
                brush.type = value as BrushType;
                break;
            case 'material':
                brush.material = value.toLowerCase() as BrushMaterialType;
                break;
            case 'position':
            case 'pos':
                const pos = this.parseVector3(value);
                brush.x = pos.x;
                brush.y = pos.y;
                brush.z = pos.z;
                break;
            case 'size':
                const size = this.parseVector3(value);
                brush.width = size.x;
                brush.height = size.y;
                brush.depth = size.z;
                break;
            case 'width':
                brush.width = parseFloat(value);
                break;
            case 'height':
                brush.height = parseFloat(value);
                break;
            case 'depth':
                brush.depth = parseFloat(value);
                break;
            case 'x':
                brush.x = parseFloat(value);
                break;
            case 'y':
                brush.y = parseFloat(value);
                break;
            case 'z':
                brush.z = parseFloat(value);
                break;
            case 'destructible':
                brush.destructible = value.toLowerCase() === 'true';
                break;
            case 'color':
                brush.color = value.startsWith('0x') ? parseInt(value, 16) : parseInt(value, 10);
                break;
            case 'name':
                brush.name = value.replace(/"/g, '');
                break;
            case 'roughness':
                if (!brush.surface) brush.surface = { roughness: 0.5 };
                brush.surface.roughness = parseFloat(value);
                break;
            case 'metalness':
                if (!brush.surface) brush.surface = { roughness: 0.5 };
                brush.surface.metalness = parseFloat(value);
                break;
            case 'blend':
                if (!brush.surface) brush.surface = { roughness: 0.5 };
                brush.surface.blend = value as BrushMaterialType;
                break;
            case 'blendwidth':
            case 'blend_width':
                if (!brush.surface) brush.surface = { roughness: 0.5 };
                brush.surface.blendWidth = parseFloat(value);
                break;
        }
    }

    /**
     * Parse an entity property line.
     */
    private static parseEntityProperty(line: string, entity: Partial<BrushMapEntity>): void {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (!match) return;

        const key = match[1].toLowerCase();
        const value = match[2].trim().replace(/"/g, '');

        switch (key) {
            case 'position':
            case 'pos':
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
                // Store unknown properties
                if (!entity.properties) {
                    entity.properties = {};
                }
                entity.properties[key] = value;
                break;
        }
    }

    /**
     * Parse a vector3 string like "5, 0, 5" or "5,0,5"
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
     * Finish the current section.
     */
    private static finishCurrentSection(
        section: string,
        brush: Partial<Brush>,
        entity: Partial<BrushMapEntity>,
        result: BrushMapDefinition
    ): void {
        switch (section) {
            case 'brush':
                if (this.isValidBrush(brush)) {
                    result.brushes.push(brush as Brush);
                }
                break;
            case 'entity':
                if (entity.type && entity.position) {
                    result.entities.push(entity as BrushMapEntity);
                }
                break;
        }
    }

    /**
     * Check if a brush has all required properties.
     */
    private static isValidBrush(brush: Partial<Brush>): brush is Brush {
        return (
            brush.id !== undefined &&
            brush.type !== undefined &&
            brush.material !== undefined &&
            brush.x !== undefined &&
            brush.y !== undefined &&
            brush.z !== undefined &&
            brush.width !== undefined &&
            brush.height !== undefined &&
            brush.depth !== undefined
        );
    }

    /**
     * Serialize a BrushMapDefinition back to .brushmap format.
     */
    public static serialize(map: BrushMapDefinition): string {
        const lines: string[] = [];

        lines.push(`@name ${map.name}`);
        lines.push(`@version ${map.version}`);
        lines.push(`@scale ${map.scale}`);
        lines.push('');

        for (const brush of map.brushes) {
            lines.push(`@brush ${brush.id}`);
            lines.push(`type: ${brush.type}`);
            lines.push(`material: ${brush.material}`);
            lines.push(`position: ${brush.x}, ${brush.y}, ${brush.z}`);
            lines.push(`size: ${brush.width}, ${brush.height}, ${brush.depth}`);

            if (brush.destructible) {
                lines.push('destructible: true');
            }
            if (brush.color !== undefined) {
                lines.push(`color: 0x${brush.color.toString(16)}`);
            }
            if (brush.surface) {
                lines.push(`roughness: ${brush.surface.roughness}`);
                if (brush.surface.metalness !== undefined) {
                    lines.push(`metalness: ${brush.surface.metalness}`);
                }
                if (brush.surface.blend) {
                    lines.push(`blend: ${brush.surface.blend}`);
                }
                if (brush.surface.blendWidth !== undefined) {
                    lines.push(`blendWidth: ${brush.surface.blendWidth}`);
                }
            }
            lines.push('');
        }

        for (const entity of map.entities) {
            lines.push(`@entity ${entity.type}`);
            lines.push(`position: ${entity.position.x}, ${entity.position.y}, ${entity.position.z}`);
            if (entity.team) {
                lines.push(`team: ${entity.team}`);
            }
            if (entity.name) {
                lines.push(`name: "${entity.name}"`);
            }
            if (entity.ai) {
                lines.push(`ai: ${entity.ai}`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }
}
