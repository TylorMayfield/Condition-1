
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

    // Round configuration
    public roundLimit: number = 5; // First to 5 wins
    public botsPerTeam: number = 5; // 5 vs 5 target

    // Round state
    private roundActive: boolean = false;
    private roundNumber: number = 0;
    private roundEndTimer: number = 0;
    private roundEndDelay: number = 3; // Seconds before countdown starts
    private isGameOver: boolean = false;

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
        this.roundNumber = 0;
        this.isGameOver = false;

        // Ensure clean state immediately to remove any HMR leftovers
        this.cleanupRound();

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

            // Update HUD countdown display
            const secondsLeft = Math.ceil(this.countdownTimer);
            (this.game.hudManager as any).showCountdown(secondsLeft);

            if (this.countdownTimer <= 0) {
                this.countdownActive = false;
                this.roundActive = true;
                this.aiEnabled = true; // Enable AI when round starts
                (this.game.hudManager as any).hideCountdown();
                console.log(`=== ROUND ${this.roundNumber} - GO! ===`);
            }
            return;
        }

        // If round is not active and not in countdown, we're in between rounds
        if (!this.roundActive) {
            this.roundEndTimer += dt;
            if (this.roundEndTimer >= this.roundEndDelay) {
                this.startNewRound();
            }
            return;
        }

        // Check for round end condition
        this.checkRoundEnd();
    }

    private startNewRound(): void {
        this.cleanupRound(); // Ensure clean slate (removes any existing bots)

        this.roundNumber++;
        this.roundEndTimer = 0;
        this.aiEnabled = false; // Disable AI during countdown

        console.log(`\n=== ROUND ${this.roundNumber} STARTING ===`);
        console.log(`TaskForce: ${this.roundWins['TaskForce']} | OpFor: ${this.roundWins['OpFor']}`);

        // Clear old trackers (redundant with cleanupRound logic but safe)
        this.taskForceAlive.clear();
        this.opForAlive.clear();

        // Spawn teams
        this.spawnTeams();

        // Register player if alive (and not in spectate only mode)
        if (this.game.player) {
            if (!this.isSpectatorOnly) {
                const ctSpawns = this.game.availableSpawns?.CT || [];
                const spawnPos = this.getSafeSpawnPosition(ctSpawns);
                this.game.player.respawn(spawnPos);
                this.taskForceAlive.add(this.game.player);
                this.isSpectating = false;
            } else {
                // Spectator Only or Camera Mode
                this.enableSpectatorMode();
            }
        }

        // Start countdown (don't activate round yet)
        this.countdownActive = true;
        this.countdownTimer = this.countdownDuration;
        this.roundActive = false; // Round starts after countdown
    }

    private spawnTeams(): void {
        // Clear participants for new round
        this.participants = [];

        // Register Player if playing
        if (this.game.player && !this.isSpectatorOnly) {
            this.participants.push({
                id: 'player',
                name: 'You',
                team: 'TaskForce',
                status: 'Alive',
                score: 0,
                objectRef: this.game.player
            });
        }

        // Spawn TaskForce bots (teammates)
        // Aim for 5 members total. If player exists and playing, spawn 4 bots.
        // If spectator only, spawn 5 bots to fill the team.
        const teammateCount = this.isSpectatorOnly ? this.botsPerTeam : this.botsPerTeam - 1;
        const ctSpawns = this.game.availableSpawns?.CT || [];

        for (let i = 0; i < teammateCount; i++) {
            const pos = this.getSafeSpawnPosition(ctSpawns);
            const bot = new Enemy(this.game, pos, 'Player'); // 'Player' team = TaskForce
            this.game.addGameObject(bot);
            this.taskForceAlive.add(bot);

            this.participants.push({
                id: bot.name,
                name: bot.name,
                team: 'TaskForce',
                status: 'Alive',
                score: 0,
                objectRef: bot
            });
        }

        // Spawn OpFor bots (enemies)
        // Spawn full team
        const tSpawns = this.game.availableSpawns?.T || [];
        for (let i = 0; i < this.botsPerTeam; i++) {
            const pos = this.getSpawnPosition(tSpawns);
            const bot = new Enemy(this.game, pos, 'OpFor');
            this.game.addGameObject(bot);
            this.opForAlive.add(bot);

            this.participants.push({
                id: bot.name,
                name: bot.name,
                team: 'OpFor',
                status: 'Alive',
                score: 0,
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

    private getSpawnPosition(spawns: THREE.Vector3[]): THREE.Vector3 {
        if (spawns.length > 0) {
            const pos = spawns[Math.floor(Math.random() * spawns.length)].clone();
            pos.x += (Math.random() - 0.5) * 5;
            pos.z += (Math.random() - 0.5) * 5;
            return pos;
        }

        // Fallback
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 20;
        return new THREE.Vector3(
            Math.sin(angle) * radius,
            1,
            Math.cos(angle) * radius
        );
    }

    private checkRoundEnd(): void {
        // Update alive counts (in case entities died outside of onEntityDeath)
        this.updateAliveCounts();

        const taskForceCount = this.taskForceAlive.size;
        const opForCount = this.opForAlive.size;

        // Check win conditions
        if (taskForceCount === 0 && opForCount > 0) {
            this.endRound('OpFor');
        } else if (opForCount === 0 && taskForceCount > 0) {
            this.endRound('TaskForce');
        } else if (taskForceCount === 0 && opForCount === 0) {
            // Draw - no one wins this round
            this.endRound(null);
        }
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

        if (winner) {
            this.roundWins[winner]++;
            // const message = `${winner} WINS`;
            console.log(`\n=== ROUND ${this.roundNumber} - ${winner} WINS ===`);
            (this.game.hudManager as any).showRoundResult(winner, `Final Score: ${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']}`);
        } else {
            console.log(`\n=== ROUND ${this.roundNumber} - DRAW ===`);
            (this.game.hudManager as any).showRoundResult(null, "No survivors");
        }

        console.log(`Score: TaskForce ${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']} OpFor`);

        // Check for game win
        if (this.roundWins['TaskForce'] >= this.roundLimit) {
            this.endGame('TaskForce');
        } else if (this.roundWins['OpFor'] >= this.roundLimit) {
            this.endGame('OpFor');
        }

        // Clean up dead bodies for next round
        this.cleanupRound();
    }

    private cleanupRound(): void {
        // Remove all enemy objects
        // Use constructor name check to catch HMR ghosts where instanceof fails
        const toRemove = this.game.getGameObjects().filter(go =>
            go instanceof Enemy || go.constructor.name === 'Enemy'
        );

        toRemove.forEach(go => {
            // Explicitly try calling dispose if it exists
            if ('dispose' in go && typeof (go as any).dispose === 'function') {
                (go as any).dispose();
            } else {
                // Fallback force remove
                this.game.removeGameObject(go);
            }
        });

        // Reset player health for next round
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
        // Update Participant Status
        const participant = this.participants.find(p => p.objectRef === victim);
        if (participant) {
            participant.status = 'Dead';
            participant.objectRef = null; // Clear ref as object will be disposed
            // Cache final score/damage
            if (victim instanceof Enemy) {
                participant.score = victim.damageDealt; // or kills if tracking that
            } else if (victim === this.game.player) {
                participant.score = this.game.player.damageDealt;
            }
        }

        // Track individual kills (Helper to update killer's score in real-time)
        if (killer instanceof Enemy) {
            killer.score++;
            // Update killer participant score immediately
            const killerP = this.participants.find(p => p.objectRef === killer);
            if (killerP) killerP.score = killer.damageDealt; // Syncing damageDealt primarily
        }

        // Remove from alive tracking
        if (victim.team === 'Player' || victim === this.game.player) {
            this.taskForceAlive.delete(victim);

            // If player died, start spectating
            if (victim === this.game.player) {
                console.log("Player died! switching to spectator mode.");
                this.enableSpectatorMode();
            }

        } else if (victim.team === 'OpFor') {
            this.opForAlive.delete(victim);
        }

        // Update spectator targets if a potential target died
        if (this.isSpectating) {
            const allBots = [...this.taskForceAlive, ...this.opForAlive]
                .filter(go => (go instanceof Enemy) || (go === this.game.player && this.game.player.health > 0)); // Filter alive

            // We cast here because we know Enemy and Player have health/isDead logic generally, 
            // but if we are strict we should use any or custom interface.
            this.spectatorController.setTargets(allBots as GameObject[]);
        }
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

    private getSafeSpawnPosition(spawns: THREE.Vector3[]): THREE.Vector3 {
        // Fallback checks
        if (!spawns || spawns.length === 0) return new THREE.Vector3(0, 10, 0);

        // Try to find a spawn point that doesn't collide with existing bodies AND is on NavMesh
        // Shuffle spawns to randomize
        const shuffled = [...spawns].sort(() => Math.random() - 0.5);

        for (const spawn of shuffled) {
            // 1. Check if point is on valid NavMesh (prevents spawning inside walls/void)
            // isOnNavMesh checks against a 1x2x1 box extent
            if (this.game.recastNav && !this.game.recastNav.isOnNavMesh(spawn)) {
                continue; // Skip invalid positions
            }

            // 2. Simple overlap check
            // Check if any body is within 1.0m of spawn
            let blocked = false;
            for (const body of this.game.world.bodies) {
                const dist = body.position.distanceTo(new CANNON.Vec3(spawn.x, spawn.y, spawn.z));
                if (dist < 1.0) { // 1m radius
                    blocked = true;
                    break;
                }
            }

            if (!blocked) {
                return spawn.clone();
            }
        }

        // If all blocked, fallback to first random but ensure it's on NavMesh?
        // Or just pick random and hope for best (better than freezing)
        console.warn("All spawn points blocked! Picking random.");

        // Try to find ANY valid point in the list, ignoring entity collision
        for (const spawn of shuffled) {
            if (this.game.recastNav && this.game.recastNav.isOnNavMesh(spawn)) {
                return spawn.clone();
            }
        }

        // Absolute fallback
        return shuffled[0].clone();
    }

    private enableSpectatorMode(): void {
        this.isSpectating = true;
        if (this.game.player) {
            this.game.player.isSpectating = true;
        }

        // Update targets
        // Re-gathering targets from sets
        const targets: GameObject[] = [];
        this.taskForceAlive.forEach(t => targets.push(t));
        this.opForAlive.forEach(t => targets.push(t));

        // Filter out the main player if they are the one enabling spectate (e.g. they died)
        // Also ensure they are not dead.
        const validTargets = targets.filter(t => {
            if (t === this.game.player) return false;
            // Check alive status safely
            if (t instanceof Enemy && t.health <= 0) return false;
            if ((t as any).isDead) return false;
            return true;
        });

        this.spectatorController.setTargets(validTargets);

        console.log("Spectator Mode Enabled");
    }
}
