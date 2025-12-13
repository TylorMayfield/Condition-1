import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { VmfMapLoader } from './loaders/VmfMapLoader';
import { BrushMapLoader } from './loaders/BrushMapLoader';
import { TextMapLoader } from './loaders/TextMapLoader';
import { EntitySpawner } from './EntitySpawner';
import { MOBAMapGenerator } from './maps/MOBAMapGenerator';

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
            // Check if MOBA mode - generate MOBA map
            if (this.game.gameMode && this.game.gameMode.constructor.name === 'MOBAGameMode') {
                console.log(`Generating MOBA map`);
                const mobaGenerator = new MOBAMapGenerator(this.game);
                mobaGenerator.generate();
            // MOBA mode handles its own initialization
                return;
            }
            
            // Check if Mallow Might mode - generate procedural arena or just setup empty scene
            // Check by constructor name or just the mapName 'mallow'
            if ((this.game.gameMode && this.game.gameMode.constructor.name === 'MallowMightGameMode') || mapName === 'mallow') {
                console.log('Generating Mallow Might Arena');
                 // Create a simple floor for the "Arena" (Launches)
                 // The MallowGameMode generates visual map nodes logic itself.
                 
                 // Basic Arena Floor (Grass)
                 const floorGeo = new THREE.BoxGeometry(100, 1, 100);
                 const floorMat = new THREE.MeshStandardMaterial({ color: 0x228B22 }); // Forest Green
                 const floorMesh = new THREE.Mesh(floorGeo, floorMat);
                 floorMesh.position.set(0, -0.5, 0);
                 floorMesh.receiveShadow = true;
                 this.game.scene.add(floorMesh);
                 
                 const floorShape = new CANNON.Box(new CANNON.Vec3(50, 0.5, 50));
                 const floorBody = new CANNON.Body({ mass: 0, shape: floorShape }); // Static
                 floorBody.position.set(0, -0.5, 0);
                 this.game.world.addBody(floorBody);
                 
                 // Add some walls to keep them in?
                 // Let's rely on falling off for now (death plane logic needed?)
                 // MallowGameMode creates units.
                return;
            }

            // Try VMF first (priority format)
            if (await VmfMapLoader.check(mapName)) {
                console.log(`Loading as VMF: ${mapName}`);
                await this.vmfLoader.load(mapName);
                this.initNavmesh(mapName); // Call helper
                return;
            }

            // Try BrushMap
            if (await BrushMapLoader.check(mapName)) {
                console.log(`Loading as BrushMap: ${mapName}`);
                const brushMap = await this.brushMapLoader.load(mapName);
                this.entitySpawner.spawnFromBrushMap(brushMap);
                // this.initNavmesh(mapName); // TODO: Support BrushMap navmesh
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

    private initNavmesh(mapName: string) {
        // Strip .vmf extension if present for clean matching
        // The bake script outputs [mapname].navmesh.json (where mapname usually has no ext or user inputs it)
        // If mapName is 'cs_office_d.vmf', bake script (if using default args behavior) might have used 'cs_office_d.vmf' as name?
        // Let's check bake-navmesh.ts behavior again. 
        // bake-navmesh.ts: const nameWithoutExt = filename.replace('.vmf', '');
        // const outputFilename = `${nameWithoutExt}.navmesh.json`;

        const cleanName = mapName.replace('.vmf', '');

        console.log(`Initializing Navmesh for: ${cleanName}`);
        setTimeout(() => {


            // Initialize Recast Navigation (industry-standard navmesh)
            this.game.recastNav.initialize().then(async () => {
                // Try to load pre-baked first
                const bakedUrl = `${cleanName}.navmesh.bin`;
                const loaded = await this.game.recastNav.loadFromFile(bakedUrl);

                if (loaded) {
                    console.log('[LevelGen] Using pre-baked navmesh.');
                    this.game.recastNav.setDebugDraw(true, false);
                    return;
                }

                console.log('[LevelGen] Generating Recast navmesh from scene (Runtime Fallback)...');
                const success = this.game.recastNav.generateFromScene();
                if (success) {
                    console.log('[LevelGen] Recast navmesh ready!');
                    // Enable debug visualization
                    this.game.recastNav.setDebugDraw(true);
                } else {
                    console.error('[LevelGen] Recast navmesh generation failed! AI will be disabled.');
                }
            });
        }, 500);
    }

    /**
     * Get Entity Spawner
     */
    public getEntitySpawner(): EntitySpawner {
        return this.entitySpawner;
    }

    /**
     * Clear the current level (meshes, physics, entities)
     */
    public clearLevel() {
        console.log('Clearing current level...');
        const player = this.game.player;

        // 1. Clear Scene (Meshes & Lights)
        // Iterate backwards to remove safely
        for (let i = this.game.scene.children.length - 1; i >= 0; i--) {
            const child = this.game.scene.children[i];

            // Do not remove Camera or Player Mesh specifically
            if (child instanceof THREE.Camera) continue;
            if (player && player.mesh && child === player.mesh) continue;

            // Do not remove Weapon Mesh
            const weapon = player?.getCurrentWeapon();
            if (weapon && weapon.mesh && child === weapon.mesh) continue;

            // Also check if child is player's flashlight target/light if they are separate?
            // Flashlight is attached to camera usually.

            // Preserve main directional light and camera
            const gameWithLights = this.game as any;
            if (child === gameWithLights.mainDirectionalLight) continue;
            if (child === this.game.camera) continue;

            // Remove Meshes (Map chunks, Entities, Floor)
            // Only remove non-main lights (map-specific lights)
            if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
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
                this.game.scene.remove(child);
            } else if (child instanceof THREE.Light) {
                // Only remove if it's not the main directional light
                if (child !== gameWithLights.mainDirectionalLight) {
                    this.game.scene.remove(child);
                }
            }
        }

        // 2. Clear Physics World
        console.log(`Clearing ${this.game.world.bodies.length} physics bodies...`);
        const bodies = [...this.game.world.bodies];
        for (const body of bodies) {
            if (player && body === player.body) continue;
            this.game.world.removeBody(body);
        }
        console.log('Physics cleared (Player preserved).');

        // 3. Clear GameObjects (Entities)
        // We will implement specific clear logic in Game or loop here
        // Ideally Game class should handle this
        // For now, let's just clear the array in Game if accessible, or call remove
        // Accessing private gameObjects via public getter doesn't help with removal
        // Let's assume we can clear them one by one
        const objects = [...this.game.getGameObjects()];
        objects.forEach(go => {
            if (player && go === player) return; // Skip player
            this.game.removeGameObject(go);
        });

        // 4. Reset Managers
        // (Skybox, Weather, etc might need reset)
        this.game.skyboxManager.reset();
        if (this.game.recastNav) {
            this.game.recastNav.reset();
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
