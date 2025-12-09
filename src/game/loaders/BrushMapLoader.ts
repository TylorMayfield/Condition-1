import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { BrushMap } from '../maps/BrushMap';
import { BrushMapParser } from '../maps/BrushMapParser';
import { BrushMapRenderer } from '../maps/BrushMapRenderer';

export class BrushMapLoader {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public async load(mapName: string): Promise<BrushMap> {
        const fileName = mapName.endsWith('.brushmap') ? mapName : `${mapName}.brushmap`;
        const nameWithoutExt = fileName.replace('.brushmap', '');

        try {
            const brushMapModule = await import(`../maps/${nameWithoutExt}.brushmap?raw`);
            const content = brushMapModule.default || brushMapModule;

            const brushMap = BrushMapParser.parse(content);

            // Setup lighting
            this.setupLighting();

            // Render the map
            const renderer = new BrushMapRenderer(this.game.scene, this.game.world);
            renderer.render(brushMap);

            console.log(`Loaded BrushMap: ${fileName}`);
            return brushMap;
        } catch (error) {
            console.error(`Failed to load BrushMap: ${mapName}`, error);
            throw error;
        }
    }

    private setupLighting() {
        // Simple lighting for brushmaps
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.game.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(10, 20, 10);
        sunLight.castShadow = true;
        sunLight.shadow.camera.left = -50;
        sunLight.shadow.camera.right = 50;
        sunLight.shadow.camera.top = 50;
        sunLight.shadow.camera.bottom = -50;
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        this.game.scene.add(sunLight);
    }

    public static async check(mapName: string): Promise<boolean> {
        const fileName = mapName.endsWith('.brushmap') ? mapName : `${mapName}.brushmap`;
        const nameWithoutExt = fileName.replace('.brushmap', '');

        try {
            await import(`../maps/${nameWithoutExt}.brushmap?raw`);
            return true;
        } catch {
            return false;
        }
    }
}
