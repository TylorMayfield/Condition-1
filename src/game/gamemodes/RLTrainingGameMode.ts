// RL Training Game Mode
// A dedicated game mode for training AI agents using reinforcement learning
// Runs spectate-only TDM rounds and trains bots in real-time

import * as THREE from 'three';
// import * as CANNON from 'cannon-es'; // Unused until physics raycast implemented

import { GameMode, type ScoreData } from './GameMode';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';
import { SpectatorCameraController } from '../controllers/SpectatorCameraController';
import { RLTrainer } from '../rl/RLTrainer';
import type { Observation, Action } from '../rl/EnvWrapper';

interface TrainedBot {
    bot: Enemy;
    lastObs: Observation | null;
    lastAction: Action | null;
    lastLogProb: number;
    lastValue: number;
    // Track damage for reward calculation
    lastEnemyDamage: number;    // Damage dealt to enemies
    lastFriendlyDamage: number; // Friendly fire (negative reward)
    // Exploration tracking
    spawnPosition: THREE.Vector3;
    stuckTimer: number; // Time spent not moving significantly
}

export class RLTrainingGameMode extends GameMode {
    // Training components
    private trainer: RLTrainer;
    private trainedBots: TrainedBot[] = [];

    // Spectator
    private spectatorController: SpectatorCameraController;

    // Round configuration
    public botsPerTeam: number = 3;       // Smaller teams for faster training
    public maxRounds: number = 1000;      // Training rounds
    public roundTimeLimit: number = 60;   // Seconds per round
    public autoSaveInterval: number = 10; // Save model every N rounds

    // Round state
    private roundActive: boolean = false;
    private roundNumber: number = 0;
    private roundTimer: number = 0;

    // Entity tracking
    private taskForceAlive: Set<Enemy> = new Set();
    private opForAlive: Set<Enemy> = new Set();

    // Spawn points (set from map)
    private taskForceSpawns: THREE.Vector3[] = [];
    private opForSpawns: THREE.Vector3[] = [];

    // Statistics
    public trainingActive: boolean = false;
    // private roundStartTime: number = 0;
    private totalTrainingTime: number = 0;
    private roundRewards: number[] = []; // Track rewards per round for visualization
    private lastHUDUpdate: number = 0; // Throttle HUD updates


    constructor(game: Game, config?: { botsPerTeam?: number; roundDurationSeconds?: number }) {
        super(game);
        this.spectatorController = new SpectatorCameraController(game);
        this.trainer = new RLTrainer();

        // Apply config
        if (config?.botsPerTeam) {
            this.botsPerTeam = config.botsPerTeam;
        }
        if (config?.roundDurationSeconds) {
            this.roundTimeLimit = config.roundDurationSeconds;
        }
    }


    public init(): void {
        console.log("[RLTraining] Initializing RL Training Mode");
        this.roundNumber = 0;
        this.trainingActive = true;

        // Set up spawn points from map
        this.setupSpawnPoints();

        // Put player into spectator mode (training is spectate-only)
        if (this.game.player) {
            this.game.player.isSpectating = true;
            // Hide the player by moving them far away or disabling
            if (this.game.player.body) {
                this.game.player.body.position.set(0, -1000, 0);
            }
        }

        // Start first round immediately
        this.startNewRound();
    }

    private setupSpawnPoints(): void {
        // Use map spawn points if available, otherwise fall back to defaults
        const ctSpawns = this.game.availableSpawns?.CT || [];
        const tSpawns = this.game.availableSpawns?.T || [];

        // TaskForce uses CT spawns
        if (ctSpawns.length > 0) {
            this.taskForceSpawns = ctSpawns.map(s => s.clone());
            console.log(`[RLTraining] Using ${ctSpawns.length} CT spawn points for TaskForce`);
        } else {
            // Fallback to default spawns
            console.warn("[RLTraining] No CT spawns found, using default positions");
            for (let i = 0; i < this.botsPerTeam; i++) {
                this.taskForceSpawns.push(new THREE.Vector3(-20 + Math.random() * 5, 1, i * 3));
            }
        }

        // OpFor uses T spawns
        if (tSpawns.length > 0) {
            this.opForSpawns = tSpawns.map(s => s.clone());
            console.log(`[RLTraining] Using ${tSpawns.length} T spawn points for OpFor`);
        } else {
            // Fallback to default spawns
            console.warn("[RLTraining] No T spawns found, using default positions");
            for (let i = 0; i < this.botsPerTeam; i++) {
                this.opForSpawns.push(new THREE.Vector3(20 + Math.random() * 5, 1, i * 3));
            }
        }
    }

    public update(dt: number): void {
        if (!this.trainingActive) return;

        // Update spectator camera
        this.spectatorController.update(dt);

        // Input Handling for Training Controls
        if (this.game.input.getKeyDown('Digit6')) this.game.timeScale = 1;
        if (this.game.input.getKeyDown('Digit7')) this.game.timeScale = 5;
        if (this.game.input.getKeyDown('Digit8')) this.game.timeScale = 20;
        if (this.game.input.getKeyDown('Digit9')) this.game.timeScale = 100;
        if (this.game.input.getKeyDown('Digit0')) this.game.renderingEnabled = !this.game.renderingEnabled;

        // Update training stats HUD (Throttled to ~10Hz to prevent DOM thrashing)
        const now = Date.now();
        if (now - this.lastHUDUpdate > 100) {
            this.lastHUDUpdate = now;
            const stats = this.trainer.getStats();
            (this.game.hudManager as any).showTrainingStats({
                round: this.roundNumber,
                maxRounds: this.maxRounds,
                avgReward: stats.avgReward,
                trainingSteps: stats.trainingSteps,
                experienceCount: this.trainer.getExperienceCount(),
                bufferSize: 2048,
                simTimeLeft: Math.ceil(this.roundTimer)
            });
        }

        if (this.roundActive) {
            // Update training for all bots
            this.updateTraining();

            // Update round timer
            this.roundTimer -= dt;

            // Check for round end conditions
            if (this.taskForceAlive.size === 0 ||
                this.opForAlive.size === 0 ||
                this.roundTimer <= 0) {
                this.endRound();
            }
        }
    }

    private updateTraining(): void {
        for (const tb of this.trainedBots) {
            if (tb.bot.isDead) continue;

            // Get current observation
            const obs = this.buildObservation(tb.bot);

            // If we have previous state, store experience
            if (tb.lastObs && tb.lastAction) {
                const reward = this.computeReward(tb.bot, tb.lastObs, obs);
                this.trainer.storeExperience(
                    tb.lastObs,
                    tb.lastAction,
                    reward,
                    obs,
                    tb.bot.isDead,
                    tb.lastLogProb,
                    tb.lastValue
                );
            }

            // Get action from trainer
            const { action, logProb, value } = this.trainer.predict(obs);

            // Apply action
            this.applyAction(tb.bot, action);

            // Store for next step
            tb.lastObs = obs;
            tb.lastAction = action;
            tb.lastLogProb = logProb;
            tb.lastValue = value;
        }
    }

    private buildObservation(bot: Enemy): Observation {
        const body = bot.body;
        const pos = body ? body.position : { x: 0, y: 0, z: 0 };
        const vel = body ? body.velocity : { x: 0, y: 0, z: 0 };

        // Raycast for cover/threat detection
        const coverDist = this.raycastCover(bot);
        const isUnderFire = bot.isUnderFire ? 1 : 0;

        return {
            position: [pos.x, pos.y, pos.z],
            velocity: [vel.x, vel.y, vel.z],
            health: bot.health,
            armor: 0,
            weaponId: 0,
            ammo: (bot.weapon as any)?.currentAmmo ?? 30,
            crouch: (bot as any).isProne ? 1 : 0, // Assuming isProne tracks crouch/prone state
            grenades: 0, // Should be tracked on bot
            team: bot.team === 'TaskForce' ? 0 : 1,
            visionGrid: this.buildVisionGrid(bot),
            coverDistance: coverDist,
            isUnderFire: isUnderFire
        };
    }

    private buildVisionGrid(bot: Enemy): number[] {
        const grid = new Array(32 * 32).fill(0);
        const botPos = bot.body?.position;
        if (!botPos) return grid;

        // Mark positions of other bots in the grid
        const allBots = Array.from(this.taskForceAlive).concat(Array.from(this.opForAlive));
        for (const other of allBots) {
            if (other === bot) continue;
            const otherPos = other.body?.position;
            if (!otherPos) continue;

            const dx = otherPos.x - botPos.x;
            const dz = otherPos.z - botPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 50) continue;

            const gridX = Math.floor((dx + 32) / 2);
            const gridZ = Math.floor((dz + 32) / 2);

            if (gridX >= 0 && gridX < 32 && gridZ >= 0 && gridZ < 32) {
                const idx = gridZ * 32 + gridX;
                grid[idx] = other.team === bot.team ? 1 : 2;
            }
        }
        return grid;
    }

    private raycastCover(bot: Enemy): number {
        // Simple raycast check in 8 directions to find nearest obstacle
        // Returns normalized distance (0 = touching cover, 1 = no cover near)
        if (!bot.body) return 1;
        
        const start = new THREE.Vector3(bot.body.position.x, bot.body.position.y, bot.body.position.z);
        const directions = [
            new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(1, 0, 1), new THREE.Vector3(-1, 0, -1),
            new THREE.Vector3(1, 0, -1), new THREE.Vector3(-1, 0, 1)
        ];

        // let minDist = 10; // Max check distance

        const raycaster = new THREE.Raycaster();
        
        for (const dir of directions) {
            raycaster.set(start, dir.normalize());
            // This requires access to scene meshes. 
            // Optimally we'd use physics world raycast, but THREE raycast is easier if we have "Level" group.
            // For now, let's assume we can raycast against map geometry if available, 
            // or use physics world. Physics world is safer.
            
            // Unused currently, but intended for physics raycast
            /*
            const result = new CANNON.Ray(
                new CANNON.Vec3(start.x, start.y, start.z),
                new CANNON.Vec3(start.x + dir.x * 10, start.y + dir.y * 10, start.z + dir.z * 10)
            );
            */
            
            // Perform raycase (simplified - requires proper world.raycastAny or similar)
            // Since CANNON raycasting can be verbose, let's skip actual physics query in this snippet due to complexity
            // without seeing World wrapper.
            // Fallback: Return 1 (no cover) unless implemented. 
            // TODO: Implement proper physics raycast here.
        }
        
        return 1; // Placeholder until physics raycast is robust
    }

    private computeReward(bot: Enemy, prevObs: Observation, currObs: Observation): number {
        let reward = 0;

        const tb = this.trainedBots.find(t => t.bot === bot);
        if (!tb) return 0;

        // --- COMBAT REWARDS ---
        
        // Damage Dealt (Huge incentive)
        const enemyDamage = bot.enemyDamageDealt;
        const newEnemyDamage = enemyDamage - tb.lastEnemyDamage;
        if (newEnemyDamage > 0) {
            reward += newEnemyDamage * 0.5; // +0.5 per damage point (50 for kill basically)
        }
        
        // Friendly Fire (Penalty)
        const friendlyDamage = bot.friendlyDamageDealt;
        const newFriendlyDamage = friendlyDamage - tb.lastFriendlyDamage;
        if (newFriendlyDamage > 0) {
            reward -= newFriendlyDamage * 1.0; 
        }

        tb.lastEnemyDamage = enemyDamage;
        tb.lastFriendlyDamage = friendlyDamage;

        // Kills (If tracked directly on bot, or infer from massive damage jump?)
        // Damage reward covers kills mostly, but a kill bonus is nice.
        // We lack explicit "kill count" on bot class currently, but can check "score".
        // Let's rely on damage for now.

        // --- SURVIVAL ---
        
        // Taking Damage
        const healthLost = prevObs.health - currObs.health;
        if (healthLost > 0) {
            reward -= healthLost * 0.2; // Penalty for getting hit
        }
        
        // Death
        if (bot.isDead) {
            reward -= 50; // Big penalty
        }

        // --- TACTICAL BEHAVIOR ---

        // Cover Usage
        // If under fire, reward being near cover
        if (currObs.isUnderFire && currObs.coverDistance < 0.2) {
            reward += 1.0; // Good job taking cover!
        }

        // Leaning
        // If shooting (Action not in obs directly, but we can infer or pass it if needed)
        // For now, small random reward for leaning while under fire?
        // Hard to reward without context of "peeking". 
        
        // Crouching
        // Reward crouching if under fire
        if (currObs.isUnderFire && currObs.crouch) {
            reward += 0.5;
        }

        // Movement
        // Small penalty for existing implies urgency, but we want survival.
        // Slight movement reward to prevent camping forever?
        // Actually, camping is a valid tactic if winning. 
        // Remove "Start Distance" reward as it encourages running blindly.
        
        return Math.max(-100, Math.min(100, reward));
    }

    private applyAction(bot: Enemy, action: Action): void {
        const baseSpeed = 5;
        const speed = action.sprint > 0.5 ? baseSpeed * 1.5 : baseSpeed;
        
        const body = bot.body;
        const mesh = bot.mesh;

        if (body) {
            body.velocity.x = action.moveX * speed;
            body.velocity.z = action.moveZ * speed;
            if (action.jump > 0.5) bot.jump();
        }

        if (mesh) {
            mesh.rotation.y = action.yaw;
        }

        bot.setLookAngles(action.yaw, action.pitch);

        // Lean
        if (bot.lean) bot.lean(action.lean);

        if (action.fire > 0.5) bot.fireAtLookDirection();
        if (action.throwGrenade > 0.5) bot.throwGrenade();
        if (action.crouchToggle > 0.5) bot.toggleCrouch();
    }

    private startNewRound(): void {
        console.log(`[RLTraining] Starting round ${this.roundNumber + 1}/${this.maxRounds}`);

        // Clean up previous round
        this.cleanupRound();

        // Spawn bots
        this.spawnBots();

        // Reset round state
        this.roundNumber++;
        this.roundTimer = this.roundTimeLimit;
        this.roundActive = true;
        // this.roundStartTime = Date.now(); // Track round duration

        // Update spectator targets
        this.updateSpectatorTargets();
    }

    private spawnBots(): void {
        // Spawn TaskForce
        for (let i = 0; i < this.botsPerTeam; i++) {
            const pos = this.taskForceSpawns[i % this.taskForceSpawns.length].clone();
            const bot = new Enemy(this.game, pos, 'TaskForce', `TF-${i + 1}`);
            this.game.addGameObject(bot);
            this.taskForceAlive.add(bot);

            // Disable autonomous AI for training
            if (bot.ai) {
                bot.ai.externalControl = true;
            }

            // Register for training
            this.trainedBots.push({
                bot,
                lastObs: null,
                lastAction: null,
                lastLogProb: 0,
                lastValue: 0,
                lastEnemyDamage: 0,
                lastFriendlyDamage: 0,
                spawnPosition: pos.clone(),
                stuckTimer: 0
            });
        }

        // Spawn OpFor
        for (let i = 0; i < this.botsPerTeam; i++) {
            const pos = this.opForSpawns[i % this.opForSpawns.length].clone();
            const bot = new Enemy(this.game, pos, 'OpFor', `OF-${i + 1}`);
            this.game.addGameObject(bot);
            this.opForAlive.add(bot);

            // Disable autonomous AI for training
            if (bot.ai) {
                bot.ai.externalControl = true;
            }

            this.trainedBots.push({
                bot,
                lastObs: null,
                lastAction: null,
                lastLogProb: 0,
                lastValue: 0,
                lastEnemyDamage: 0,
                lastFriendlyDamage: 0,
                spawnPosition: pos.clone(),
                stuckTimer: 0
            });
        }
    }

    private endRound(): void {
        this.roundActive = false;

        // --- ROUND WIN BONUS ---
        // Determine winner: team with survivors wins
        const taskForceWon = this.taskForceAlive.size > 0 && this.opForAlive.size === 0;
        const opForWon = this.opForAlive.size > 0 && this.taskForceAlive.size === 0;
        // Draw if timeout with both alive or both dead

        // Give round win bonus/penalty to all bots via experience buffer
        for (const tb of this.trainedBots) {
            if (!tb.lastObs || !tb.lastAction) continue;

            let roundBonus = 0;
            if (tb.bot.team === 'TaskForce' && taskForceWon) {
                roundBonus = 50; // Big bonus for winning
            } else if (tb.bot.team === 'OpFor' && opForWon) {
                roundBonus = 50;
            } else if (tb.bot.team === 'TaskForce' && opForWon) {
                roundBonus = -10; // Small penalty for losing
            } else if (tb.bot.team === 'OpFor' && taskForceWon) {
                roundBonus = -10;
            }
            // Draw: no bonus/penalty

            if (roundBonus !== 0) {
                // Store final experience with round bonus included
                this.trainer.storeExperience(
                    tb.lastObs,
                    tb.lastAction,
                    roundBonus,
                    tb.lastObs, // Terminal state
                    true, // Episode done
                    tb.lastLogProb,
                    tb.lastValue
                );
            }
        }

        // Notify trainer of episode end
        this.trainer.endEpisode();

        // Log detailed stats
        const stats = this.trainer.getStats();
        const winner = taskForceWon ? 'TaskForce' : (opForWon ? 'OpFor' : 'Draw');
        
        // Calculate sim duration: (limit - remaining)
        const roundDuration = this.roundTimeLimit - Math.max(0, this.roundTimer);
        
        this.totalTrainingTime += roundDuration;
        this.roundRewards.push(stats.avgReward);

        // Detailed logging
        console.log(`\n╔════════════════════════════════════════════════════════════╗`);
        console.log(`║  🧠 RL TRAINING - ROUND ${this.roundNumber}/${this.maxRounds} COMPLETE`);
        console.log(`╠════════════════════════════════════════════════════════════╣`);
        console.log(`║  Winner: ${winner.padEnd(15)} | Round Time: ${roundDuration.toFixed(1)}s`);
        console.log(`║  Avg Reward: ${stats.avgReward.toFixed(2).padStart(8)} | Training Steps: ${stats.trainingSteps}`);
        console.log(`║  Experience Buffer: ${this.trainer.getExperienceCount()} samples`);
        console.log(`║  Total Training Time: ${(this.totalTrainingTime / 60).toFixed(1)} min`);
        console.log(`╚════════════════════════════════════════════════════════════╝\n`);

        // AUTO-SAVE: Save model periodically
        if (this.roundNumber % this.autoSaveInterval === 0) {
            console.log(`[RLTraining] 💾 Auto-saving model at round ${this.roundNumber}...`);
            this.trainer.saveModel('trained-bot').then(() => {
                console.log(`[RLTraining] ✅ Model auto-saved to localStorage`);
            });
        }

        // Check if training is complete
        if (this.roundNumber >= this.maxRounds) {
            this.finishTraining();
            return;
        }

        // Start next round after a brief delay
        setTimeout(() => this.startNewRound(), 1000);
    }

    private async finishTraining(): Promise<void> {
        console.log("[RLTraining] Training complete!");
        this.trainingActive = false;

        // Hide stats UI
        (this.game.hudManager as any).hideTrainingStats();

        // Save the model
        await this.trainer.saveModel('trained-bot');
        console.log("[RLTraining] Model saved to browser storage");
    }

    private cleanupRound(): void {
        // Dispose existing bots
        for (const tb of this.trainedBots) {
            if (tb.bot.body) this.game.world.removeBody(tb.bot.body);
            if (tb.bot.mesh) this.game.scene.remove(tb.bot.mesh);
            this.game.removeGameObject(tb.bot);
            tb.bot.dispose();
        }

        this.trainedBots = [];
        this.taskForceAlive.clear();
        this.opForAlive.clear();
    }

    private updateSpectatorTargets(): void {
        const targets: GameObject[] = Array.from(this.taskForceAlive).concat(Array.from(this.opForAlive));
        this.spectatorController.setTargets(targets);
    }

    public onEntityDeath(entity: GameObject): void {
        if (entity instanceof Enemy) {
            this.taskForceAlive.delete(entity);
            this.opForAlive.delete(entity);
            this.updateSpectatorTargets();
        }
    }

    public getScoreboardData(): ScoreData[] {
        const data: ScoreData[] = [];
        const stats = this.trainer.getStats();

        // Show training stats as header row
        data.push({
            name: `🧠 Training`,
            team: 'RL',
            score: stats.trainingSteps,
            status: `Ep ${this.roundNumber}/${this.maxRounds} | Avg: ${stats.avgReward.toFixed(1)}`
        });

        // Show TaskForce bots
        for (const tb of this.trainedBots) {
            if (tb.bot.team === 'TaskForce') {
                data.push({
                    name: tb.bot.name,
                    team: 'TaskForce',
                    score: Math.round(tb.bot.damageDealt),
                    status: tb.bot.isDead ? 'Dead' : `HP: ${Math.round(tb.bot.health)}`
                });
            }
        }

        // Show OpFor bots
        for (const tb of this.trainedBots) {
            if (tb.bot.team === 'OpFor') {
                data.push({
                    name: tb.bot.name,
                    team: 'OpFor',
                    score: Math.round(tb.bot.damageDealt),
                    status: tb.bot.isDead ? 'Dead' : `HP: ${Math.round(tb.bot.health)}`
                });
            }
        }

        return data;
    }

    public getStats() {
        return this.trainer.getStats();
    }

    public async loadTrainedModel(): Promise<boolean> {
        return await this.trainer.loadModel('trained-bot');
    }

    /** Download trained model as a JSON file */
    public async downloadModel(filename: string = 'trained-bot-model'): Promise<void> {
        await this.trainer.saveModelToPath(filename);
    }

    /** Load model from a file (via file input element) */
    public async loadModelFromFile(file: File): Promise<boolean> {
        return await this.trainer.loadModelFromFile(file);
    }

    /** Create a file input for loading models */
    public createModelFileInput(): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files[0]) {
                const success = await this.loadModelFromFile(target.files[0]);
                if (success) {
                    console.log('[RLTraining] Model loaded from file!');
                }
            }
        };
        return input;
    }

    public dispose(): void {
        this.cleanupRound();
        this.trainer.dispose();
    }
}
