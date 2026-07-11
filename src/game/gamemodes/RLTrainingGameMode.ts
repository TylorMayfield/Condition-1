// RL Training Game Mode
// A dedicated game mode for training AI agents using reinforcement learning
// Runs spectate-only TDM rounds and trains bots in real-time

import * as THREE from 'three';

import { GameMode, type ScoreData } from './GameMode';
import { GameModeId } from './GameModeId';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';
import { SpectatorCameraController } from '../controllers/SpectatorCameraController';
import { RLTrainer } from '../rl/RLTrainer';
import type { TrainedBot } from './rl/RLTrainingTypes';
import { buildObservation } from './rl/RLObservation';
import { computeStepReward } from './rl/RLReward';
import { applyRLAction } from './rl/RLAction';

export class RLTrainingGameMode extends GameMode {
    readonly id = GameModeId.RL_TRAINING;

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
            this.hud.showTrainingStats({
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
        const alive = { taskForce: this.taskForceAlive, opFor: this.opForAlive };

        for (const tb of this.trainedBots) {
            if (tb.bot.isDead) continue;

            const obs = buildObservation(tb.bot, alive);

            if (tb.lastObs && tb.lastAction) {
                const reward = computeStepReward(tb.bot, tb, tb.lastObs, obs);
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

            const { action, logProb, value } = this.trainer.predict(obs);

            applyRLAction(tb.bot, action);

            tb.lastObs = obs;
            tb.lastAction = action;
            tb.lastLogProb = logProb;
            tb.lastValue = value;
        }
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
        this.hud.hideTrainingStats();

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
