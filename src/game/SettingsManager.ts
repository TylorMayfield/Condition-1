

export type KeyMap = Record<string, string>; // Action -> KeyCode

export interface GameSettings {
    audio: {
        masterVolume: number;
        sfxVolume: number;
        musicVolume: number;
    };
    video: {
        fov: number;
        sensitivity: number;
    };
    controls: KeyMap;
}

export const DEFAULT_SETTINGS: GameSettings = {
    audio: {
        masterVolume: 1.0,
        sfxVolume: 1.0,
        musicVolume: 0.5,
    },
    video: {
        fov: 75,
        sensitivity: 1.0,
    },
    controls: {
        'MoveForward': 'KeyW',
        'MoveBackward': 'KeyS',
        'MoveLeft': 'KeyA',
        'MoveRight': 'KeyD',
        'Jump': 'Space',
        'Crouch': 'KeyZ',
        'Sprint': 'ShiftLeft',
        'Interact': 'KeyE',
        'Reload': 'KeyR',
        'Fire': 'Mouse0',
        'Aim': 'Mouse1',
        'Pause': 'Escape',
        'Scoreboard': 'KeyT',
    }

};

export class SettingsManager {
    private settings: GameSettings;
    private storageKey = 'condition1_settings';

    constructor() {
        this.settings = this.loadSettings();
    }

    private loadSettings(): GameSettings {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
            try {
                // Merge saved settings with defaults to ensure all keys exist
                const parsed = JSON.parse(saved);
                return this.deepMerge(DEFAULT_SETTINGS, parsed);
            } catch (e) {
                console.error('Failed to parse settings, using defaults', e);
                return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            }
        }
        return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }

    public saveSettings() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    }

    public getSettings(): GameSettings {
        return this.settings;
    }

    public getControl(action: string): string {
        return this.settings.controls[action] || '';
    }

    public setControl(action: string, code: string) {
        this.settings.controls[action] = code;
        this.saveSettings();
    }

    public setVolume(type: 'master' | 'sfx' | 'music', value: number) {
        if (type === 'master') this.settings.audio.masterVolume = value;
        if (type === 'sfx') this.settings.audio.sfxVolume = value;
        if (type === 'music') this.settings.audio.musicVolume = value;
        this.saveSettings();
    }

    public setVideo(setting: 'fov' | 'sensitivity', value: number) {
        if (setting === 'fov') this.settings.video.fov = value;
        if (setting === 'sensitivity') this.settings.video.sensitivity = value;
        this.saveSettings();
    }

    private deepMerge(target: any, source: any): any {
        for (const key of Object.keys(source)) {
            if (source[key] instanceof Object && key in target) {
                Object.assign(source[key], this.deepMerge(target[key], source[key]));
            }
        }
        Object.assign(target || {}, source);
        return target;
    }
}
