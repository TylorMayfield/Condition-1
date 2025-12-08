export class Input {
    public keys: Map<string, boolean> = new Map();
    private mouseButtons: Map<number, boolean> = new Map();
    public mouseDelta: { x: number, y: number } = { x: 0, y: 0 };
    public isPointerLocked: boolean = false;
    private previousKeys: Map<string, boolean> = new Map();

    constructor() {
        window.addEventListener('keydown', (e) => this.keys.set(e.code, true));
        window.addEventListener('keyup', (e) => this.keys.set(e.code, false));
        window.addEventListener('mousedown', (e) => this.mouseButtons.set(e.button, true));
        window.addEventListener('mouseup', (e) => this.mouseButtons.set(e.button, false));

        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                this.mouseDelta.x += e.movementX;
                this.mouseDelta.y += e.movementY;
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = !!document.pointerLockElement;
        });

        // Removed auto-lock on click to allow Game class to handle it
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

    public setMouseButton(button: number, state: boolean): void {
        this.mouseButtons.set(button, state);
    }

    public update() {
        // Update previous keys
        this.previousKeys = new Map(this.keys);
    }

    // Call this specifically in game loop BEFORE update logic if we want to reset deltas per frame
    // But since 'mousemove' fires asynchronously, it's better to read it then reset it.
    public flushMouseDelta() {
        // Implementation detail: we might want to let the game loop read it then clear it
        // For now, let's just assume the user reads it.
    }
}
