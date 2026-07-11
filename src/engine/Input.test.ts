import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';
import type { SettingsManager } from '../game/SettingsManager';

const settings = { getControl: () => '' } as unknown as SettingsManager;

describe('Input pointer lock', () => {
    it('deduplicates overlapping pointer-lock requests', async () => {
        document.body.innerHTML = '<div id="menu-overlay" style="display:none"></div>';
        const request = vi.fn(() => new Promise<void>(() => {}));
        Object.defineProperty(document.body, 'requestPointerLock', { configurable: true, value: request });
        const input = new Input(settings);

        void input.lockCursor();
        expect(await input.lockCursor()).toBe(false);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('does not lock through an open buy menu', async () => {
        document.body.innerHTML = '<div id="menu-overlay" style="display:none"></div><div class="hud-buy-menu" style="display:grid"></div>';
        const request = vi.fn(async () => {});
        Object.defineProperty(document.body, 'requestPointerLock', { configurable: true, value: request });
        const input = new Input(settings);

        expect(await input.lockCursor()).toBe(false);
        expect(request).not.toHaveBeenCalled();
    });
});
