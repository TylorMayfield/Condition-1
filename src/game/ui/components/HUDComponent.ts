export abstract class HUDComponent {
    protected container: HTMLElement;
    protected parent: HTMLElement | null = null;
    protected visible: boolean = true;

    constructor() {
        this.container = document.createElement('div');
        // Default styles for all components (can be overridden)
        this.container.style.pointerEvents = 'none';
    }

    public mount(parent: HTMLElement): void {
        this.parent = parent;
        this.parent.appendChild(this.container);
        this.onMount();
    }

    public unmount(): void {
        if (this.parent && this.container.parentElement === this.parent) {
            this.parent.removeChild(this.container);
        }
        this.parent = null;
    }

    public setVisible(visible: boolean): void {
        this.visible = visible;
        this.container.style.display = visible ? 'block' : 'none';
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public abstract update(dt: number): void;

    protected onMount(): void {
        // Lifecycle hook
    }
}
