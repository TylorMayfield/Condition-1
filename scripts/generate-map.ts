import * as fs from 'fs';
import * as path from 'path';

// --- VMF Configuration ---
const MAP_SIZE = 2048;
const WALL_HEIGHT = 256;
const TEXTURE_FLOOR = 'DE_DUST/DUSANDCRETE';
const TEXTURE_WALL = 'DE_DUST/STONEWALL02C';
const TEXTURE_SKY = 'TOOLS/TOOLSSKYBOX';
const OUTPUT_FILE = path.join(process.cwd(), 'src/game/maps/generated_test.vmf');

// --- Helper Types ---
interface Vector3 { x: number; y: number; z: number; }
interface Plane { p1: Vector3; p2: Vector3; p3: Vector3; }
interface Solid { id: number; sides: Side[]; }
interface Side { id: number; plane: Plane; material: string; uaxis: string; vaxis: string; }
interface Entity { id: number; classname: string; origin: Vector3; properties?: Record<string, string>; }

// --- Global ID Counter ---
let _id = 1;
function nextId() { return _id++; }

// --- VMF Builder Class ---
class VmfBuilder {
    private solids: Solid[] = [];
    private entities: Entity[] = [];

    addBlock(min: Vector3, max: Vector3, material: string) {
        const id = nextId();
        const sides: Side[] = [];

        // Define the 6 planes of a box (facing OUTWARDS)
        // Z+ (Top)
        sides.push(this.createSide(
            { x: min.x, y: max.y, z: max.z },
            { x: max.x, y: max.y, z: max.z },
            { x: max.x, y: min.y, z: max.z },
            material
        ));
        // Z- (Bottom)
        sides.push(this.createSide(
            { x: min.x, y: min.y, z: min.z },
            { x: max.x, y: min.y, z: min.z },
            { x: min.x, y: max.y, z: min.z },
            material
        ));
        // Y+ (North)
        sides.push(this.createSide(
            { x: min.x, y: max.y, z: min.z },
            { x: max.x, y: max.y, z: min.z },
            { x: max.x, y: max.y, z: max.z },
            material
        ));
        // Y- (South)
        sides.push(this.createSide(
            { x: max.x, y: min.y, z: min.z },
            { x: min.x, y: min.y, z: min.z },
            { x: min.x, y: min.y, z: max.z },
            material
        ));
        // X+ (East)
        sides.push(this.createSide(
            { x: max.x, y: max.y, z: min.z },
            { x: max.x, y: min.y, z: min.z },
            { x: max.x, y: min.y, z: max.z },
            material
        ));
        // X- (West)
        sides.push(this.createSide(
            { x: min.x, y: min.y, z: min.z },
            { x: min.x, y: max.y, z: min.z },
            { x: min.x, y: max.y, z: max.z },
            material
        ));

        this.solids.push({ id, sides });
    }

    addEntity(classname: string, origin: Vector3, props: Record<string, string> = {}) {
        this.entities.push({ id: nextId(), classname, origin, properties: props });
    }

    private createSide(p1: Vector3, p2: Vector3, p3: Vector3, material: string): Side {
        return {
            id: nextId(),
            plane: { p1, p2, p3 },
            material,
            uaxis: '[1 0 0 0] 0.25',
            vaxis: '[0 -1 0 0] 0.25'
        };
    }

    toString(): string {
        const parts: string[] = [];
        
        // Header
        parts.push('versioninfo\n{\n\t"editorvesion" "400"\n\t"editorbuild" "8163"\n\t"mapversion" "1"\n\t"formatversion" "100"\n\t"prefab" "0"\n}');
        parts.push('visgroups\n{\n}');
        parts.push('viewsettings\n{\n\t"bSnapToGrid" "1"\n\t"bShowGrid" "1"\n\t"nGridSpacing" "64"\n\t"bShow3DGrid" "0"\n}');
        
        // World
        parts.push('world\n{\n\t"id" "1"\n\t"mapversion" "1"\n\t"classname" "worldspawn"\n\t"skyname" "sky_dust"');
        for (const solid of this.solids) {
            parts.push(this.solidToString(solid));
        }
        parts.push('}');

        // Entities
        for (const entity of this.entities) {
            parts.push(this.entityToString(entity));
        }

        return parts.join('\n');
    }

    private solidToString(solid: Solid): string {
        const lines = ['\tsolid', '\t{', `\t\t"id" "${solid.id}"`];
        for (const side of solid.sides) {
            lines.push('\t\tside', '\t\t{', `\t\t\t"id" "${side.id}"`);
            const p = side.plane;
            const planeStr = `(${p.p1.x} ${p.p1.y} ${p.p1.z}) (${p.p2.x} ${p.p2.y} ${p.p2.z}) (${p.p3.x} ${p.p3.y} ${p.p3.z})`;
            lines.push(`\t\t\t"plane" "${planeStr}"`);
            lines.push(`\t\t\t"material" "${side.material}"`);
            lines.push(`\t\t\t"uaxis" "${side.uaxis}"`);
            lines.push(`\t\t\t"vaxis" "${side.vaxis}"`);
            lines.push('\t\t\t"rotation" "0"');
            lines.push('\t\t\t"lightmapscale" "16"');
            lines.push('\t\t\t"smoothing_groups" "0"');
            lines.push('\t\t}');
        }
        lines.push('\t}');
        return lines.join('\n');
    }

    private entityToString(entity: Entity): string {
        const lines = ['entity', '{', `\t"id" "${entity.id}"`, `\t"classname" "${entity.classname}"`];
        lines.push(`\t"origin" "${entity.origin.x} ${entity.origin.y} ${entity.origin.z}"`);
        if (entity.properties) {
            for (const [key, value] of Object.entries(entity.properties)) {
                lines.push(`\t"${key}" "${value}"`);
            }
        }
        lines.push('}');
        return lines.join('\n');
    }
}

// --- Main Generation Logic ---
function generate() {
    const builder = new VmfBuilder();
    console.log('Generating map...');

    // 1. Create Floor
    const halfSize = MAP_SIZE / 2;
    builder.addBlock(
        { x: -halfSize, y: -halfSize, z: -16 },
        { x: halfSize, y: halfSize, z: 0 },
        TEXTURE_FLOOR
    );

    // 2. Create Skybox Walls (Simple approach: just 4 walls around)
    // North
    builder.addBlock(
        { x: -halfSize, y: halfSize, z: 0 },
        { x: halfSize, y: halfSize + 16, z: WALL_HEIGHT },
        TEXTURE_WALL
    );
     // South
     builder.addBlock(
        { x: -halfSize, y: -halfSize - 16, z: 0 },
        { x: halfSize, y: -halfSize, z: WALL_HEIGHT },
        TEXTURE_WALL
    );
    // East
    builder.addBlock(
        { x: halfSize, y: -halfSize, z: 0 },
        { x: halfSize + 16, y: halfSize, z: WALL_HEIGHT },
        TEXTURE_WALL
    );
    // West
    builder.addBlock(
        { x: -halfSize - 16, y: -halfSize, z: 0 },
        { x: -halfSize, y: halfSize, z: WALL_HEIGHT },
        TEXTURE_WALL
    );


    // 3. Add Spawns
    builder.addEntity('info_player_terrorist', { x: -halfSize + 256, y: 0, z: 32 });
    builder.addEntity('info_player_counterterrorist', { x: halfSize - 256, y: 0, z: 32 });

    // 4. Random Obstacles
    for (let i = 0; i < 20; i++) {
        const w = 64 + Math.random() * 128; // width
        const d = 64 + Math.random() * 128; // depth
        const h = 64 + Math.random() * 128; // height
        
        // Random pos within bounds (padding 512)
        const range = halfSize - 512;
        const x = (Math.random() * range * 2) - range;
        const y = (Math.random() * range * 2) - range;

        builder.addBlock(
            { x: x, y: y, z: 0 },
            { x: x + w, y: y + d, z: h },
            TEXTURE_WALL
        );
    }
    
    // 5. Bot Nodes
    for(let i=0; i<10; i++) {
         const range = halfSize - 256;
         const x = (Math.random() * range * 2) - range;
         const y = (Math.random() * range * 2) - range;
         builder.addEntity('info_node', { x, y, z: 32 });
    }


    const vmfContent = builder.toString();
    fs.writeFileSync(OUTPUT_FILE, vmfContent);
    console.log(`Map generated at: ${OUTPUT_FILE}`);
}

generate();
