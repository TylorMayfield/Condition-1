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
            const wasLocked = this.isPointerLocked;
            this.isPointerLocked = !!document.pointerLockElement;
            
            // If pointer lock was lost unexpectedly (not due to blur), don't clear keyboard input
            // Only clear mouse button states if pointer lock is lost
            if (!this.isPointerLocked && wasLocked) {
                // Clear mouse buttons but preserve keyboard state
                // This prevents movement from stopping when pointer lock is lost
                this.mouseButtons.clear();
                this.previousMouseButtons.clear();
                // Reset mouse delta
                this.mouseDelta.x = 0;
                this.mouseDelta.y = 0;
                
                // IMPORTANT: Do NOT clear keyboard keys here
                // Keyboard input should continue working even if pointer lock is lost
            }
        });
        
        // Handle pointer lock errors (e.g., user gesture required)
        document.addEventListener('pointerlockerror', () => {
            // Don't clear input state - just log for debugging
            console.warn('Pointer lock error - may need user gesture to re-lock');
            // Don't clear keyboard input - only clear mouse buttons
            this.mouseButtons.clear();
            this.previousMouseButtons.clear();
        });

        // Auto-relock on click if we should be locked (handled by game state usually, but this helps)
        document.addEventListener('click', () => {
            if (!this.isPointerLocked && !this.isMenuVisible() && !this.isEditorActive) {
                this.lockCursor();
            }
        });
        
        // Clear all key states when window loses focus (fixes stuck keys after alt-tab)
        // Only clear if we actually lost focus (not just pointer lock)
        let isWindowFocused = true;
        window.addEventListener('blur', () => {
            isWindowFocused = false;
            // Clear all keys to prevent stuck key states
            this.keys.clear();
            this.mouseButtons.clear();
            this.previousKeys.clear();
            this.previousMouseButtons.clear();
            this.mouseDelta.x = 0;
            this.mouseDelta.y = 0;
        });
        
        window.addEventListener('focus', () => {
            isWindowFocused = true;
        });
        
        // Auto-relock when window regains focus (fixes alt-tab issue)
        // Note: Browsers require user gesture for pointer lock, so we can't auto-lock on focus
        // Instead, we'll rely on the click handler to re-lock
        window.addEventListener('focus', () => {
            // Clear all keys again to ensure clean state (in case blur didn't fire)
            this.keys.clear();
            this.mouseButtons.clear();
            this.previousKeys.clear();
            this.previousMouseButtons.clear();
            
            // Reset mouse delta to prevent unwanted movement when regaining focus
            this.mouseDelta.x = 0;
            this.mouseDelta.y = 0;
            
            // Don't auto-lock here - browsers require user gesture
            // User can click to re-lock via the click handler
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
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
    }
}
