
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { init, exportNavMesh } from 'recast-navigation';
import { threeToSoloNavMesh } from '@recast-navigation/three';

// Import Project Modules
import { VmfParser } from '../src/game/maps/VmfParser';
import { VmfWorldBuilder } from '../src/game/maps/VmfWorldBuilder';

// Configuration
const args = process.argv.slice(2);
const MAPS_DIR = path.join(process.cwd(), 'src', 'game', 'maps');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

async function bakeMap(mapName: string) {
    const filename = mapName.endsWith('.vmf') ? mapName : `${mapName}.vmf`;
    const nameWithoutExt = filename.replace('.vmf', '');
    const mapPath = path.join(MAPS_DIR, filename);
    const outputFilename = `${nameWithoutExt}.navmesh.bin`;
    const outputPath = path.join(PUBLIC_DIR, outputFilename);

    console.log(`\n[BAKE] Starting Recast Navmesh Bake for ${nameWithoutExt}...`);

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

        // 4. Build Physics World (and Scene Meshes)
        console.log('[BAKE] Building Scene...');
        const builder = new VmfWorldBuilder(scene, world);
        builder.build(mapData);
        // Checking VmfWorldBuilder usage in previous file, it used `builder.build(mapData)`. 
        // Need to be careful if VmfWorldBuilder.build is async or not.
        // Assuming synchronous or simple promise.
        // Previous script had `builder.build(mapData);` then extracted spawns.
        // Let's assume `build` populates the scene synchronously enough for what we need, 
        // or check VmfWorldBuilder.ts if needed. 
        // But for safety, let's stick to what was there: builder.build(mapData);
        // Wait, looking at lines 50-51 of previous file: `builder.build(mapData);`

        // 5. Initialize Recast
        console.log('[BAKE] Initializing Recast...');
        await init();

        // 6. Collect Meshes
        const meshes: THREE.Mesh[] = [];
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                // Filter small objects if needed, similar to runtime
                const box = new THREE.Box3().setFromObject(child);
                const size = box.getSize(new THREE.Vector3());
                if (size.x > 0.3 && size.z > 0.3) {
                    meshes.push(child);
                }
            }
        });
        console.log(`[BAKE] Found ${meshes.length} meshes for generation.`);

        if (meshes.length === 0) {
            console.error('[BAKE] No meshes found!');
            return false;
        }

        // 7. Generate Navmesh using SAME CONFIG as runtime (RecastNavigation.ts)
        console.log('[BAKE] Generating NavMesh...');
        // Tuned for Source Engine dimensions (1 unit = 0.75inch = 0.01905m)
        // Player Width 32 units = 0.6m -> Radius 0.3m
        // Doorways ~48 units = 0.9m
        const cs = 0.1; // 10cm precision
        const ch = 0.1;
        const result = threeToSoloNavMesh(meshes, {
            cs,
            ch,
            walkableSlopeAngle: 45,
            walkableHeight: Math.ceil(2.0 / ch), // 2.0m / 0.1 = 20 voxels
            walkableClimb: Math.ceil(0.5 / ch), // 0.5m / 0.1 = 5 voxels
            walkableRadius: Math.ceil(1.0 / cs), // 1.0m / 0.1 = 10 voxels
            maxEdgeLen: 12,
            maxSimplificationError: 1.1,
            minRegionArea: 8,
            mergeRegionArea: 20,
            maxVertsPerPoly: 6,
            detailSampleDist: 6,
            detailSampleMaxError: 1,
        });

        if (!result.success || !result.navMesh) {
            console.error('[BAKE] Generation Failed!');
            return false;
        }

        // 8. Export
        console.log('[BAKE] Serializing...');
        // getNavMeshData() returns Uint8Array (binary) which implies .bin extension
        const data = exportNavMesh(result.navMesh);

        fs.writeFileSync(outputPath, data);
        console.log(`[SUCCESS] Navmesh saved to: ${outputPath}`);
        console.log(`[INFO] Size: ${(data.length / 1024).toFixed(2)} KB`);

        // Clean up
        result.navMesh.destroy();

        return true;
    } catch (e) {
        console.error(`[ERROR] Failed to bake ${nameWithoutExt}:`, e);
        // console.error(e.stack);
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
