
import * as THREE from 'three';
import { GameMode, type ScoreData } from './GameMode';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';

/**
 * Round-Based Team Deathmatch
 * - No respawning during a round
 * - Round ends when all members of a team are eliminated
 * - Winning team gets a round point
 * - Game ends when a team reaches roundLimit wins
 */
export class TeamDeathmatchGameMode extends GameMode {
    // Round wins per team
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
    private roundEndDelay: number = 3; // Seconds before next round starts
    private isGameOver: boolean = false;
    
    // Track entities for this round (no respawning)
    private taskForceAlive: Set<GameObject> = new Set();
    private opForAlive: Set<GameObject> = new Set();
    
    constructor(game: Game) {
        super(game);
    }

    public init(): void {
        console.log("Initializing Round-Based Team Deathmatch");
        this.roundWins['TaskForce'] = 0;
        this.roundWins['OpFor'] = 0;
        this.roundNumber = 0;
        this.isGameOver = false;
        
        // Ensure clean state immediately to remove any HMR leftovers
        this.cleanupRound();
    }

    public update(dt: number): void {
        if (this.isGameOver) return;
        
        // If round is not active, we're in between rounds
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
        this.roundActive = true;
        this.roundEndTimer = 0;
        
        console.log(`\n=== ROUND ${this.roundNumber} START ===`);
        console.log(`TaskForce: ${this.roundWins['TaskForce']} | OpFor: ${this.roundWins['OpFor']}`);
        
        // Clear old trackers (redundant with cleanupRound logic but safe)
        this.taskForceAlive.clear();
        this.opForAlive.clear();
        
        // Spawn teams
        this.spawnTeams();
        
        // Register player if alive
        if (this.game.player && this.game.player.health > 0) {
            this.taskForceAlive.add(this.game.player);
        }
    }

    private spawnTeams(): void {
        // Spawn TaskForce bots (teammates)
        // Aim for 5 members total. If player exists, spawn 4 bots.
        const teammateCount = this.botsPerTeam - 1;
        const ctSpawns = this.game.availableSpawns?.CT || [];
        
        for (let i = 0; i < teammateCount; i++) {
            const pos = this.getSpawnPosition(ctSpawns);
            const bot = new Enemy(this.game, pos, 'Player'); // 'Player' team = TaskForce
            this.game.addGameObject(bot);
            this.taskForceAlive.add(bot);
        }
        
        // Spawn OpFor bots (enemies)
        // Spawn full team
        const tSpawns = this.game.availableSpawns?.T || [];
        for (let i = 0; i < this.botsPerTeam; i++) {
            const pos = this.getSpawnPosition(tSpawns);
            const bot = new Enemy(this.game, pos, 'OpFor');
            this.game.addGameObject(bot);
            this.opForAlive.add(bot);
        }
        
        console.log(`Spawned ${teammateCount} TaskForce + ${this.botsPerTeam} OpFor bots`);
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
            console.log(`\n=== ROUND ${this.roundNumber} - ${winner} WINS ===`);
        } else {
            console.log(`\n=== ROUND ${this.roundNumber} - DRAW ===`);
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
        // Remove from alive tracking
        if (victim.team === 'Player' || victim === this.game.player) {
            this.taskForceAlive.delete(victim);
        } else if (victim.team === 'OpFor') {
            this.opForAlive.delete(victim);
        }
        
        // Track individual kills
        if (killer instanceof Enemy) {
            killer.score++;
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
        
        // Player
        if (this.game.player) {
            data.push({
                name: 'You',
                team: 'TaskForce',
                score: 0,
                status: this.game.player.health > 0 ? 'Alive' : 'Dead'
            });
        }
        
        // All Bots
        const allObjects = this.game.getGameObjects();
        for (const go of allObjects) {
            if (go instanceof Enemy) {
                data.push({
                    name: go.name,
                    team: go.team === 'Player' ? 'TaskForce' : go.team,
                    score: go.score,
                    status: go.health > 0 ? 'Alive' : 'Dead'
                });
            }
        }

        return data;
    }
}
