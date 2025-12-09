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
        this.clearLevel(); // Clean up previous level first

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
     * Clear the current level (meshes, physics, entities)
     */
    public clearLevel() {
        console.log('Clearing current level...');

        // 1. Clear Scene (Meshes & Lights)
        // Iterate backwards to remove safely
        for (let i = this.game.scene.children.length - 1; i >= 0; i--) {
            const child = this.game.scene.children[i];

            // Do not remove Camera
            if (child instanceof THREE.Camera) continue;

            // Remove Meshes (Map chunks, Entities, Floor)
            if (child instanceof THREE.Mesh || child instanceof THREE.Group || child instanceof THREE.Light) {
                this.game.scene.remove(child);

                // Dispose geometry/materials if possible
                if (child instanceof THREE.Mesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            }
        }

        // 2. Clear Physics World
        console.log(`Clearing ${this.game.world.bodies.length} physics bodies...`);
        let safetyCounter = 0;
        const MAX_BODIES = 10000;
        while (this.game.world.bodies.length > 0) {
            this.game.world.removeBody(this.game.world.bodies[0]);
            safetyCounter++;
            if (safetyCounter > MAX_BODIES) {
                console.error("Infinite loop detected in physics cleanup! breaking.");
                break;
            }
        }
        console.log('Physics cleared.');

        // 3. Clear GameObjects (Entities)
        // We will implement specific clear logic in Game or loop here
        // Ideally Game class should handle this
        // For now, let's just clear the array in Game if accessible, or call remove
        // Accessing private gameObjects via public getter doesn't help with removal
        // Let's assume we can clear them one by one
        const objects = [...this.game.getGameObjects()];
        objects.forEach(go => this.game.removeGameObject(go));

        // 4. Reset Managers
        // (Skybox, Weather, etc might need reset)
        this.game.skyboxManager.reset();
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
