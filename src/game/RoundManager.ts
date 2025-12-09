import * as THREE from 'three';
import { Game } from '../engine/Game';
import { Enemy } from './Enemy';

export class RoundManager {
    private game: Game;
    public currentRound: number = 0;
    public enemiesAlive: number = 0;
    public enemiesToSpawn: number = 0;

    private spawnTimer: number = 0;
    private spawnInterval: number = 2000; // ms between spawns
    private roundCooldown: number = 0;
    private roundCooldownDuration: number = 5000; // Time between rounds

    constructor(game: Game) {
        this.game = game;
    }

    public startNextRound() {
        this.currentRound++;
        this.enemiesToSpawn = this.currentRound * 2 + 3; // Round 1 = 5, Round 2 = 7, etc.
        this.roundCooldown = 0;
        console.log(`Starting Round ${this.currentRound} - Enemies: ${this.enemiesToSpawn}`);

        // UI notification (Simple console for now, maybe UI later)
        const ui = document.getElementById('round-display');
        if (ui) ui.innerText = `Round ${this.currentRound}`;
    }

    public onEnemyDeath() {
        this.enemiesAlive--;
        if (this.enemiesAlive < 0) this.enemiesAlive = 0; // Safety
    }

    public triggerExtractionSuccess() {
        if (!this.game.isRunning) return;

        console.log("Extraction Successful!");
        alert("Mission Complete! You extracted safely.");

        // Restart or Menu? For now, reload.
        location.reload();
    }

    public update(dt: number) {
        // Round Start Logic
        if (this.enemiesAlive === 0 && this.enemiesToSpawn === 0) {
            this.roundCooldown += dt * 1000;
            if (this.roundCooldown >= this.roundCooldownDuration) {
                this.startNextRound();
            }
            return;
        }

        // Spawning Logic
        if (this.enemiesToSpawn > 0) {
            this.spawnTimer += dt * 1000;
            if (this.spawnTimer >= this.spawnInterval) {
                this.spawnEnemy();
                this.spawnTimer = 0;
            }
        }
    }

    private spawnEnemy() {
        if (this.enemiesToSpawn <= 0) return;

        // Random Spawn Position away from player
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 10; // 20-30m away
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;

        // Ideally check for walls/obstacles, but simple spawn logic for now.
        // We could use LevelGenerator's logic or just spawn high.
        const spawnPos = new THREE.Vector3(x, 0.8, z); // Floor level + body center offset

        const enemy = new Enemy(this.game, spawnPos);
        this.game.addGameObject(enemy);

        this.enemiesToSpawn--;
        this.enemiesAlive++;
    }

    public addEnemy(enemy: Enemy) {
        this.game.addGameObject(enemy);
        this.enemiesAlive++;
    }
}
