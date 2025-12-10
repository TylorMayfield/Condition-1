import * as THREE from 'three';
import { GameMode } from './GameMode';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';

export class FreeForAllGameMode extends GameMode {
    public enemyCount: number = 0;
    public maxEnemies: number = 10;
    private spawnTimer: number = 0;

    constructor(game: Game) {
        super(game);
    }

    public init(): void {
        console.log("Initializing Free-For-All Mode");
        // Reset or setup
    }

    public update(dt: number): void {
        this.spawnTimer += dt * 1000;
        
        // Spawn randomly up to limit
        if (this.enemyCount < this.maxEnemies && this.spawnTimer > 1000) {
            this.forceSpawn();
            this.spawnTimer = 0;
        }
    }

    private forceSpawn() {
        // Random Pos
        const angle = Math.random() * Math.PI * 2;
        const radius = 15 + Math.random() * 20;
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        const pos = new THREE.Vector3(x, 0.8, z);

        // Unique team per enemy to ensure FFA
        const uniqueTeam = `Enemy_${Math.floor(Math.random() * 99999)}`;
        const enemy = new Enemy(this.game, pos, uniqueTeam);
        
        this.game.addGameObject(enemy);
        this.registerEntity(enemy);
    }

    public registerEntity(entity: GameObject): void {
        if (entity instanceof Enemy) {
            this.enemyCount++;
        }
    }

    public onEntityDeath(victim: GameObject, killer?: GameObject): void {
        if (victim instanceof Enemy) {
            this.enemyCount--;
        }
    }

    public getScoreboardData(): import('./GameMode').ScoreData[] {
        const data: import('./GameMode').ScoreData[] = [];

        // Add Player
        if (this.game.player) {
            data.push({
                name: 'Player',
                team: 'Blue',
                score: 0, // TODO: Track kills
                status: this.game.player.health > 0 ? 'Alive' : 'Dead'
            });
        }

        // Add Enemies (Iterate game objects for now, ideally strictly tracked list)
        this.game.getGameObjects().forEach(go => {
            if (go instanceof Enemy) {
                data.push({
                    name: go.team || 'Enemy', // Use team as name if generic
                    team: 'Red',
                    score: 0,
                    status: (go as any).health > 0 ? 'Alive' : 'Dead'
                });
            }
        });

        return data;
    }
}
