import { describe, expect, it } from 'vitest';
import { RoundController } from './RoundController';
import { DEFAULT_MATCH_RULES, RoundPhase } from './MatchTypes';

describe('RoundController', () => {
    it('runs freeze, live, and post-plant phases with authoritative timers', () => {
        const rounds = new RoundController(); rounds.startMatch();
        expect(rounds.phase).toBe(RoundPhase.Freeze); expect(rounds.canMoveOrFire()).toBe(false); expect(rounds.canBuy()).toBe(true);
        expect(rounds.update(DEFAULT_MATCH_RULES.freezeTime)).toBe('live-started');
        rounds.markPlanted(); expect(rounds.phaseTimeRemaining).toBe(40); expect(rounds.update(39)).toBeNull();
    });
    it('switches at halftime and ends at nine wins', () => {
        const rounds = new RoundController(); rounds.startMatch();
        for (let i = 0; i < 8; i++) { rounds.finishRound({ winner: 'TaskForce', reason: 'elimination' }); if (i < 7) rounds.continueAfterRound(); }
        expect(rounds.continueAfterRound()).toBe('halftime'); rounds.continueAfterHalftime();
        rounds.finishRound({ winner: 'TaskForce', reason: 'bomb-defused' }); expect(rounds.phase).toBe(RoundPhase.MatchEnd);
    });
});
