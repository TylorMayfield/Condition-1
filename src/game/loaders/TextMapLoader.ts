import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { TextMap } from '../maps/TextMap';
import { TextMapParser } from '../maps/TextMapParser';
import { TextMapRenderer } from '../maps/TextMapRenderer';

export class TextMapLoader {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public async load(mapName: string): Promise<TextMap> {
        const fileName = mapName.endsWith('.textmap') ? mapName : `${mapName}.textmap`;
        const nameWithoutExt = fileName.replace('.textmap', '');

        try {
            const textMapModule = await import(`../maps/${nameWithoutExt}.textmap?raw`);
            const content = textMapModule.default || textMapModule;

            const textMap = TextMapParser.parse(content);

            // Setup lighting
            this.setupLighting();

            // Render the map
            const renderer = new TextMapRenderer(this.game.scene, this.game.world);
            renderer.render(textMap);

            console.log(`Loaded TextMap: ${fileName}`);
            return textMap;
        } catch (error) {
            console.error(`Failed to load TextMap: ${mapName}`, error);
            throw error;
        }
    }

    private setupLighting() {
        // Simple lighting for textmaps
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.game.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(10, 20, 10);
        sunLight.castShadow = true;
        this.game.scene.add(sunLight);
    }

    public static async check(mapName: string): Promise<boolean> {
        const fileName = mapName.endsWith('.textmap') ? mapName : `${mapName}.textmap`;
        const nameWithoutExt = fileName.replace('.textmap', '');

        try {
            await import(`../maps/${nameWithoutExt}.textmap?raw`);
            return true;
        } catch {
            return false;
        }
    }
}
