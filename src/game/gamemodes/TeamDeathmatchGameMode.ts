
import * as THREE from 'three';
import { GameMode, type ScoreData } from './GameMode';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';

export class TeamDeathmatchGameMode extends GameMode {
    public scores: { [team: string]: number } = {
        'TaskForce': 0,
        'OpFor': 0
    };
    public scoreLimit: number = 30; // Kill limit
    public maxEnemies: number = 5;
    public maxFriendlies: number = 4; // +1 Player = 5
    private spawnTimer: number = 0;
    
    constructor(game: Game) {
        super(game);
    }

    public init(): void {
        console.log("Initializing Team Deathmatch");
        this.scores['TaskForce'] = 0;
        this.scores['OpFor'] = 0;
    }

    public update(dt: number): void {
        const allBots = this.game.getGameObjects().filter(go => go instanceof Enemy && go.health > 0);
        const opForCount = allBots.filter(b => b.team === 'OpFor').length;
        const taskForceCount = allBots.filter(b => b.team === 'Player').length; // Bots on Player team

        this.spawnTimer += dt;
        if (this.spawnTimer > 1.0) { // Check every 1s
             if (opForCount < this.maxEnemies) {
                 this.spawnBot('OpFor');
             }
             if (taskForceCount < this.maxFriendlies) {
                 this.spawnBot('Player');
             }
             this.spawnTimer = 0;
        }
    }

    private spawnBot(team: string) {
        let pos: THREE.Vector3;
        // Select spawns based on team
        const spawns = team === 'OpFor' ? this.game.availableSpawns.T : this.game.availableSpawns.CT;
        
        if (spawns && spawns.length > 0) {
             // Pick random spawn
            pos = spawns[Math.floor(Math.random() * spawns.length)].clone();
            // Add random jitter
            pos.x += (Math.random() - 0.5) * 5;
            pos.z += (Math.random() - 0.5) * 5;
        } else {
             // Fallback
            const angle = Math.random() * Math.PI * 2;
            const radius = 20 + Math.random() * 20;
            const x = Math.sin(angle) * radius;
            const z = Math.cos(angle) * radius;
            pos = new THREE.Vector3(x, 1, z);
        }

        const bot = new Enemy(this.game, pos, team);
        this.game.addGameObject(bot);
    }

    public onEntityDeath(victim: GameObject, killer?: GameObject): void {
        if (!killer) return;

        // Scoring Logic
        // If killer is TaskForce (Player or Bot) and Victim is OpFor -> TaskForce Point
        // If killer is OpFor and Victim is TaskForce -> OpFor Point
        
        // Normalize Teams
        const killerTeam = killer.team === 'Player' ? 'TaskForce' : killer.team;
        const victimTeam = victim.team === 'Player' ? 'TaskForce' : victim.team;

        // Friendly Fire Check? (Assume no negative score for now)
        if (killerTeam !== victimTeam) {
            // Team Score
            if (this.scores[killerTeam] !== undefined) {
                this.scores[killerTeam]++;
                
                 // Check Win
                if (this.scores[killerTeam] >= this.scoreLimit) {
                    this.game.gameMode = this; // Should arguably freeze or end game
                    alert(`${killerTeam} Wins!`);
                    location.reload(); 
                }
            }

            // Individual Score
            if (killer instanceof Enemy) {
                killer.score++;
            } else if (killer === this.game.player) {
                // Player score tracking? Player class doesn't have score yet via this interface?
                // Actually we can just track it here if we wanted, or add it to Player.
                // For now, let's assume we read from a property or just trust the global?
                // The scoreboard readout below uses a manual entry for "You" which reads team score currently.
                // Let's fix that.
            }
        }
    }
    
    public registerEntity(_entity: GameObject): void {}

    public getScoreboardData(): ScoreData[] {
        const data: ScoreData[] = [];
        
        // 1. Player
        if (this.game.player) {
            data.push({
                name: 'You',
                team: 'TaskForce',
                score: this.scores['TaskForce'], // TODO: Track individual player kills properly
                status: this.game.player.health > 0 ? 'Alive' : 'Dead'
            });
        }
        
        // 2. All Bots (Enemies and Teammates)
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
