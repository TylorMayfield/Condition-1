import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { VmfParser } from '../maps/VmfParser';
import { VmfWorldBuilder } from '../maps/VmfWorldBuilder';

export class VmfMapLoader {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public async load(mapName: string): Promise<void> {
        const fileName = mapName.endsWith('.vmf') ? mapName : `${mapName}.vmf`;
        const nameWithoutExt = fileName.replace('.vmf', '');

        try {
            // Import the VMF file as raw string
            const vmfModule = await import(`../maps/${nameWithoutExt}.vmf?raw`);
            const content = vmfModule.default || vmfModule;

            // Parse the VMF
            const mapData = VmfParser.parse(content);

            // Setup lighting
            this.setupLighting();

            // Setup atmosphere
            this.setupAtmosphere();

            // Build world geometry and physics
            const builder = new VmfWorldBuilder(this.game.scene, this.game.world);
            builder.build(mapData);

            // Spawn entities
            this.spawnEntities(mapData.entities);

            console.log(`Loaded VMF Map: ${fileName} v${mapData.version}`);
        } catch (error) {
            console.error(`Failed to load VMF map: ${mapName}`, error);
            throw error;
        }
    }

    private setupLighting() {
        // Strong ambient light for base brightness
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        this.game.scene.add(ambientLight);

        // Hemisphere for sky/ground lighting
        const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0xE6CFA1, 2.0);
        this.game.scene.add(hemiLight);

        // Directional sun light
        const sunLight = new THREE.DirectionalLight(0xffffff, 3.5);
        sunLight.position.set(50, 100, 50);
        sunLight.castShadow = true;

        // Configure shadow camera
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 500;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.bias = -0.0001;

        this.game.scene.add(sunLight);
    }

    private setupAtmosphere() {
        // Add distance fog
        const fogColor = new THREE.Color(0xE6CFA1);
        this.game.scene.fog = new THREE.FogExp2(fogColor, 0.002);

        // Initialize skybox
        this.game.skyboxManager.reset();
    }

    private spawnEntities(entities: any[]) {
        console.log(`Processing ${entities.length} VMF entities...`);

        // Helper to parse origin string "x y z"
        const parseOrigin = (originStr: string): THREE.Vector3 | null => {
            if (!originStr) return null;
            const parts = originStr.split(' ').map(parseFloat);
            if (parts.length !== 3) return null;

            // Swap Y and Z for ThreeJS (Y-up), and Scale
            const x = parts[0] * 0.02;
            const y = parts[2] * 0.02; // Z becomes Y
            const z = -parts[1] * 0.02; // Y becomes -Z

            // Lift slightly to avoid floor collision clipping
            // +1.0 places center at Y=1.0. Feet at 0.2 (safe above floor). Head at 1.8 (safe below ceiling).
            return new THREE.Vector3(x, y + 1.0, z);
        };

        const tSpawns: THREE.Vector3[] = [];
        const ctSpawns: THREE.Vector3[] = [];
        const dmSpawns: THREE.Vector3[] = [];

        // Collect Spawns
        for (const entity of entities) {
            if (!entity.properties || !entity.properties.origin) continue;

            const pos = parseOrigin(entity.properties.origin);
            if (!pos) continue;

            if (entity.classname === 'info_player_terrorist') {
                tSpawns.push(pos);
            } else if (entity.classname === 'info_player_counterterrorist') {
                ctSpawns.push(pos);
            } else if (entity.classname === 'info_player_deathmatch') {
                dmSpawns.push(pos);
            } else if (entity.classname === 'info_player_start') {
                // Generic start, treat as CT (Player) usually
                ctSpawns.unshift(pos); // Priority
            }
        }

        console.log(`Examples found: T=${tSpawns.length}, CT=${ctSpawns.length}`);

        // Spawn Strategy: 
        // CT Spots -> Player + Squad
        // T Spots -> Enemies

        // 1. Player Spawn (First CT or fallback)
        let playerPos = ctSpawns.length > 0 ? ctSpawns.shift() : (dmSpawns.length > 0 ? dmSpawns[0] : null);

        // If still no spawn, try T spawn as last resort (or default)
        if (!playerPos && tSpawns.length > 0) playerPos = tSpawns.shift();

        if (playerPos) {
            console.log(`Spawning Player at ${playerPos.x.toFixed(2)}, ${playerPos.y.toFixed(2)}, ${playerPos.z.toFixed(2)}`);
            this.game.levelGenerator.spawnPlayer(playerPos);
        } else {
            console.warn('No spawn points found! Using default.');
            this.game.levelGenerator.spawnPlayer(new THREE.Vector3(0, 5, 0));
        }

        // Store Available Spawns for GameMode respawning
        this.game.availableSpawns.T = tSpawns;
        this.game.availableSpawns.CT = ctSpawns;

        // NOTE: Enemies and friendlies are now spawned by the GameMode, not here.
        // This allows round-based games to control spawning.
        console.log(`Stored spawn points: T=${tSpawns.length}, CT=${ctSpawns.length} (GameMode will spawn teams)`);
    }

    public static async check(mapName: string): Promise<boolean> {
        const fileName = mapName.endsWith('.vmf') ? mapName : `${mapName}.vmf`;
        const nameWithoutExt = fileName.replace('.vmf', '');

        try {
            await import(`../maps/${nameWithoutExt}.vmf?raw`);
            return true;
        } catch {
            return false;
        }
    }
}
