import { describe, expect, it } from 'vitest';
import { AIBlackboard } from './AIBlackboard';

describe('AIBlackboard combat pacing', () => {
    it('requires acquisition delay before engaging', () => {
        const board = new AIBlackboard();
        const target = { id: 'player' };

        board.beginAcquisition(target, 0.5);
        expect(board.isAcquiringTarget(target)).toBe(true);
        expect(board.isAcquisitionReady()).toBe(false);

        board.update(0.3);
        expect(board.isAcquisitionReady()).toBe(false);

        board.update(0.25);
        expect(board.isAcquisitionReady()).toBe(true);
        expect(board.hasPendingAcquisition(target)).toBe(true);

        board.confirmAcquisition();
        expect(board.pendingTarget).toBeNull();
    });

    it('paces tactical decisions independently of frame rate', () => {
        const board = new AIBlackboard();
        expect(board.canMakeTacticalDecision()).toBe(true);
        board.markTacticalDecision(0.4);
        expect(board.canMakeTacticalDecision()).toBe(false);
        board.update(0.39);
        expect(board.canMakeTacticalDecision()).toBe(false);
        board.update(0.02);
        expect(board.canMakeTacticalDecision()).toBe(true);
    });

    it('enforces tactical cooldowns', () => {
        const board = new AIBlackboard();
        expect(board.canFlank()).toBe(true);

        board.markFlank();
        expect(board.canFlank()).toBe(false);

        board.update(25);
        expect(board.canFlank()).toBe(true);
    });
});
