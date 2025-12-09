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
        // Entity spawning will be handled by EntitySpawner in Phase 2
        // For now, keep minimal logic here
        console.log(`Processing ${entities.length} VMF entities...`);
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
