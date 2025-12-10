
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock Browser Environment for Three/Cannon if needed
// Thankfully our modified DevTextureGenerator handles the lack of canvas

// Import Project Modules
// Note: We use relative paths assuming this runs from root or scripts/
import { VmfParser } from '../src/game/maps/VmfParser';
import { VmfWorldBuilder } from '../src/game/maps/VmfWorldBuilder';
import { NavigationSystem } from '../src/game/ai/NavigationSystem';

// Configuration
// Allow passing map name as arg: npm run bake -- de_dust2_d
const args = process.argv.slice(2);
const MAPS_DIR = path.join(process.cwd(), 'src', 'game', 'maps');

async function bakeMap(mapName: string) {
    const filename = mapName.endsWith('.vmf') ? mapName : `${mapName}.vmf`;
    const nameWithoutExt = filename.replace('.vmf', '');
    const mapPath = path.join(MAPS_DIR, filename);
    const outputFilename = `${nameWithoutExt}.navmesh.json`;
    const outputPath = path.join(process.cwd(), 'public', outputFilename);

    console.log(`\n[BAKE] Starting Navmesh Bake for ${nameWithoutExt}...`);

    // 1. Setup Headless World
    const scene = new THREE.Scene();
    const world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);

    // 2. Load Map File
    if (!fs.existsSync(mapPath)) {
        console.error(`[ERROR] Map file not found: ${mapPath}`);
        return false;
    }
    const mapContent = fs.readFileSync(mapPath, 'utf-8');

    // 3. Parse Map
    console.log('[BAKE] Parsing VMF...');
    try {
        const mapData = VmfParser.parse(mapContent);

        // 4. Build Physics World
        console.log('[BAKE] Building Physics World...');
        const builder = new VmfWorldBuilder(scene, world);
        builder.build(mapData);

        // 5. Extract Spawn Points
        console.log('[BAKE] Extracting Spawn Points...');
        const spawns: THREE.Vector3[] = [];
        
        const parseOrigin = (originStr: string) => {
            const parts = originStr.split(' ').map(parseFloat);
            const x = parts[0] * 0.02;
            const y = parts[2] * 0.02;
            const z = -parts[1] * 0.02;
            return new THREE.Vector3(x, y + 1.0, z);
        };

        for (const entity of mapData.entities) {
            if (entity.properties && entity.properties.origin) {
                const classname = entity.classname;
                if (classname.includes('info_player_') || classname === 'info_player_start') {
                    spawns.push(parseOrigin(entity.properties.origin));
                }
            }
        }

        if (spawns.length === 0) {
            console.warn('[WARN] No spawn points found. Using default 0,0,0');
            spawns.push(new THREE.Vector3(0, 2, 0));
        }

        // 6. Generate Navmesh
        console.log(`[BAKE] Generating Navmesh (Seeds: ${spawns.length})...`);
        
        const mockGame: any = {
            world: world,
            availableSpawns: { T: spawns, CT: spawns },
            scene: scene,
            player: { body: { position: spawns[0] } } 
        };

        const nav = new NavigationSystem(mockGame);
        nav.generateGraph();

        // 7. Serialize and Save
        console.log('[BAKE] Serializing...');
        const json = nav.serialize();
        
        fs.writeFileSync(outputPath, json);
        console.log(`[SUCCESS] Navmesh saved to: ${outputPath}`);
        console.log(`[INFO] Size: ${(json.length / 1024).toFixed(2)} KB`);
        return true;
    } catch (e) {
        console.error(`[ERROR] Failed to bake ${nameWithoutExt}:`, e);
        return false;
    }
}

async function main() {
    if (args.includes('--all')) {
        console.log('[BAKE] Processing ALL maps in src/game/maps...');
        const files = fs.readdirSync(MAPS_DIR).filter(f => f.endsWith('.vmf'));
        
        console.log(`[BAKE] Found ${files.length} maps: ${files.join(', ')}`);
        
        let successes = 0;
        for (const file of files) {
            const success = await bakeMap(file);
            if (success) successes++;
        }
        
        console.log(`\n[SUMMARY] Baked ${successes} / ${files.length} maps successfully.`);
    } else {
        const mapName = args[0] || 'de_dust2_d';
        await bakeMap(mapName);
    }
}

main().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
