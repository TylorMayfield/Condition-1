import { SettingsManager } from '../game/SettingsManager';

export class Input {
    public keys: Map<string, boolean> = new Map();
    private mouseButtons: Map<number, boolean> = new Map();
    public mouseDelta: { x: number, y: number } = { x: 0, y: 0 };
    public isPointerLocked: boolean = false;
    private previousKeys: Map<string, boolean> = new Map();
    private settingsManager: SettingsManager;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;

        window.addEventListener('keydown', (e) => this.keys.set(e.code, true));
        window.addEventListener('keyup', (e) => this.keys.set(e.code, false));
        window.addEventListener('mousedown', (e) => {
            this.mouseButtons.set(e.button, true);
            // Also set as a "key" for unified mapping (Mouse0, Mouse1)
            this.keys.set(`Mouse${e.button}`, true);
        });
        window.addEventListener('mouseup', (e) => {
            this.mouseButtons.set(e.button, false);
            this.keys.set(`Mouse${e.button}`, false);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                this.mouseDelta.x += e.movementX;
                this.mouseDelta.y += e.movementY;
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = !!document.pointerLockElement;
        });
    }

    public lockCursor() {
        document.body.requestPointerLock();
    }

    public unlockCursor() {
        document.exitPointerLock();
    }

    public getKey(code: string): boolean {
        return this.keys.get(code) || false;
    }

    public getKeyDown(code: string): boolean {
        return (this.keys.get(code) || false) && !(this.previousKeys.get(code) || false);
    }

    public getMouseButton(button: number): boolean {
        return this.mouseButtons.get(button) || false;
    }

    public getAction(action: string): boolean {
        const code = this.settingsManager.getControl(action);
        return this.getKey(code);
    }

    public getActionDown(action: string): boolean {
        const code = this.settingsManager.getControl(action);
        return this.getKeyDown(code);
    }

    public setMouseButton(button: number, state: boolean): void {
        this.mouseButtons.set(button, state);
    }

    public update() {
        // Update previous keys
        this.previousKeys = new Map(this.keys);
    }

    public flushMouseDelta() {
        // Implementation detail
    }
}
