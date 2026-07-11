import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { EntitySpawner } from './EntitySpawner';
import {
    createDefaultMapLoaders,
    loadMapFromRegistry,
    registerMapLoader,
    type IMapLoader,
} from './maps/MapFormatRegistry';
import { loadModeMap } from './maps/ModeMapStrategies';

/**
 * LevelGenerator - Coordinate map loading across different formats
 */
export class LevelGenerator {
    private game: Game;
    private entitySpawner: EntitySpawner;
    private formatLoaders: IMapLoader[];

    constructor(game: Game) {
        this.game = game;
        this.entitySpawner = new EntitySpawner(game);
        this.formatLoaders = createDefaultMapLoaders(game);
    }

    /**
     * Load a map by name, automatically detecting the format
     */
    public async loadMap(mapName: string): Promise<void> {
        this.clearLevel();

        try {
            const gameMode = this.game.gameMode;
            if (gameMode && (await loadModeMap(this.game, gameMode, mapName))) {
                return;
            }

            await loadMapFromRegistry(this.formatLoaders, {
                game: this.game,
                entitySpawner: this.entitySpawner,
                initNavmesh: (name) => this.initNavmesh(name),
            }, mapName);
        } catch (error) {
            console.error(`Failed to load map: ${mapName}`, error);
            throw error;
        }
    }

    private initNavmesh(mapName: string) {
        const cleanName = mapName.replace('.vmf', '');

        console.log(`Initializing Navmesh for: ${cleanName}`);
        setTimeout(() => {
            this.game.recastNav.initialize().then(async () => {
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
                    this.game.recastNav.setDebugDraw(true);
                } else {
                    console.error('[LevelGen] Recast navmesh generation failed! AI will be disabled.');
                }
            });
        }, 500);
    }

    /** Register an additional map loader (e.g. from a mod or new format). */
    public registerMapLoader(loader: IMapLoader): void {
        this.formatLoaders = registerMapLoader(this.formatLoaders, loader);
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

        for (let i = this.game.scene.children.length - 1; i >= 0; i--) {
            const child = this.game.scene.children[i];

            if (child instanceof THREE.Camera) continue;
            if (player && player.mesh && child === player.mesh) continue;

            const weapon = player?.getCurrentWeapon();
            if (weapon && weapon.mesh && child === weapon.mesh) continue;

            const gameWithLights = this.game as Game & { mainDirectionalLight?: THREE.Light };
            if (child === gameWithLights.mainDirectionalLight) continue;
            if (child === this.game.camera) continue;

            if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
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
                if (child !== gameWithLights.mainDirectionalLight) {
                    this.game.scene.remove(child);
                }
            }
        }

        console.log(`Clearing ${this.game.world.bodies.length} physics bodies...`);
        const bodies = [...this.game.world.bodies];
        for (const body of bodies) {
            if (player && body === player.body) continue;
            this.game.world.removeBody(body);
        }
        console.log('Physics cleared (Player preserved).');

        const objects = [...this.game.getGameObjects()];
        objects.forEach(go => {
            if (player && go === player) return;
            this.game.removeGameObject(go);
        });

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
        const floorShape = new CANNON.Box(new CANNON.Vec3(50, 0.5, 50));
        const floorBody = new CANNON.Body({ mass: 0, shape: floorShape });
        floorBody.position.set(0, -0.5, 0);
        this.game.world.addBody(floorBody);

        const floorGeo = new THREE.BoxGeometry(100, 1, 100);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.position.copy(floorBody.position as unknown as THREE.Vector3);
        this.game.scene.add(floorMesh);

        this.spawnPlayer(new THREE.Vector3(0, 2, 0));
    }
}
