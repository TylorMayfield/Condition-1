import { SettingsManager } from '../game/SettingsManager';

export class Input {
    public keys: Map<string, boolean> = new Map();
    private mouseButtons: Map<number, boolean> = new Map();
    private previousMouseButtons: Map<number, boolean> = new Map();
    public mouseDelta: { x: number, y: number } = { x: 0, y: 0 };
    public isPointerLocked: boolean = false;
    public isEditorActive: boolean = false;
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

        // Auto-relock on click if we should be locked (handled by game state usually, but this helps)
        document.addEventListener('click', () => {
            if (!this.isPointerLocked && !this.isMenuVisible() && !this.isEditorActive) {
                this.lockCursor();
            }
        });
        
        // Clear all key states when window loses focus (fixes stuck keys after alt-tab)
        window.addEventListener('blur', () => {
            // Clear all keys to prevent stuck key states
            this.keys.clear();
            this.mouseButtons.clear();
            this.previousKeys.clear();
            this.previousMouseButtons.clear();
            this.mouseDelta.x = 0;
            this.mouseDelta.y = 0;
        });
        
        // Auto-relock when window regains focus (fixes alt-tab issue)
        window.addEventListener('focus', () => {
            // Clear all keys again to ensure clean state (in case blur didn't fire)
            this.keys.clear();
            this.mouseButtons.clear();
            this.previousKeys.clear();
            this.previousMouseButtons.clear();
            
            // Reset mouse delta to prevent unwanted movement when regaining focus
            this.mouseDelta.x = 0;
            this.mouseDelta.y = 0;
            
            // Small delay to ensure pointer lock can be requested after focus
            setTimeout(() => {
                if (!this.isPointerLocked && !this.isMenuVisible() && !this.isEditorActive) {
                    this.lockCursor();
                }
            }, 100);
        });
    }

    private isMenuVisible(): boolean {
        // HACK: Check if menu overlay is visible
        const overlay = document.getElementById('menu-overlay');
        return overlay?.style.display !== 'none';
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

    public getMouseButtonDown(button: number): boolean {
        return (this.mouseButtons.get(button) || false) && !(this.previousMouseButtons.get(button) || false);
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
        this.previousMouseButtons = new Map(this.mouseButtons);
    }

    public flushMouseDelta() {
        // Implementation detail
    }
}
