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

        // Debug: Log counts of potential spawn entities
        const spawns = entities.filter(e =>
            (e.classname && e.classname.includes('info_player')) ||
            (e.classname && e.classname.includes('info_deathmatch'))
        );
        console.log(`Found ${spawns.length} potential spawn entities:`, spawns.map(e => e.classname));

        // Find player start (Priority: Start -> CT -> T -> Deathmatch)
        const playerStart = entities.find(e => e.classname === 'info_player_start') ||
            entities.find(e => e.classname === 'info_player_counterterrorist') ||
            entities.find(e => e.classname === 'info_player_terrorist') ||
            entities.find(e => e.classname === 'info_player_deathmatch');

        if (playerStart) {
            // Parse origin "x y z"
            if (!playerStart.properties || !playerStart.properties.origin) {
                console.warn('Spawn entity missing origin property', playerStart);
                return;
            }

            const parts = playerStart.properties.origin.split(' ').map(parseFloat);
            if (parts.length === 3) {
                // Swap Y and Z for ThreeJS (Y-up), and Scale
                const x = parts[0] * 0.02;
                const y = parts[2] * 0.02; // Z becomes Y
                const z = -parts[1] * 0.02; // Y becomes -Z

                // Lift slightly to avoid floor collision clipping at spawn
                const spawnPos = new THREE.Vector3(x, y + 2, z);

                console.log(`Spawning player at ${playerStart.classname} origin: ${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)}`);

                if (this.game.player) {
                    this.game.player.moveTo(spawnPos);
                    // Reset velocity
                    if (this.game.player.body) {
                        this.game.player.body.velocity.set(0, 0, 0);
                        this.game.player.body.angularVelocity.set(0, 0, 0);
                    }
                }
            } else {
                console.warn('Invalid origin format for spawn:', playerStart.properties.origin);
            }
        } else {
            console.warn('No info_player_start found in VMF! Using default.');
        }
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
