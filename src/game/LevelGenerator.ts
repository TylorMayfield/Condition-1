import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { VmfMapLoader } from './loaders/VmfMapLoader';
import { BrushMapLoader } from './loaders/BrushMapLoader';
import { TextMapLoader } from './loaders/TextMapLoader';
import { EntitySpawner } from './EntitySpawner';

/**
 * LevelGenerator - Coordinate map loading across different formats
 */
export class LevelGenerator {
    private game: Game;
    private vmfLoader: VmfMapLoader;
    private brushMapLoader: BrushMapLoader;
    private textMapLoader: TextMapLoader;
    private entitySpawner: EntitySpawner;

    constructor(game: Game) {
        this.game = game;
        this.vmfLoader = new VmfMapLoader(game);
        this.brushMapLoader = new BrushMapLoader(game);
        this.textMapLoader = new TextMapLoader(game);
        this.entitySpawner = new EntitySpawner(game);
    }

    /**
     * Load a map by name, automatically detecting the format
     */
    public async loadMap(mapName: string): Promise<void> {
        try {
            // Try VMF first (priority format)
            if (await VmfMapLoader.check(mapName)) {
                console.log(`Loading as VMF: ${mapName}`);
                await this.vmfLoader.load(mapName);
                return;
            }

            // Try BrushMap
            if (await BrushMapLoader.check(mapName)) {
                console.log(`Loading as BrushMap: ${mapName}`);
                const brushMap = await this.brushMapLoader.load(mapName);
                this.entitySpawner.spawnFromBrushMap(brushMap);
                return;
            }

            // Try TextMap
            if (await TextMapLoader.check(mapName)) {
                console.log(`Loading as TextMap: ${mapName}`);
                const textMap = await this.textMapLoader.load(mapName);
                this.entitySpawner.spawnFromTextMap(textMap);
                return;
            }

            // No format found
            throw new Error(`Map not found in any supported format: ${mapName}`);
        } catch (error) {
            console.error(`Failed to load map: ${mapName}`, error);
            throw error;
        }
    }

    /**
     * Spawn player at a specific position
     */
    public spawnPlayer(position?: THREE.Vector3): GameObject {
        return this.entitySpawner.spawnPlayer(position);
    }
    /**
     * Generate a procedural test level if loading fails
     */
    public generate() {
        console.log('Generating procedural test level...');
        // Simple floor
        const floorShape = new CANNON.Box(new CANNON.Vec3(50, 0.5, 50));
        const floorBody = new CANNON.Body({ mass: 0, shape: floorShape });
        floorBody.position.set(0, -0.5, 0);
        this.game.world.addBody(floorBody);

        const floorGeo = new THREE.BoxGeometry(100, 1, 100);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.position.copy(floorBody.position as any);
        this.game.scene.add(floorMesh);

        // Spawn Player
        this.spawnPlayer(new THREE.Vector3(0, 2, 0));
    }
}
