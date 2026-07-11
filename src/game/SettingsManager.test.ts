import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SettingsManager, DEFAULT_SETTINGS } from './SettingsManager';

const storage = new Map<string, string>();

function mockLocalStorage(): void {
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
    });
}

describe('SettingsManager', () => {
    beforeEach(() => {
        storage.clear();
        mockLocalStorage();
    });

    it('loads defaults when storage is empty', () => {
        const settings = new SettingsManager();
        expect(settings.getSettings().video.fov).toBe(DEFAULT_SETTINGS.video.fov);
        expect(settings.getControl('Fire')).toBe('Mouse0');
    });

    it('persists control changes', () => {
        const settings = new SettingsManager();
        settings.setControl('Jump', 'KeyX');
        expect(settings.getControl('Jump')).toBe('KeyX');

        const reloaded = new SettingsManager();
        expect(reloaded.getControl('Jump')).toBe('KeyX');
    });

    it('updates video settings', () => {
        const settings = new SettingsManager();
        settings.setVideo('fov', 90);
        expect(settings.getSettings().video.fov).toBe(90);
    });
});
