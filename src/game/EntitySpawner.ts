import * as THREE from 'three';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { Enemy } from './Enemy';
import { SquadMember } from './SquadMember';
import type { BrushMap } from './maps/BrushMap';
import type { TextMap } from './maps/TextMap';

interface SpawnPoint {
    position: THREE.Vector3;
    name?: string;
}

export class EntitySpawner {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public spawnPlayer(position?: THREE.Vector3): GameObject {
        const spawnPos = position || new THREE.Vector3(0, 2, 0);

        if (this.game.player) {
            this.game.player.moveTo(spawnPos);
            return this.game.player;
        }

        throw new Error('Player not initialized');
    }

    public spawnFromBrushMap(brushMap: BrushMap): void {
        // Find spawn points
        const playerSpawns: SpawnPoint[] = [];
        const enemySpawns: SpawnPoint[] = [];
        const friendlySpawns: SpawnPoint[] = [];

        const entities = brushMap.getEntities();
        if (entities && entities.length > 0) {
            for (const entity of entities) {
                const pos = new THREE.Vector3(
                    entity.position.x,
                    entity.position.y,
                    entity.position.z
                );

                if (entity.type === 'player_spawn') {
                    playerSpawns.push({ position: pos });
                } else if (entity.type === 'enemy_spawn') {
                    enemySpawns.push({ position: pos, name: entity.name });
                } else if (entity.type === 'squad_spawn') {
                    friendlySpawns.push({ position: pos, name: entity.name });
                }
            }
        }

        // Spawn player
        if (playerSpawns.length > 0) {
            this.spawnPlayer(playerSpawns[0].position);
        }

        // Spawn enemies
        this.spawnEnemies(enemySpawns);

        // Spawn friendlies
        this.spawnFriendlies(friendlySpawns);
    }

    public spawnFromTextMap(textMap: TextMap): void {
        const playerSpawns: SpawnPoint[] = [];
        const enemySpawns: SpawnPoint[] = [];
        const friendlySpawns: SpawnPoint[] = [];

        const entities = textMap.getEntities();
        if (entities && entities.length > 0) {
            for (const entity of entities) {
                const pos = new THREE.Vector3(
                    entity.position.x,
                    entity.position.y,
                    entity.position.z
                );

                if (entity.type === 'player_spawn') {
                    playerSpawns.push({ position: pos });
                } else if (entity.type === 'enemy_spawn') {
                    enemySpawns.push({ position: pos, name: entity.name });
                } else if (entity.type === 'squad_spawn') {
                    friendlySpawns.push({ position: pos, name: entity.name });
                }
            }
        }

        // Spawn player
        if (playerSpawns.length > 0) {
            this.spawnPlayer(playerSpawns[0].position);
        }

        // Spawn enemies
        this.spawnEnemies(enemySpawns);

        // Spawn friendlies
        this.spawnFriendlies(friendlySpawns);
    }

    private spawnEnemies(spawns: SpawnPoint[]): void {
        for (const spawn of spawns) {
            const enemy = new Enemy(this.game, spawn.position);
            this.game.roundManager?.addEnemy(enemy);
        }
        console.log(`Spawned ${spawns.length} enemies`);
    }

    private spawnFriendlies(spawns: SpawnPoint[]): void {
        for (const spawn of spawns) {
            const friendly = new SquadMember(this.game, spawn.position, spawn.name || 'Friendly');
            this.game.squadManager?.addMember(friendly);
        }
        console.log(`Spawned ${spawns.length} friendlies`);
    }
}
