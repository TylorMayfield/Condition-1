import { SettingsManager } from '../game/SettingsManager';

export class Input {
    public keys: Map<string, boolean> = new Map();
    private mouseButtons: Map<number, boolean> = new Map();
    private previousMouseButtons: Map<number, boolean> = new Map();
    public mouseDelta: { x: number, y: number } = { x: 0, y: 0 };
    public mousePosition: { x: number, y: number } = { x: 0, y: 0 }; // Normalized -1 to 1
    public isPointerLocked: boolean = false;
    public isEditorActive: boolean = false;
    public autoLock: boolean = true;
    private pointerLockPending: boolean = false;
    private pointerLockTimeout: ReturnType<typeof setTimeout> | null = null;
    private previousKeys: Map<string, boolean> = new Map();
    private settingsManager: SettingsManager;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.autoLock && !this.isPointerLocked && !this.isInteractiveOverlayVisible() && !this.isEditorActive) {
                e.preventDefault();
                this.mouseButtons.set(0, false);
                void this.lockCursor();
                return;
            }
            this.mouseButtons.set(e.button, true);
            this.keys.set(`Mouse${e.button}`, true);
        });
        window.addEventListener('mouseup', (e) => {
            this.mouseButtons.set(e.button, false);
            this.keys.set(`Mouse${e.button}`, false);
        });

        document.addEventListener('mousemove', (e) => {
            this.mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;

            this.mouseDelta.x += e.movementX;
            this.mouseDelta.y += e.movementY;
        });

        document.addEventListener('pointerlockchange', () => {
            this.pointerLockPending = false;
            if (this.pointerLockTimeout) clearTimeout(this.pointerLockTimeout);
            this.pointerLockTimeout = null;
            const wasLocked = this.isPointerLocked;
            this.isPointerLocked = !!document.pointerLockElement;

            if (!this.isPointerLocked && wasLocked) {
                this.mouseButtons.clear();
                this.previousMouseButtons.clear();
                this.mouseDelta.x = 0;
                this.mouseDelta.y = 0;
            }
        });

        document.addEventListener('pointerlockerror', () => {
            this.pointerLockPending = false;
            if (this.pointerLockTimeout) clearTimeout(this.pointerLockTimeout);
            this.pointerLockTimeout = null;
            console.warn('Pointer lock error - may need user gesture to re-lock');
            this.mouseButtons.clear();
            this.previousMouseButtons.clear();
        });

        document.addEventListener('click', () => {
            if (this.autoLock && !this.isPointerLocked && !this.isInteractiveOverlayVisible() && !this.isEditorActive) {
                void this.lockCursor();
            }
        });

        // Clear input when the tab/window loses focus (prevents stuck keys after alt-tab).
        window.addEventListener('blur', () => this.clearInputState());

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.clearInputState();
            }
        });
    }

    private onKeyDown = (e: KeyboardEvent): void => {
        this.keys.set(e.code, true);
    };

    private onKeyUp = (e: KeyboardEvent): void => {
        this.keys.set(e.code, false);
    };

    /** Reset all input state — call when focus is lost or menus take over. */
    public clearInputState(): void {
        this.keys.clear();
        this.mouseButtons.clear();
        this.previousKeys.clear();
        this.previousMouseButtons.clear();
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
    }

    private isInteractiveOverlayVisible(): boolean {
        const overlay = document.getElementById('menu-overlay');
        const menuVisible = !!overlay && overlay.style.display !== 'none';
        const loadingVisible = !!document.getElementById('loading-screen');
        const buyMenu = document.querySelector<HTMLElement>('.hud-buy-menu');
        const buyVisible = !!buyMenu && buyMenu.style.display !== 'none';
        return menuVisible || loadingVisible || buyVisible;
    }

    public async lockCursor(): Promise<boolean> {
        if (this.isPointerLocked || document.pointerLockElement) return true;
        if (this.pointerLockPending || this.isInteractiveOverlayVisible() || this.isEditorActive) return false;
        this.pointerLockPending = true;
        this.pointerLockTimeout = setTimeout(() => {
            this.pointerLockPending = false;
            this.pointerLockTimeout = null;
        }, 1500);
        try {
            const target = document.querySelector<HTMLCanvasElement>('canvas') ?? document.body;
            if (target instanceof HTMLElement) {
                if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
                target.focus({ preventScroll: true });
            }
            await target.requestPointerLock();
            return true;
        } catch (error) {
            this.pointerLockPending = false;
            if (this.pointerLockTimeout) clearTimeout(this.pointerLockTimeout);
            this.pointerLockTimeout = null;
            console.warn('Pointer lock request failed', error);
            return false;
        }
    }

    public unlockCursor() {
        this.pointerLockPending = false;
        if (this.pointerLockTimeout) clearTimeout(this.pointerLockTimeout);
        this.pointerLockTimeout = null;
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
