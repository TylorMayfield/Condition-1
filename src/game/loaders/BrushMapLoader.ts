import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { BrushMap } from '../maps/BrushMap';
import type { BrushMapDefinition } from '../maps/BrushMap';
import { BrushMapParser } from '../maps/BrushMapParser';
import { BrushMapRenderer } from '../maps/BrushMapRenderer';

export class BrushMapLoader {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public async load(mapName: string): Promise<BrushMap> {
        const fileName = mapName.endsWith('.brushmap') ? mapName : `${mapName}.brushmap`;


        try {
            // Fetch map from public/maps directory
            const response = await fetch(`maps/${fileName}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch map: ${response.statusText}`);
            }
            const content = await response.text();

            const brushMapDefinition: BrushMapDefinition = BrushMapParser.parse(content);
            const brushMap = new BrushMap(this.game, brushMapDefinition);

            // Setup lighting
            this.setupLighting();

            // Render the map
            const renderer = new BrushMapRenderer(this.game, brushMap);
            renderer.render();

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


        try {
            const response = await fetch(`maps/${fileName}`, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }
}
