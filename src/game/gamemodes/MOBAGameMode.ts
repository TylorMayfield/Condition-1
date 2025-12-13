import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameMode, type ScoreData } from './GameMode';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Tower } from '../entities/Tower';
import { Minion } from '../entities/Minion';
import { Enemy } from '../Enemy';

/**
 * MOBA Game Mode - 3 Lane Tower Attack
 * Similar to League of Legends
 * - 3 lanes (Top, Mid, Bottom)
 * - Towers defend each lane
 * - Minions spawn and push lanes
 * - Win by destroying enemy Nexus
 */
export class MOBAGameMode extends GameMode {
    // Lane definitions (paths from base to base)
    private lanes: { [lane: string]: THREE.Vector3[] } = {
        'top': [],
        'mid': [],
        'bot': []
    };

    // Tower positions per lane
    private towerPositions: { [lane: string]: THREE.Vector3[] } = {
        'top': [],
        'mid': [],
        'bot': []
    };

    // Active entities
    private towers: Tower[] = [];
    private minions: Minion[] = [];
    private nexus: { blue: GameObject | null, red: GameObject | null } = { blue: null, red: null };

    // Game state
    private gameActive: boolean = false;
    private minionSpawnTimer: number = 0;
    private minionSpawnInterval: number = 30; // Spawn every 30 seconds
    private waveNumber: number = 0;

    // Teams
    private readonly BLUE_TEAM = 'Blue';
    private readonly RED_TEAM = 'Red';

    constructor(game: Game) {
        super(game);
        this.generateLanes();
    }

    public init(): void {
        console.log("Initializing MOBA Game Mode");
        this.gameActive = true;
        this.waveNumber = 0;
        this.minionSpawnTimer = 0;
        
        // Spawn player at blue base
        if (this.game.player) {
            const spawnPos = new THREE.Vector3(-50, 2, 0);
            this.game.player.respawn(spawnPos);
            this.game.player.team = this.BLUE_TEAM;
        }
        
        // Spawn enemy bots (red team)
        this.spawnEnemyBots();
        
        // Spawn initial towers
        this.spawnTowers();
        
        // Spawn nexus
        this.spawnNexus();
        
        // Spawn first wave immediately
        this.spawnMinionWave();
    }
    
    private spawnEnemyBots(): void {
        // Spawn 3 enemy bots (one per lane) to fight the player
        const botSpawns = [
            new THREE.Vector3(50, 2, 20),   // Top lane
            new THREE.Vector3(50, 2, 0),    // Mid lane
            new THREE.Vector3(50, 2, -20)   // Bot lane
        ];
        
        botSpawns.forEach((spawn, index) => {
            const bot = new Enemy(this.game, spawn, this.RED_TEAM, `Red Bot ${index + 1}`);
            this.game.addGameObject(bot);
        });
        
        console.log(`[MOBA] Spawned ${botSpawns.length} enemy bots`);
    }

    public update(dt: number): void {
        if (!this.gameActive) return;

        // Update towers (they're GameObjects so they update automatically, but we track them here)
        // Filter out destroyed towers
        this.towers = this.towers.filter(tower => {
            if (tower.health <= 0) {
                return false;
            }
            return true;
        });

        // Update minions - filter out dead ones (they handle their own cleanup)
        this.minions = this.minions.filter(minion => {
            return minion.health > 0;
        });

        // Spawn minion waves
        this.minionSpawnTimer += dt;
        if (this.minionSpawnTimer >= this.minionSpawnInterval) {
            this.minionSpawnTimer = 0;
            this.spawnMinionWave();
        }

        // Check win condition
        const winner = this.checkWinCondition();
        if (winner) {
            this.endGame(winner);
        }
    }

    private generateLanes(): void {
        // Generate 3 parallel lanes from one base to another
        // Top lane: Z = 20, X from -50 to 50
        // Mid lane: Z = 0, X from -50 to 50
        // Bot lane: Z = -20, X from -50 to 50
        
        const baseDistance = 100; // Distance between bases
        const segments = 20; // Number of waypoints per lane

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = -baseDistance / 2 + (baseDistance * t);

            // Add curve around towers (at -15 and +15)
            // Towers are approx 3 units wide, assume safe radius 5
            let zOffset = 0;
            if (Math.abs(x - (-15)) < 5 || Math.abs(x - 15) < 5) {
                zOffset = 6; // Go around to the "positive Z" side relative to lane center
            }

            // Top lane
            this.lanes.top.push(new THREE.Vector3(x, 0, 20 + zOffset));
            
            // Mid lane
            this.lanes.mid.push(new THREE.Vector3(x, 0, 0 + zOffset));
            
            // Bot lane
            this.lanes.bot.push(new THREE.Vector3(x, 0, -20 + zOffset));
        }

        // Define tower positions (1 tower per lane per team = 3 per team total)
        // Single tower at mid-point of each lane for each team
        const midPoint = 0; // Center of map
        
        ['top', 'mid', 'bot'].forEach(lane => {
            const z = lane === 'top' ? 20 : (lane === 'mid' ? 0 : -20);
            
            // Blue team tower (left side, at mid-point)
            this.towerPositions[lane].push(new THREE.Vector3(midPoint - 15, 0, z));
            
            // Red team tower (right side, at mid-point)
            this.towerPositions[lane].push(new THREE.Vector3(midPoint + 15, 0, z));
        });
    }

    private spawnTowers(): void {
        // Spawn blue team towers (1 per lane)
        ['top', 'mid', 'bot'].forEach(lane => {
            const positions = this.towerPositions[lane];
            // First half are blue team
            const blueCount = Math.floor(positions.length / 2);
            for (let i = 0; i < blueCount; i++) {
                const tower = new Tower(this.game, positions[i], this.BLUE_TEAM, lane);
                this.game.addGameObject(tower);
                this.towers.push(tower);
            }
            // Second half are red team
            for (let i = blueCount; i < positions.length; i++) {
                const tower = new Tower(this.game, positions[i], this.RED_TEAM, lane);
                this.game.addGameObject(tower);
                this.towers.push(tower);
            }
        });
    }

    private spawnNexus(): void {
        // Blue nexus (left base)
        const blueNexusPos = new THREE.Vector3(-50, 0, 0);
        const blueNexus = this.createNexus(blueNexusPos, this.BLUE_TEAM);
        this.game.addGameObject(blueNexus);
        this.nexus.blue = blueNexus;

        // Red nexus (right base)
        const redNexusPos = new THREE.Vector3(50, 0, 0);
        const redNexus = this.createNexus(redNexusPos, this.RED_TEAM);
        this.game.addGameObject(redNexus);
        this.nexus.red = redNexus;
    }

    private createNexus(position: THREE.Vector3, team: string): GameObject {
        const nexus = new GameObject(this.game);
        nexus.team = team;

        // Visual: Large crystal/pyramid
        const geo = new THREE.ConeGeometry(3, 6, 8);
        const mat = new THREE.MeshStandardMaterial({ 
            color: team === this.BLUE_TEAM ? 0x0066ff : 0xff0000 
        });
        nexus.mesh = new THREE.Mesh(geo, mat);
        nexus.mesh.position.copy(position);
        nexus.mesh.castShadow = true;
        nexus.mesh.receiveShadow = true;

        // Physics: Static body
        // const CANNON = require('cannon-es'); // Use import
        const shape = new CANNON.Box(new CANNON.Vec3(3, 3, 3));
        nexus.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(position.x, position.y + 3, position.z),
            shape: shape
        });

        // Health tracking
        (nexus as any).health = 5000;
        (nexus as any).maxHealth = 5000;

        return nexus;
    }

    private spawnMinionWave(): void {
        this.waveNumber++;
        console.log(`[MOBA] Spawning wave ${this.waveNumber}`);

        // Spawn 2 minions per lane per team
        ['top', 'mid', 'bot'].forEach(lane => {
            // Blue team minions (spawn from left)
            const blueSpawn = this.lanes[lane][0].clone();
            blueSpawn.x -= 5; // Offset slightly
            for (let i = 0; i < 2; i++) {
                const minion = new Minion(this.game, blueSpawn.clone(), this.BLUE_TEAM, lane, this.lanes[lane]);
                this.game.addGameObject(minion);
                this.minions.push(minion);
                blueSpawn.x += 2; // Stagger spawns
            }

            // Red team minions (spawn from right)
            const redSpawn = this.lanes[lane][this.lanes[lane].length - 1].clone();
            redSpawn.x += 5;
            for (let i = 0; i < 2; i++) {
                const minion = new Minion(this.game, redSpawn.clone(), this.RED_TEAM, lane, [...this.lanes[lane]].reverse());
                this.game.addGameObject(minion);
                this.minions.push(minion);
                redSpawn.x -= 2;
            }
        });
    }

    public checkWinCondition(): string | null {
        // Check if either nexus is destroyed
        if (this.nexus.blue && (this.nexus.blue as any).health <= 0) {
            return this.RED_TEAM;
        }
        if (this.nexus.red && (this.nexus.red as any).health <= 0) {
            return this.BLUE_TEAM;
        }
        return null;
    }

    private endGame(winner: string): void {
        this.gameActive = false;
        console.log(`\n=== ${winner} TEAM WINS! ===`);
        alert(`${winner} Team has destroyed the enemy Nexus!\n\nVictory!`);
    }

    public onEntityDeath(victim: GameObject, killer?: GameObject): void {
        // Handle tower/minion deaths
        if (victim instanceof Tower) {
            this.towers = this.towers.filter(t => t !== victim);
            console.log(`[MOBA] Tower destroyed!`);
        } else if (victim instanceof Minion) {
            // Give gold/exp to killer if it's the player
            if (killer === this.game.player) {
                // TODO: Add gold/exp system
            }
        } else if (victim === this.nexus.blue || victim === this.nexus.red) {
            // Nexus destroyed - game over handled in checkWinCondition
        }
    }

    public getScoreboardData(): ScoreData[] {
        const data: ScoreData[] = [];

        // Count towers remaining and show health
        const blueTowers = this.towers.filter(t => t.team === this.BLUE_TEAM && t.health > 0);
        const redTowers = this.towers.filter(t => t.team === this.RED_TEAM && t.health > 0);
        
        const blueTowerCount = blueTowers.length;
        const redTowerCount = redTowers.length;
        
        // Calculate average tower health for display
        const blueAvgHealth = blueTowerCount > 0 
            ? Math.round(blueTowers.reduce((sum, t) => sum + t.health, 0) / blueTowerCount)
            : 0;
        const redAvgHealth = redTowerCount > 0
            ? Math.round(redTowers.reduce((sum, t) => sum + t.health, 0) / redTowerCount)
            : 0;

        data.push({
            name: '=== MOBA Status ===',
            team: '',
            score: 0,
            status: `Wave ${this.waveNumber}`
        });

        data.push({
            name: 'Blue Team',
            team: this.BLUE_TEAM,
            score: blueTowerCount,
            status: `Towers: ${blueTowerCount}/3 | Avg HP: ${blueAvgHealth}`
        });

        data.push({
            name: 'Red Team',
            team: this.RED_TEAM,
            score: redTowerCount,
            status: `Towers: ${redTowerCount}/3 | Avg HP: ${redAvgHealth}`
        });
        
        // Show individual tower healths
        blueTowers.forEach((tower) => {
            const healthPercent = Math.round((tower.health / tower.maxHealth) * 100);
            data.push({
                name: `Blue Tower ${tower.lane}`,
                team: this.BLUE_TEAM,
                score: Math.round(tower.health),
                status: `${healthPercent}%`
            });
        });
        
        redTowers.forEach((tower) => {
            const healthPercent = Math.round((tower.health / tower.maxHealth) * 100);
            data.push({
                name: `Red Tower ${tower.lane}`,
                team: this.RED_TEAM,
                score: Math.round(tower.health),
                status: `${healthPercent}%`
            });
        });

        if (this.game.player) {
            data.push({
                name: 'You',
                team: this.game.player.team || 'Neutral',
                score: 0, // TODO: Add kills/gold
                status: 'Alive'
            });
        }

        return data;
    }

    public getLanePath(lane: string): THREE.Vector3[] {
        return this.lanes[lane] || [];
    }
}

