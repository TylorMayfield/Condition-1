
import * as THREE from 'three';
import { GameMode, type ScoreData } from './GameMode';
import { GameModeId } from './GameModeId';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';
import { SpectatorCameraController } from '../controllers/SpectatorCameraController';
import type { TDMParticipant } from './tdm/TeamDeathmatchTypes';
import { getTeamSpawnPosition } from './tdm/TeamDeathmatchSpawns';
import { BombObjective } from '../objectives/BombObjective';
import { DEFAULT_MATCH_RULES, ObjectiveState, RoundPhase } from './round/MatchTypes';
import { EconomySystem } from '../economy/EconomySystem';
import { validateDefusalMap } from '../maps/GameplayMapData';
import { PurchaseService } from '../economy/PurchaseService';
import { EQUIPMENT_CATALOG, canTeamBuy } from '../equipment/EquipmentCatalog';
import { CampaignService, DEFUSAL_TOUR, type CampaignTeam } from '../campaign/CampaignService';
import { AITeamCoordinator } from '../ai/AITeamCoordinator';

/**
 * Round-Based Team Deathmatch
 * - No respawning during a round
 * - Round ends when all members of a team are eliminated
 * - Winning team gets a round point
 * - Game ends when a team reaches roundLimit wins
 */
export class TeamDeathmatchGameMode extends GameMode {
    readonly id: typeof GameModeId.TDM | typeof GameModeId.DEFUSAL;
    public roundPhase: RoundPhase = RoundPhase.Warmup;
    private readonly objectiveMode: boolean;
    private bomb: BombObjective | null = null;
    private bombCarrier: GameObject | null = null;
    private economy = new EconomySystem();
    private purchaseService = new PurchaseService(this.economy);
    private playerSide: CampaignTeam = 'TaskForce';
    private playerMatchWins: number = 0;
    private opponentMatchWins: number = 0;
    private halftimeComplete: boolean = false;

    // Round wins per team
    // ...

    // Persistent Scoreboard Data
    private participants: TDMParticipant[] = [];
    public roundWins: { [team: string]: number } = {
        'TaskForce': 0,
        'OpFor': 0
    };

    /** Stores cumulative damage/score by participant ID (Name) throughout the match */
    private persistentScores: Map<string, number> = new Map();

    // Round configuration
    public roundLimit: number;
    public botsPerTeam: number = 5; // 5 vs 5 target
    public roundTimeLimit: number;

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
    private readonly countdownDuration: number;
    private lastCountdownAnnounced: number = -1;

    // Track entities for this round (no respawning)
    private taskForceAlive: Set<GameObject> = new Set();
    private opForAlive: Set<GameObject> = new Set();

    constructor(game: Game, objectiveMode: boolean = false) {
        super(game);
        this.objectiveMode = objectiveMode;
        this.id = objectiveMode ? GameModeId.DEFUSAL : GameModeId.TDM;
        this.roundLimit = objectiveMode ? DEFAULT_MATCH_RULES.roundsToWin : 5;
        this.roundTimeLimit = objectiveMode ? DEFAULT_MATCH_RULES.roundTime : 300;
        this.countdownDuration = objectiveMode ? DEFAULT_MATCH_RULES.freezeTime : 5;
        this.bomb = objectiveMode ? new BombObjective(DEFAULT_MATCH_RULES) : null;
        this.spectatorController = new SpectatorCameraController(game);
    }

    public init(): void {
        console.log(this.objectiveMode ? 'Initializing MR8 Bomb Defusal' : 'Initializing Round-Based Team Deathmatch');
        if (this.objectiveMode) {
            this.playerSide = this.game.campaignTeam;
            const errors = validateDefusalMap(this.game.gameplayMapData, this.game.availableSpawns.T.length, this.game.availableSpawns.CT.length);
            if (errors.length) throw new Error(`Invalid defusal map: ${errors.join('; ')}`);
        }
        this.roundWins['TaskForce'] = 0;
        this.roundWins['OpFor'] = 0;
        this.persistentScores.clear();
        this.roundNumber = 0;
        this.isGameOver = false;
        this.playerMatchWins = 0;
        this.opponentMatchWins = 0;
        this.halftimeComplete = false;

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
            this.roundPhase = RoundPhase.Freeze;
            if (this.objectiveMode && this.game.input.getKeyDown('KeyB')) this.openBuyMenu();
            this.countdownTimer -= dt;
            const secondsLeft = Math.ceil(this.countdownTimer);
            this.onCountdownTick(secondsLeft);

            if (this.countdownTimer <= 0) {
                this.countdownActive = false;
                this.roundActive = true;
                this.roundPhase = RoundPhase.Live;
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
        if (this.objectiveMode && this.updateBombObjective(dt)) return;
        this.roundTimer -= dt;
        this.hud.showRoundTimer(this.getFormattedRoundTime());

        // Check for round timeout
        if (this.roundTimer <= 0) {
            this.hud.hideRoundTimer();
            if (this.objectiveMode) this.endRound('TaskForce', 'Bomb was not planted');
            else this.onRoundTimeout();
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

        if (this.objectiveMode && !this.halftimeComplete && this.roundNumber === DEFAULT_MATCH_RULES.halftimeAfter) {
            this.halftimeComplete = true;
            this.playerSide = this.playerSide === 'TaskForce' ? 'OpFor' : 'TaskForce';
            this.roundPhase = RoundPhase.Halftime;
            this.hud.showHalftime();
        }

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
                const spawnPos = this.getSpawnPosition(this.playerSide, false) || new THREE.Vector3(0, 10, 0);
                if (this.onBeforeSpawn(this.game.player, spawnPos)) {
                    this.game.player.team = this.playerSide === 'TaskForce' ? 'Player' : 'OpFor';
                    this.game.player.respawn(spawnPos);
                    (this.playerSide === 'TaskForce' ? this.taskForceAlive : this.opForAlive).add(this.game.player);
                    this.isSpectating = false;
                    this.onAfterSpawn(this.game.player);
                }
            } else {
                this.onEnterSpectator();
            }
        }
        if (this.objectiveMode) this.configureObjectiveRound();

        // Start countdown
        this.countdownActive = true;
        this.countdownTimer = this.countdownDuration;
        this.roundTimer = this.roundTimeLimit;
        this.roundActive = false;
        this.roundPhase = RoundPhase.Freeze;
        this.onRoundStart(this.roundNumber);
        this.onCountdownStart(this.countdownDuration);
    }

    public onCountdownStart(_duration: number): void {
        this.lastCountdownAnnounced = -1;
    }

    public onCountdownTick(secondsRemaining: number): void {
        this.hud.showCountdown(secondsRemaining);

        if (secondsRemaining <= 5 && secondsRemaining > 0 && secondsRemaining !== this.lastCountdownAnnounced) {
            this.lastCountdownAnnounced = secondsRemaining;
            this.game.soundManager.playAnnouncerFile(`${secondsRemaining}.mp3`);
        }
    }

    public onCountdownEnd(): void {
        this.hud.hideCountdown();
        this.hud.hideBuyMenu();
        console.log(`=== ROUND ${this.roundNumber} - GO! ===`);
        this.game.soundManager.playAnnouncer("Execute Mission. Go Go Go!");
    }

    private openBuyMenu(): void {
        const player = this.game.player;
        if (!player?.body) return;
        const pos = new THREE.Vector3(player.body.position.x, player.body.position.y, player.body.position.z);
        const inZone = this.game.gameplayMapData.buyZones.some(zone => zone.contains(pos));
        const balance = this.economy.balance('player');
        this.hud.showBuyMenu(EQUIPMENT_CATALOG.filter(item => canTeamBuy(item, 'TaskForce')).map(item => ({ id: item.id, name: item.displayName, price: item.price, enabled: inZone && item.price <= balance && !player.equipmentIds.includes(item.id) })), itemId => {
            const result = this.purchaseService.buy('player', 'TaskForce', itemId, player, this.countdownActive, inZone);
            if (result.ok) { this.hud.showMoney(this.economy.balance('player')); this.openBuyMenu(); }
            else this.hud.showObjectiveStatus(`Purchase failed: ${result.reason}`, true);
        });
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
                team: this.objectiveMode ? this.playerSide : 'TaskForce',
                status: 'Alive',
                score: playerScore,
                objectRef: this.game.player
            });
        }

        // Spawn TaskForce bots (teammates)
        // Aim for 5 members total. If player exists and playing, spawn 4 bots.
        // If spectator only, spawn 5 bots to fill the team.
        const teammateCount = this.isSpectatorOnly ? this.botsPerTeam : this.objectiveMode && this.playerSide === 'OpFor' ? this.botsPerTeam : this.botsPerTeam - 1;

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
        const opForCount = this.isSpectatorOnly ? this.botsPerTeam : this.objectiveMode && this.playerSide === 'OpFor' ? this.botsPerTeam - 1 : this.botsPerTeam;
        for (let i = 0; i < opForCount; i++) {
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

    private configureObjectiveRound(): void {
        const sites = this.game.gameplayMapData.bombSites;
        const attackerActors = [...this.opForAlive];
        const attackers = attackerActors.filter((go): go is Enemy => go instanceof Enemy);
        const defenders = [...this.taskForceAlive].filter((go): go is Enemy => go instanceof Enemy);
        this.bombCarrier = attackerActors[(this.roundNumber - 1) % Math.max(1, attackerActors.length)] ?? null;
        if (this.bombCarrier && this.bomb) this.bomb.reset(this.objectiveActorId(this.bombCarrier));
        const selectedSite = sites[(this.roundNumber - 1) % sites.length];
        const attackRoles = AITeamCoordinator.assignSquadRoles(attackers.length, true);
        const defenseRoles = AITeamCoordinator.assignSquadRoles(defenders.length, false);
        attackers.forEach((bot, i) => {
            bot.ai.blackboard.objectiveDestination = selectedSite.center.clone();
            bot.ai.blackboard.objectiveRole = bot === this.bombCarrier ? 'carrier' : attackRoles[i] === 'sniper' ? 'support' : attackRoles[i] as typeof bot.ai.blackboard.objectiveRole;
        });
        defenders.forEach((bot, i) => {
            bot.ai.blackboard.objectiveDestination = sites[i % sites.length].center.clone();
            bot.ai.blackboard.objectiveRole = defenseRoles[i] === 'kit-holder' ? 'rotator' : defenseRoles[i] as typeof bot.ai.blackboard.objectiveRole;
            bot.hasDefuseKit = defenseRoles[i] === 'kit-holder';
        });
        for (const p of this.participants) this.economy.register(p.id);
        const botBalances = this.participants.filter(p => p.id !== 'player').map(p => this.economy.balance(p.id));
        const buyIntent = AITeamCoordinator.classifyBuy(botBalances);
        if (buyIntent !== 'eco') {
            for (const bot of [...attackers, ...defenders]) { bot.armor = 100; this.economy.purchase(bot.name, buyIntent === 'full-buy' ? 3750 : 1650); }
        }
        this.hud.showMoney(this.economy.balance('player'));
        this.hud.showObjectiveStatus(this.bombCarrier ? `Protect the bomb sites · Carrier: ${this.objectiveActorId(this.bombCarrier)}` : 'Bomb Defusal');
    }

    private objectiveActorId(actor: GameObject): string { return actor === this.game.player ? 'player' : actor instanceof Enemy ? actor.name : `entity-${actor.body?.id ?? 0}`; }

    private actorPosition(actor: GameObject): THREE.Vector3 | null { return actor.body ? new THREE.Vector3(actor.body.position.x, actor.body.position.y, actor.body.position.z) : null; }

    private updateBombObjective(dt: number): boolean {
        if (!this.bomb) return false;
        const sites = this.game.gameplayMapData.bombSites;
        const carrierHealth = this.bombCarrier === this.game.player ? this.game.player.health : this.bombCarrier instanceof Enemy ? this.bombCarrier.health : 0;
        if (this.bombCarrier?.body && carrierHealth > 0) {
            const pos = this.actorPosition(this.bombCarrier)!;
            const site = sites.find(s => s.contains(pos));
            const interacting = this.bombCarrier === this.game.player ? this.game.input.getKey('KeyE') : !!site;
            if (this.bomb.updatePlant({ id: this.objectiveActorId(this.bombCarrier), team: 'OpFor', position: pos, alive: true }, site?.id ?? null, interacting, dt)) {
                this.roundPhase = RoundPhase.PostPlant;
                this.roundTimer = DEFAULT_MATCH_RULES.bombTime;
                this.hud.showObjectiveStatus(`Bomb planted at ${this.bomb.plantedSite}`, true);
                for (const defender of this.taskForceAlive) if (defender instanceof Enemy) { defender.ai.blackboard.objectiveDestination = this.bomb.position.clone(); defender.ai.blackboard.objectiveRole = 'retake'; }
            } else if (this.bomb.state === ObjectiveState.Planting) {
                this.hud.showInteractionProgress('PLANTING', this.bomb.interactionProgress / DEFAULT_MATCH_RULES.plantTime);
            }
        } else if (this.bombCarrier?.body && this.bomb.state === ObjectiveState.Carried) {
            this.bomb.drop(this.actorPosition(this.bombCarrier)!);
            this.bombCarrier = null;
            this.hud.showObjectiveStatus('Bomb dropped', true);
        }

        if (this.bomb.state === ObjectiveState.Dropped) {
            const recoverer = [...this.opForAlive].find(go => {
                const pos = this.actorPosition(go); return pos && pos.distanceTo(this.bomb!.position) <= 2 && (go !== this.game.player || this.game.input.getKey('KeyE'));
            });
            const pos = recoverer ? this.actorPosition(recoverer) : null;
            if (recoverer && pos && this.bomb.pickup({ id: this.objectiveActorId(recoverer), team: 'OpFor', position: pos, alive: true })) { this.bombCarrier = recoverer; this.hud.showObjectiveStatus(`Bomb recovered by ${this.objectiveActorId(recoverer)}`); }
        }

        if (this.bomb.state === ObjectiveState.Planted || this.bomb.state === ObjectiveState.Defusing) {
            const defuser = [...this.taskForceAlive].find(go => { const pos = this.actorPosition(go); const alive = go === this.game.player ? this.game.player.health > 0 : go instanceof Enemy && go.health > 0; return !!pos && alive && pos.distanceTo(this.bomb!.position) <= 2; });
            if (defuser) {
                const pos = this.actorPosition(defuser)!; const kit = defuser === this.game.player ? this.game.player.hasDefuseKit : (defuser as Enemy & { hasDefuseKit?: boolean }).hasDefuseKit;
                const actor = { id: this.objectiveActorId(defuser), team: 'TaskForce' as const, position: pos, alive: true, hasDefuseKit: kit };
                const interacting = defuser === this.game.player ? this.game.input.getKey('KeyE') : true;
                if (this.bomb.canActorFinishDefuse(actor)) {
                    if (this.bomb.updateDefuse(actor, interacting, dt)) { this.hud.hideInteractionProgress(); this.endRound('TaskForce', 'Bomb defused'); return true; }
                    if (this.bomb.state === ObjectiveState.Defusing) this.hud.showInteractionProgress('DEFUSING', this.bomb.interactionProgress / (kit ? DEFAULT_MATCH_RULES.defuseKitTime : DEFAULT_MATCH_RULES.defuseTime));
                }
            }
            if (this.bomb.update(dt)) { this.endRound('OpFor', 'Bomb exploded'); return true; }
            this.roundTimer = this.bomb.timeRemaining;
        }
        return false;
    }

    public getSpawnPosition(team: string, applyJitter: boolean = false): THREE.Vector3 | null {
        return getTeamSpawnPosition(this.game, team, applyJitter);
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

    private endRound(winner: string | null, reason?: string): void {
        this.roundActive = false;
        this.roundPhase = RoundPhase.RoundEnd;
        this.roundEndTimer = 0;

        // Save scores before cleanup
        this.onSaveScores();

        if (winner) {
            this.roundWins[winner]++;
            if (this.objectiveMode) {
                if (winner === this.playerSide) this.playerMatchWins++;
                else this.opponentMatchWins++;
            }
            console.log(`\n=== ROUND ${this.roundNumber} - ${winner} WINS ===`);
            this.hud.showRoundResult(winner, reason ?? `Final Score: ${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']}`);

            const winText = winner === 'TaskForce' ? "Task Force Wins" : "Opposing Force Wins";
            this.game.soundManager.playAnnouncer(winText);
        } else {
            console.log(`\n=== ROUND ${this.roundNumber} - DRAW ===`);
            this.hud.showRoundResult(null, "No survivors");
            this.game.soundManager.playAnnouncer("Round Draw");
        }

        console.log(`Score: TaskForce ${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']} OpFor`);

        if (this.objectiveMode) {
            const teams = new Map<string, 'TaskForce' | 'OpFor'>(this.participants.map(p => [p.id, p.team as 'TaskForce' | 'OpFor']));
            this.economy.settleRound({ winner: winner as 'TaskForce' | 'OpFor' | null, reason: winner ? 'elimination' : 'draw' }, teams, this.bomb?.plantedSite !== null);
            this.hud.showMoney(this.economy.balance('player'));
        }

        // Check for game win
        if (this.objectiveMode && this.playerMatchWins >= this.roundLimit) {
            this.endGame(this.playerSide);
        } else if (this.objectiveMode && this.opponentMatchWins >= this.roundLimit) {
            this.endGame(this.playerSide === 'TaskForce' ? 'OpFor' : 'TaskForce');
        } else if (!this.objectiveMode && this.roundWins['TaskForce'] >= this.roundLimit) {
            this.endGame('TaskForce');
        } else if (!this.objectiveMode && this.roundWins['OpFor'] >= this.roundLimit) {
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
        const toRemove = this.game.getGameObjects().filter((go) => go instanceof Enemy);

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
        this.roundPhase = RoundPhase.MatchEnd;
        console.log(`\n========================================`);
        console.log(`     ${winner} WINS THE GAME!`);
        console.log(`     Final Score: ${this.roundWins['TaskForce']} - ${this.roundWins['OpFor']}`);
        console.log(`========================================`);

        if (this.objectiveMode) {
            const campaign = new CampaignService();
            const profile = campaign.load();
            const match = DEFUSAL_TOUR.find(item => item.map === this.game.currentMapName);
            if (match) {
                const playerWon = this.playerMatchWins > this.opponentMatchWins;
                const next = campaign.recordMatch(profile, match.id, playerWon, this.playerMatchWins, this.opponentMatchWins);
                const nextMatch = DEFUSAL_TOUR.find(item => next.unlockedMatchIds.includes(item.id) && !next.completedMatchIds.includes(item.id));
                this.hud.showCampaignResult(playerWon ? 'Operation Complete' : 'Operation Failed', nextMatch?.displayName);
            }
        }

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
        if (this.isSpectating) return false;

        // Block during countdown except for a short grace window at GO
        if (this.countdownActive) return this.countdownTimer <= 0.5;

        // Only allow movement while a round is actively in progress
        return this.roundActive;
    }
}
