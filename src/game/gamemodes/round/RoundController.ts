import { DEFAULT_MATCH_RULES, RoundPhase, type MatchRules, type RoundResult } from './MatchTypes';

export class RoundController {
    public readonly rules: MatchRules;
    public phase: RoundPhase = RoundPhase.Warmup;
    public phaseTimeRemaining = 0;
    public roundNumber = 0;
    public scores = { TaskForce: 0, OpFor: 0 };
    public halftimeComplete = false;
    public lastResult: RoundResult | null = null;

    constructor(rules: MatchRules = DEFAULT_MATCH_RULES) { this.rules = rules; }

    startMatch(): void { this.startRound(); }
    startRound(): void {
        this.roundNumber++;
        this.phase = RoundPhase.Freeze;
        this.phaseTimeRemaining = this.rules.freezeTime;
        this.lastResult = null;
    }
    update(dt: number): 'live-started' | 'round-timeout' | null {
        if (this.phase !== RoundPhase.Freeze && this.phase !== RoundPhase.Live && this.phase !== RoundPhase.PostPlant) return null;
        this.phaseTimeRemaining = Math.max(0, this.phaseTimeRemaining - dt);
        if (this.phaseTimeRemaining > 0) return null;
        if (this.phase === RoundPhase.Freeze) {
            this.phase = RoundPhase.Live;
            this.phaseTimeRemaining = this.rules.roundTime;
            return 'live-started';
        }
        if (this.phase === RoundPhase.Live) return 'round-timeout';
        return null;
    }
    markPlanted(): void { this.phase = RoundPhase.PostPlant; this.phaseTimeRemaining = this.rules.bombTime; }
    finishRound(result: RoundResult): void {
        if (this.phase === RoundPhase.RoundEnd || this.phase === RoundPhase.MatchEnd) return;
        this.lastResult = result;
        if (result.winner) this.scores[result.winner]++;
        this.phase = this.hasWinner() ? RoundPhase.MatchEnd : RoundPhase.RoundEnd;
    }
    continueAfterRound(): 'halftime' | 'round' | 'match-end' {
        if (this.hasWinner()) return 'match-end';
        if (!this.halftimeComplete && this.roundNumber === this.rules.halftimeAfter) {
            this.halftimeComplete = true;
            this.phase = RoundPhase.Halftime;
            return 'halftime';
        }
        this.startRound();
        return 'round';
    }
    continueAfterHalftime(): void { this.startRound(); }
    canMoveOrFire(): boolean { return this.phase === RoundPhase.Live || this.phase === RoundPhase.PostPlant; }
    canBuy(): boolean { return this.phase === RoundPhase.Freeze; }
    private hasWinner(): boolean { return this.scores.TaskForce >= this.rules.roundsToWin || this.scores.OpFor >= this.rules.roundsToWin; }
}
