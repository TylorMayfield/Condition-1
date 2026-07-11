import type { RoundResult } from '../gamemodes/round/MatchTypes';

export interface EconomyRules { startMoney: number; maxMoney: number; killReward: number; winReward: number; lossBase: number; lossStep: number; lossMax: number; plantLossBonus: number; }
export const DEFAULT_ECONOMY_RULES: EconomyRules = { startMoney: 800, maxMoney: 16000, killReward: 300, winReward: 3250, lossBase: 1400, lossStep: 500, lossMax: 3400, plantLossBonus: 800 };

export class EconomySystem {
    private balances = new Map<string, number>();
    private lossStreak = { TaskForce: 0, OpFor: 0 };
    public readonly rules: EconomyRules;
    constructor(rules: EconomyRules = DEFAULT_ECONOMY_RULES) { this.rules = rules; }
    register(id: string): void { if (!this.balances.has(id)) this.balances.set(id, this.rules.startMoney); }
    balance(id: string): number { return this.balances.get(id) ?? 0; }
    awardKill(id: string): void { this.credit(id, this.rules.killReward); }
    purchase(id: string, price: number): boolean {
        const current = this.balance(id);
        if (price < 0 || current < price) return false;
        this.balances.set(id, current - price); return true;
    }
    settleRound(result: RoundResult, teams: Map<string, 'TaskForce' | 'OpFor'>, attackersPlanted: boolean): void {
        for (const team of ['TaskForce', 'OpFor'] as const) {
            const won = result.winner === team;
            this.lossStreak[team] = won ? 0 : Math.min(4, this.lossStreak[team] + 1);
            const reward = won ? this.rules.winReward : Math.min(this.rules.lossMax, this.rules.lossBase + (this.lossStreak[team] - 1) * this.rules.lossStep);
            for (const [id, memberTeam] of teams) if (memberTeam === team) this.credit(id, reward + (!won && team === 'OpFor' && attackersPlanted ? this.rules.plantLossBonus : 0));
        }
    }
    private credit(id: string, amount: number): void { this.balances.set(id, Math.min(this.rules.maxMoney, this.balance(id) + amount)); }
}
