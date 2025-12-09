import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { Enemy } from './Enemy';
import { DestructibleWall } from './components/DestructibleWall';
import { TileMap } from './maps/TileMap';
import type { TileMapDefinition } from './maps/TileMap';
import { MapRenderer } from './maps/MapRenderer';
import { SquadMember } from './SquadMember';
import { TextMap } from './maps/TextMap';
import { TextMapParser } from './maps/TextMapParser';
import { TextMapRenderer } from './maps/TextMapRenderer';

export class LevelGenerator {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public async loadMap(mapName: string): Promise<void> {
        try {
            // Check if this is a TextMap file (.textmap extension)
            if (mapName.endsWith('.textmap') || await this.isTextMap(mapName)) {
                await this.loadTextMap(mapName);
                return;
            }

            // Load map JSON file using dynamic import (Vite handles this)
            const mapModule = await import(`./maps/${mapName}.json`);
            const mapData = mapModule.default || mapModule;

            // Determine map type
            if ('blocks' in mapData) {
                // Voxel Map
                const { VoxelMap } = await import('./maps/VoxelMap');
                const { VoxelMapRenderer } = await import('./maps/VoxelMapRenderer');

                const voxelMap = new VoxelMap(this.game, mapData);
                const renderer = new VoxelMapRenderer(this.game, voxelMap);
                renderer.render();

                this.spawnFromVoxelMap(voxelMap);
            } else {
                // Tile Map (Legacy)
                const mapDataTyped: TileMapDefinition = mapData;
                const tileMap = new TileMap(this.game, mapDataTyped);
                const renderer = new MapRenderer(this.game, tileMap);
                renderer.render();

                this.spawnFromTileMap(tileMap);
            }
        } catch (error) {
            console.error(`Failed to load map ${mapName}:`, error);
            // Fallback to random generation
            this.generate();
        }
    }

    /**
     * Check if a map is a TextMap by trying to load the .textmap file.
     */
    private async isTextMap(mapName: string): Promise<boolean> {
        try {
            // Try to import the textmap file
            await import(`./maps/${mapName}.textmap?raw`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Load and render a TextMap file.
     */
    private async loadTextMap(mapName: string): Promise<void> {
        const fileName = mapName.endsWith('.textmap') ? mapName : `${mapName}.textmap`;
        const nameWithoutExt = fileName.replace('.textmap', '');

        try {
            // Import the text file as raw string (Vite handles this)
            const textModule = await import(`./maps/${nameWithoutExt}.textmap?raw`);
            const content = textModule.default || textModule;

            // Parse the TextMap
            const mapData = TextMapParser.parse(content);
            const textMap = new TextMap(this.game, mapData);

            // Render the map
            const renderer = new TextMapRenderer(this.game, textMap);
            renderer.render();

            // Spawn entities
            this.spawnFromTextMap(textMap);

            console.log(`Loaded TextMap: ${mapData.name} v${mapData.version}`);
        } catch (error) {
            console.error(`Failed to load TextMap ${fileName}:`, error);
            throw error;
        }
    }

    /**
     * Spawn entities from a TextMap.
     */
    private spawnFromTextMap(textMap: TextMap): void {
        const spawnPoints = textMap.getSpawnPoints();
        if (spawnPoints.length === 0) return;

        const squadSpawns: { position: THREE.Vector3; name?: string }[] = [];

        for (const spawn of spawnPoints) {
            // Calculate body center height (0.8m above floor)
            const spawnPos = spawn.position.clone();
            spawnPos.y += 0.8; // Body center offset for 1.6m tall entity

            switch (spawn.type) {
                case 'player_spawn':
                    if (this.game.player && this.game.player.body) {
                        this.game.player.body.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
                        console.log(`Player spawned at: ${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z}`);
                    }
                    break;
                case 'enemy_spawn':
                    const enemy = new Enemy(this.game, spawnPos);
                    this.game.addGameObject(enemy);
                    break;
                case 'squad_spawn':
                    squadSpawns.push({ position: spawnPos, name: spawn.name });
                    break;
            }
        }

        // Spawn squad members
        if (squadSpawns.length > 0 && this.game.squadManager) {
            // Clear existing squad members
            this.game.squadManager.members.forEach(member => {
                member.dispose();
            });
            this.game.squadManager.members = [];

            // Spawn new squad members
            squadSpawns.forEach((spawn, index) => {
                const name = spawn.name || `Squad-${index + 1}`;
                const member = new SquadMember(this.game, spawn.position, name);
                this.game.addGameObject(member);
                this.game.squadManager.members.push(member);
            });
        }
    }

    private spawnFromVoxelMap(voxelMap: any) {
        const spawnPoints = voxelMap.getSpawnPoints();
        if (spawnPoints.length === 0) return;

        const squadSpawns: THREE.Vector3[] = [];
        const scale = voxelMap.scale;

        for (const spawn of spawnPoints) {
            // Spawn point y is in grid coords, convert to world: floor surface + body center offset
            const worldPos = new THREE.Vector3(
                spawn.x * scale,
                (spawn.y + 1) * scale + 0.8, // +1 to stand ON the block, +0.8 for body center
                spawn.z * scale
            );

            switch (spawn.type) {
                case 'player':
                    if (this.game.player && this.game.player.body) {
                        this.game.player.body.position.set(worldPos.x, worldPos.y, worldPos.z);
                    }
                    break;
                case 'enemy':
                    const enemy = new Enemy(this.game, worldPos);
                    this.game.addGameObject(enemy);
                    break;
                // Add squad handling if needed
            }
        }
    }

    private spawnFromTileMap(tileMap: TileMap) {
        const spawnPoints = tileMap.getSpawnPoints();
        if (spawnPoints.length === 0) return;

        const squadSpawns: THREE.Vector3[] = [];

        for (const spawn of spawnPoints) {
            switch (spawn.type) {
                case 'player':
                    if (this.game.player && this.game.player.body) {
                        // Player body is a sphere with radius 0.5
                        // Spawn position includes body offset (0.8), but player sphere should be at floor + 0.5
                        // So adjust: floor + 0.8 - 0.3 = floor + 0.5
                        const playerY = spawn.position.y - 0.3;
                        this.game.player.body.position.set(
                            spawn.position.x,
                            Math.max(0.5, playerY), // Ensure minimum height so player doesn't fall through
                            spawn.position.z
                        );
                    }
                    break;
                case 'squad':
                    squadSpawns.push(spawn.position);
                    break;
                case 'enemy':
                    const enemy = new Enemy(this.game, spawn.position);
                    this.game.addGameObject(enemy);
                    break;
            }
        }

        // Spawn squad members at their spawn points
        if (squadSpawns.length > 0 && this.game.squadManager) {
            // Clear existing squad members
            this.game.squadManager.members.forEach(member => {
                member.dispose();
            });
            this.game.squadManager.members = [];

            // Spawn new squad members
            squadSpawns.forEach((pos, index) => {
                const member = new SquadMember(this.game, pos, `Squad-${index + 1}`);
                this.game.addGameObject(member);
                this.game.squadManager.members.push(member);
            });
        }
    }

    public generate(playerTarget?: GameObject) {
        // Floor
        this.createBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(50, 1, 50), 0);

        // Random Walls
        for (let i = 0; i < 20; i++) {
            const x = (Math.random() - 0.5) * 40;
            const z = (Math.random() - 0.5) * 40;
            // Don't spawn on spawn point
            if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

            // 30% chance of Destructible Wall
            if (Math.random() < 0.3) {
                const w = 2 + Math.random() * 2;
                const h = 2 + Math.random() * 2;
                new DestructibleWall(this.game, new THREE.Vector3(x, 0, z), w, h);
            } else {
                const w = 1 + Math.random() * 5;
                const h = 2 + Math.random() * 3;
                const d = 1 + Math.random() * 5;
                this.createBox(new THREE.Vector3(x, h / 2, z), new THREE.Vector3(w, h, d), 0);
            }
        }

        // Random Enemies
        if (playerTarget) {
            for (let i = 0; i < 5; i++) {
                const x = (Math.random() - 0.5) * 30;
                const z = (Math.random() - 0.5) * 30;
                // Avoid spawn
                if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

                const enemy = new Enemy(this.game, new THREE.Vector3(x, 1, z));
                // AI automatically targets player via Game.player
                this.game.addGameObject(enemy);
            }
        }
    }

    private createBox(pos: THREE.Vector3, size: THREE.Vector3, mass: number = 0) {
        const go = new GameObject(this.game);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        go.body = new CANNON.Body({
            mass: mass,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape
        });

        // Visuals
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }
}
