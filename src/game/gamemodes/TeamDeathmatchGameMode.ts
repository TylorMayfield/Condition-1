
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameMode, type ScoreData } from './GameMode';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';
import { SpectatorCameraController } from '../controllers/SpectatorCameraController';

/**
 * Round-Based Team Deathmatch
 * - No respawning during a round
 * - Round ends when all members of a team are eliminated
 * - Winning team gets a round point
 * - Game ends when a team reaches roundLimit wins
 */
interface Participant {
    id: string; // Unique, use uuid or just name if unique
    name: string;
    team: string; // 'TaskForce' or 'OpFor'
    status: 'Alive' | 'Dead';
    score: number; // Kills/Damage
    objectRef: GameObject | null; // Null if dead/disposed
}

export class TeamDeathmatchGameMode extends GameMode {
    // Round wins per team
    // ...

    // Persistent Scoreboard Data
    private participants: Participant[] = [];
    public roundWins: { [team: string]: number } = {
        'TaskForce': 0,
        'OpFor': 0
    };

    /** Stores cumulative damage/score by participant ID (Name) throughout the match */
    private persistentScores: Map<string, number> = new Map();

    // Round configuration
    public roundLimit: number = 5; // First to 5 wins
    public botsPerTeam: number = 5; // 5 vs 5 target
    public roundTimeLimit: number = 300; // 5 minutes per round in seconds

    // Round state
    private roundActive: boolean = false;
    private roundNumber: number = 0;
    private roundEndTimer: number = 0;
    private roundEndDelay: number = 3; // Seconds before countdown starts
    private isGameOver: boolean = false;
    private roundTimer: number = 0; // Current round time remaining

    // Spectator state
    public isSpectatorOnly: boolean = false; // Toggle this to true for Spectate Only mode
    private isSpectating: boolean = false;
    private spectatorController: SpectatorCameraController;

    // Countdown state
    private countdownActive: boolean = false;
    private countdownTimer: number = 0;
    private readonly countdownDuration: number = 5; // 5 second countdown

    // Track entities for this round (no respawning)
    private taskForceAlive: Set<GameObject> = new Set();
    private opForAlive: Set<GameObject> = new Set();

    constructor(game: Game) {
        super(game);
        this.spectatorController = new SpectatorCameraController(game);
    }

    public init(): void {
        console.log("Initializing Round-Based Team Deathmatch");
        this.roundWins['TaskForce'] = 0;
        this.roundWins['OpFor'] = 0;
        this.persistentScores.clear();
        this.roundNumber = 0;
        this.isGameOver = false;

        // Ensure clean state immediately to remove any HMR leftovers
        this.onRoundCleanup();

        // Reset spectating state (unless spectator only mode is on, handled in startNewRound)
        this.isSpectating = false;
    }

    public update(dt: number): void {
        if (this.isGameOver) return;

        // Spectator Update
        if (this.isSpectating) {
            this.spectatorController.update(dt);
        }

        // Handle countdown phase
        if (this.countdownActive) {
            this.countdownTimer -= dt;
            const secondsLeft = Math.ceil(this.countdownTimer);
            this.onCountdownTick(secondsLeft);

            if (this.countdownTimer <= 0) {
                this.countdownActive = false;
                this.roundActive = true;
                this.aiEnabled = true;
                this.onCountdownEnd();
            }
            return;
        }

        // If round is not active and not in countdown, we're in between rounds
        if (!this.roundActive) {
            this.roundEndTimer += dt;
            if (this.roundNumber === 0 || this.roundEndTimer >= this.roundEndDelay) {
                this.startNewRound();
            }
            return;
        }

        // Update round timer during active round
        this.roundTimer -= dt;
        (this.game.hudManager as any).showRoundTimer(this.getFormattedRoundTime());

        // Check for round timeout
        if (this.roundTimer <= 0) {
            (this.game.hudManager as any).hideRoundTimer();
            this.onRoundTimeout();
            return;
        }

        // Check for round end condition using hook
        const winner = this.checkWinCondition();
        if (winner !== null) {
            this.endRound(winner);
        }
    }

    private startNewRound(): void {
        this.onRoundCleanup(); // Clean up previous round

        this.roundNumber++;
        this.roundEndTimer = 0;
        this.aiEnabled = false;
        this.taskForceAlive.clear();
        this.opForAlive.clear();

        // Restore scores before spawning
        this.onRestoreScores();

        // Spawn teams
        this.spawnTeams();

        // Handle player spawn/spectator
        if (this.game.player) {
            if (!this.isSpectatorOnly) {
                const spawnPos = this.getSpawnPosition('TaskForce', false) || new THREE.Vector3(0, 10, 0);
                if (this.onBeforeSpawn(this.game.player, spawnPos)) {
                    this.game.player.respawn(spawnPos);
                    this.taskForceAlive.add(this.game.player);
                    this.isSpectating = false;
                    this.onAfterSpawn(this.game.player);
                }
            } else {
                this.onEnterSpectator();
            }
        }

        // Start countdown
        this.countdownActive = true;
        this.countdownTimer = this.countdownDuration;
        this.roundTimer = this.roundTimeLimit;
        this.roundActive = false;
        this.onRoundStart(this.roundNumber);
        this.onCountdownStart(this.countdownDuration);
    }

    public onCountdownStart(_duration: number): void {
        // Hook implementation - can be overridden if needed
    }

    public onCountdownTick(secondsRemaining: number): void {
        (this.game.hudManager as any).showCountdown(secondsRemaining);
        if (secondsRemaining <= 5 && secondsRemaining > 0) {
            this.game.soundManager.playAnnouncerFile(`${secondsRemaining}.mp3`);
        }
    }

    public onCountdownEnd(): void {
        (this.game.hudManager as any).hideCountdown();
        console.log(`=== ROUND ${this.roundNumber} - GO! ===`);
        this.game.soundManager.playAnnouncer("Execute Mission. Go Go Go!");
    }

    public onRoundStart(roundNumber: number): void {
        console.log(`\n=== ROUND ${roundNumber} STARTING ===`);
        console.log(`TaskForce: ${this.roundWins['TaskForce']} | OpFor: ${this.roundWins['OpFor']}`);
    }

    public onRoundEnd(_winner: string | null): void {
        // Hook implementation - cleanup handled in endRound
    }

    public onBeforeSpawn(_entity: GameObject, _position: THREE.Vector3): boolean {
        return true; // Allow spawn by default
    }

    public onAfterSpawn(_entity: GameObject): void {
        // Hook implementation - can be overridden if needed
    }

    public onSaveScores(): void {
        for (const p of this.participants) {
            if (p.objectRef) {
                if (p.objectRef instanceof Enemy) {
                    p.score = p.objectRef.damageDealt;
                } else if (p.objectRef === this.game.player) {
                    p.score = this.game.player.damageDealt;
                }
            }
            if (p.id) {
                this.persistentScores.set(p.id, p.score);
            }
        }
    }

    public onRestoreScores(): void {
        // Scores are restored in spawnTeams when creating entities
    }

    private spawnTeams(): void {
        // Clear participants for new round
        this.participants = [];

        // Register Player if playing
        if (this.game.player && !this.isSpectatorOnly) {
            // Restore player score
            const playerScore = this.persistentScores.get('player') || 0;
            this.game.player.damageDealt = playerScore;

            this.participants.push({
                id: 'player',
                name: 'You',
                team: 'TaskForce',
                status: 'Alive',
                score: playerScore,
                objectRef: this.game.player
            });
        }

        // Spawn TaskForce bots (teammates)
        // Aim for 5 members total. If player exists and playing, spawn 4 bots.
        // If spectator only, spawn 5 bots to fill the team.
        const teammateCount = this.isSpectatorOnly ? this.botsPerTeam : this.botsPerTeam - 1;

        for (let i = 0; i < teammateCount; i++) {
            const spawnPos = this.getSpawnPosition('TaskForce', true) || new THREE.Vector3(0, 10, 0);
            const name = `TaskForce ${i + 1}`;
            const bot = new Enemy(this.game, spawnPos, 'Player', name);

            bot.damageDealt = this.persistentScores.get(name) || 0;

            if (this.onBeforeSpawn(bot, spawnPos)) {
                this.game.addGameObject(bot);
                this.taskForceAlive.add(bot);
                this.onAfterSpawn(bot);
            }

            this.participants.push({
                id: bot.name,
                name: bot.name,
                team: 'TaskForce',
                status: 'Alive',
                score: bot.damageDealt,
                objectRef: bot
            });
        }

        // Spawn OpFor bots (enemies)
        // Spawn full team
        for (let i = 0; i < this.botsPerTeam; i++) {
            const spawnPos = this.getSpawnPosition('OpFor', true) || new THREE.Vector3(0, 10, 0);
            const name = `OpFor ${i + 1}`;
            const bot = new Enemy(this.game, spawnPos, 'OpFor', name);

            bot.damageDealt = this.persistentScores.get(name) || 0;

            if (this.onBeforeSpawn(bot, spawnPos)) {
                this.game.addGameObject(bot);
                this.opForAlive.add(bot);
                this.onAfterSpawn(bot);
            }

            this.participants.push({
                id: bot.name,
                name: bot.name,
                team: 'OpFor',
                status: 'Alive',
                score: bot.damageDealt,
                objectRef: bot
            });
        }

        console.log(`Spawned ${teammateCount} TaskForce + ${this.botsPerTeam} OpFor bots`);
        console.log(`Registered ${this.participants.length} participants.`);

        // Pass targets to spectator controller
        // Combine all alive bots
        const allBots = [...this.taskForceAlive, ...this.opForAlive].filter(go => go instanceof Enemy);
        this.spectatorController.setTargets(allBots as GameObject[]);
    }

    public getSpawnPosition(team: string, applyJitter: boolean = false): THREE.Vector3 | null {
        const spawns = team === 'TaskForce' ? (this.game.availableSpawns?.CT || []) : (this.game.availableSpawns?.T || []);
        return this.getSafeSpawnPosition(spawns, applyJitter);
    }

    private getSafeSpawnPosition(spawns: THREE.Vector3[], applyJitter: boolean = false): THREE.Vector3 {
        // Fallback checks
        if (!spawns || spawns.length === 0) return new THREE.Vector3(0, 10, 0);

        // Try to find a spawn point that doesn't collide with existing bodies AND is on NavMesh
        // Shuffle spawns to randomize
        const shuffled = [...spawns].sort(() => Math.random() - 0.5);

        for (const spawn of shuffled) {
            let candidate = spawn.clone();

            // Apply Jitter if requested
            if (applyJitter) {
                // Jitter up to 2.5m radius
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 2.5;
                candidate.x += Math.sin(angle) * dist;
                candidate.z += Math.cos(angle) * dist;
            }

            // 1. Snap to NavMesh (CRITICAL FIX)
            // Even if we don't jitter, the map spawn point might be slightly off.
            // If we did jitter, we definitely need to snap back to valid floor.
            if (this.game.recastNav) {
                const snapped = this.game.recastNav.closestPointTo(candidate);
                if (snapped) {
                    candidate = snapped;
                } else {
                    // If jitter pushed it off mesh entirely, skip this attempt
                    if (applyJitter) continue;
                }
            }

            // 2. Simple overlap check
            // Check if any body is within 1.0m of spawn
            let blocked = false;
            for (const body of this.game.world.bodies) {
                const dist = body.position.distanceTo(new CANNON.Vec3(candidate.x, candidate.y, candidate.z));
                if (dist < 1.0) { // 1m radius
                    blocked = true;
                    break;
                }
            }

            if (!blocked) {
                return candidate;
            }
        }

        // If all blocked, fallback to first random but ensure it's on NavMesh
        console.warn("All spawn points blocked! Picking best available.");

        // Try to find ANY valid point in the list, ignoring entity collision
        for (const spawn of shuffled) {
            if (this.game.recastNav) {
                const snapped = this.game.recastNav.closestPointTo(spawn);
                if (snapped) return snapped;
            }
        }

        // Absolute fallback
        return shuffled[0].clone();
    }

    public checkWinCondition(): string | null {
        this.updateAliveCounts();

        const taskForceCount = this.taskForceAlive.size;
        const opForCount = this.opForAlive.size;

        if (taskForceCount === 0 && opForCount > 0) {
            return 'OpFor';
        } else if (opForCount === 0 && taskForceCount > 0) {
            return 'TaskForce';
        } else if (taskForceCount === 0 && opForCount === 0) {
            return null; // Draw
        }
        return null; // Round still active
    }

    private updateAliveCounts(): void {
        // Remove dead entities from alive sets
        for (const entity of this.taskForceAlive) {
            if (entity instanceof Enemy && entity.health <= 0) {
                this.taskForceAlive.delete(entity);
            } else if (entity === this.game.player && this.game.player.health <= 0) {
                this.taskForceAlive.delete(entity);
            }
        }

        for (const entity of this.opForAlive) {
            if (entity instanceof Enemy && entity.health <= 0) {
                this.opForAlive.delete(entity);
            }
        }
    }

    private endRound(winner: string | null): void {
        this.roundActive = false;
        this.roundEndTimer = 0;

        // Save scores before cleanup
        this.onSaveScores();

        if (winner) {
            this.roundWins[winner]++;
            console.log(`\n=== ROUND ${this.roundNumber} - ${winner} WINS ===`);
            (this.game.hudManager as any).showRoundResult(winner, `Final Score: ${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']}`);

            const winText = winner === 'TaskForce' ? "Task Force Wins" : "Opposing Force Wins";
            this.game.soundManager.playAnnouncer(winText);
        } else {
            console.log(`\n=== ROUND ${this.roundNumber} - DRAW ===`);
            (this.game.hudManager as any).showRoundResult(null, "No survivors");
            this.game.soundManager.playAnnouncer("Round Draw");
        }

        console.log(`Score: TaskForce ${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']} OpFor`);

        // Check for game win
        if (this.roundWins['TaskForce'] >= this.roundLimit) {
            this.endGame('TaskForce');
        } else if (this.roundWins['OpFor'] >= this.roundLimit) {
            this.endGame('OpFor');
        }

        this.onRoundEnd(winner);
    }

    public onRoundTimeout(): void {
        let taskForceDamage = 0;
        let opForDamage = 0;

        for (const p of this.participants) {
            if (p.team === 'TaskForce') {
                taskForceDamage += p.score;
            } else if (p.team === 'OpFor') {
                opForDamage += p.score;
            }
        }

        console.log(`[TDM] Timeout! TaskForce damage: ${taskForceDamage}, OpFor damage: ${opForDamage}`);

        const winner = taskForceDamage > opForDamage ? 'TaskForce' : 
                      (opForDamage > taskForceDamage ? 'OpFor' : null);
        this.endRound(winner);
    }

    /** Get remaining round time in seconds for HUD display */
    public getRoundTimeRemaining(): number {
        return Math.max(0, this.roundTimer);
    }

    /** Format time as MM:SS for display */
    public getFormattedRoundTime(): string {
        const totalSeconds = Math.max(0, Math.ceil(this.roundTimer));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    public onRoundCleanup(): void {
        // Remove all enemy objects
        const toRemove = this.game.getGameObjects().filter(go =>
            go instanceof Enemy || go.constructor.name === 'Enemy'
        );

        toRemove.forEach(go => {
            if ('dispose' in go && typeof (go as any).dispose === 'function') {
                (go as any).dispose();
            } else {
                this.game.removeGameObject(go);
            }
        });

        if (this.game.player) {
            this.game.player.health = 100;
        }
    }

    private endGame(winner: string): void {
        this.isGameOver = true;
        console.log(`\n========================================`);
        console.log(`     ${winner} WINS THE GAME!`);
        console.log(`     Final Score: ${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']}`);
        console.log(`========================================`);

        // Simple game over for now
        setTimeout(() => {
            alert(`${winner} Wins the Match!\n\nFinal Score:\nTaskForce: ${this.roundWins['TaskForce']}\nOpFor: ${this.roundWins['OpFor']}`);
            location.reload();
        }, 2000);
    }

    public onEntityDeath(victim: GameObject, killer?: GameObject): void {
        const participant = this.participants.find(p => p.objectRef === victim);
        if (participant) {
            participant.status = 'Dead';
            participant.objectRef = null;
            if (victim instanceof Enemy) {
                participant.score = victim.damageDealt;
            } else if (victim === this.game.player) {
                participant.score = this.game.player.damageDealt;
            }
        }

        if (killer instanceof Enemy) {
            const killerP = this.participants.find(p => p.objectRef === killer);
            if (killerP) killerP.score = killer.damageDealt;
        }

        // Remove from alive tracking
        if (victim.team === 'Player' || victim === this.game.player) {
            this.taskForceAlive.delete(victim);
            if (victim === this.game.player) {
                this.onPlayerDeath(killer);
            }
        } else if (victim.team === 'OpFor') {
            this.opForAlive.delete(victim);
        }

        if (this.isSpectating) {
            this.spectatorController.setTargets(this.getSpectatorTargets());
        }
    }

    public onPlayerDeath(_killer?: GameObject): void {
        console.log("Player died! switching to spectator mode.");
        this.onEnterSpectator();
    }

    public registerEntity(_entity: GameObject): void {
        // No dynamic registration in round-based mode
    }

    public getScoreboardData(): ScoreData[] {
        const data: ScoreData[] = [];

        // Header info
        data.push({
            name: `--- ROUND ${this.roundNumber} ---`,
            team: '',
            score: 0,
            status: `${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']}`
        });

        // Participants
        for (const p of this.participants) {
            // Sync score if alive
            if (p.status === 'Alive' && p.objectRef) {
                if (p.objectRef instanceof Enemy) {
                    p.score = p.objectRef.damageDealt;
                } else if (p.objectRef === this.game.player) {
                    p.score = this.game.player.damageDealt;
                }
            }

            data.push({
                name: p.name,
                team: p.team,
                score: p.score,
                status: p.status
            });
        }

        return data;
    }



    public onEnterSpectator(): void {
        this.isSpectating = true;
        if (this.game.player) {
            this.game.player.isSpectating = true;
        }
        this.spectatorController.setTargets(this.getSpectatorTargets());
        console.log("Spectator Mode Enabled");
    }

    public getSpectatorTargets(): GameObject[] {
        const targets: GameObject[] = [];
        this.taskForceAlive.forEach(t => targets.push(t));
        this.opForAlive.forEach(t => targets.push(t));

        const myTeam = this.game.player?.team || 'Player';

        // 0. If Spectator Only Mode, show everyone (No team restriction)
        if (this.isSpectatorOnly) {
            // Filter alive only
            return targets.filter(t => {
                if (t instanceof Enemy && t.health <= 0) return false;
                if ((t as any).isDead) return false;
                return true;
            });
        }

        // 1. Try to find living teammates
        const teammates = targets.filter(t => {
            if (t === this.game.player) return false;
            if (t instanceof Enemy && t.health <= 0) return false;
            if ((t as any).isDead) return false;
            return t.team === myTeam;
        });

        if (teammates.length > 0) {
            return teammates;
        }

        // 2. Fallback: Spectate anyone alive (Enemies) if all teammates are dead
        return targets.filter(t => {
            if (t === this.game.player) return false;
            if (t instanceof Enemy && t.health <= 0) return false;
            if ((t as any).isDead) return false;
            return true;
        });
    }

    public canPlayerMove(): boolean {
        // Allow movement only if round is active (and not just starting/counting down)
        // If countdown is active, block.
        // If round is not active (between rounds), block.
        // Grace period: Allow movement if countdown is basically done (< 0.5s).
        // This prevents the "stuck" feeling if there's a frame delay between visual 0 and logic unlock.
        if (this.countdownActive && this.countdownTimer > 0.5) return false;

        // Also block if we haven't started round 1 yet (startup)
        if (this.roundNumber === 0 && !this.roundActive) return false;

        // Otherwise allow (during active round)
        return true;
    }
}
