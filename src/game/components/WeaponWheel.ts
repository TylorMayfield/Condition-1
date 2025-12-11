import { Game } from '../../engine/Game';

export class WeaponWheel {
    private game: Game;
    private container!: HTMLDivElement;
    private segments: HTMLDivElement[] = [];
    private isVisible: boolean = false;
    private selectedIndex: number = -1;

    constructor(game: Game) {
        this.game = game;
        this.createDOM();
    }

    private createDOM() {
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '50%';
        this.container.style.left = '50%';
        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.width = '300px';
        this.container.style.height = '300px';
        this.container.style.borderRadius = '50%';
        
        // Match Scoreboard Style
        this.container.style.background = 'radial-gradient(circle, rgba(20,30,20,0.8) 0%, rgba(0,0,0,0.9) 100%)';
        this.container.style.backdropFilter = 'blur(10px)';
        this.container.style.display = 'none';
        this.container.style.zIndex = '1000';
        
        // Green Glass Border
        this.container.style.border = '2px solid rgba(0, 255, 100, 0.3)';
        this.container.style.boxShadow = '0 0 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,255,100,0.1)';
        this.container.style.fontFamily = "'Segoe UI', Roboto, sans-serif";

        document.body.appendChild(this.container);
    }

    public show() {
        if (this.isVisible) return;
        this.isVisible = true;
        this.container.style.display = 'block';
        this.populate();
        this.game.input.unlockCursor(); // Need cursor to select
        
        // Add listener
        this.boundMouseMove = this.handleMouseMove.bind(this);
        document.addEventListener('mousemove', this.boundMouseMove);
    }

    public hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.container.style.display = 'none';
        this.game.input.lockCursor(); // Lock cursor back

        // Remove listener
        if (this.boundMouseMove) {
            document.removeEventListener('mousemove', this.boundMouseMove);
            this.boundMouseMove = null;
        }

        // Apply selection
        if (this.selectedIndex !== -1) {
            this.game.player.switchWeapon(this.selectedIndex);
        }
    }

    private boundMouseMove: ((e: MouseEvent) => void) | null = null;

    public getVisible() {
        return this.isVisible;
    }

    private populate() {
        this.container.innerHTML = '';
        this.segments = [];
        const weapons = (this.game.player as any).weapons; // Access private weapons via cast or public getter if available
        // Actually we should expose weapons getter on Player. For now assume cast.
        // Wait, I should add public getter to Player first. 
        // Or assume I can access it. I'll cast to any for now.

        const count = weapons.length;
        const radius = 100;
        const center = { x: 150, y: 150 };

        for (let i = 0; i < count; i++) {
            // Weapon variable unused but loop needed
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2; // Start at top
            
            const segment = document.createElement('div');
            segment.style.position = 'absolute';
            segment.style.width = '60px';
            segment.style.height = '60px';
            segment.style.borderRadius = '50%';
            segment.style.backgroundColor = 'rgba(0, 50, 25, 0.4)'; // Dark Green Tint
            segment.style.border = '1px solid rgba(0, 255, 100, 0.2)';
            segment.style.display = 'flex';
            segment.style.alignItems = 'center';
            segment.style.justifyContent = 'center';
            segment.style.color = '#fff';
            segment.style.fontSize = '12px';
            segment.style.fontWeight = '700';
            segment.style.letterSpacing = '1px';
            segment.style.textShadow = '0 0 10px rgba(0,255,100,0.5)';
            segment.style.textAlign = 'center';
            segment.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
            segment.innerText = i === 0 ? 'RIFLE' : (i === 1 ? 'SNIPER' : `WPN ${i+1}`);
            
            // Position
            const x = center.x + Math.cos(angle) * radius - 30;
            const y = center.y + Math.sin(angle) * radius - 30;
            segment.style.left = `${x}px`;
            segment.style.top = `${y}px`;

            this.container.appendChild(segment);
            this.segments.push(segment);
            
            // Highlight if current
            // Could set initial selection
        }

        // Center Indicator
        const centerInd = document.createElement('div');
        centerInd.style.position = 'absolute';
        centerInd.style.top = '50%';
        centerInd.style.left = '50%';
        centerInd.style.transform = 'translate(-50%, -50%)';
        centerInd.style.width = '10px';
        centerInd.style.height = '10px';
        centerInd.style.borderRadius = '50%';
        centerInd.style.backgroundColor = '#4dffaa';
        centerInd.style.boxShadow = '0 0 10px #4dffaa';
        this.container.appendChild(centerInd);
    }

    public update() {
        // Input handled by event listener
    }

    public handleMouseMove(e: MouseEvent) {
        if (!this.isVisible) return;
        
        const rect = this.container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        
        // Calculate angle
        let angle = Math.atan2(dy, dx); // -PI to PI
        angle += Math.PI / 2; // Rotate so top is 0
        if (angle < 0) angle += Math.PI * 2;
        
        // Determine segment
        const weapons = (this.game.player as any).weapons;
        const count = weapons.length;
        const segmentAngle = (Math.PI * 2) / count;
        
        // Normalize angle to match segment centers (0 is top-center for item 0? No, item 0 is usually at angle 0)
        // My layout: 0 is -PI/2 (top). 
        // angle var is now 0 at top, increasing clockwise.
        
        // We need to shift by half segment to make the segment centered on the angle
        let selection = Math.floor((angle + segmentAngle/2) / segmentAngle);
        if (selection >= count) selection = 0;
        
        this.selectedIndex = selection;
        this.updateSelectionVisuals();
    }

    private updateSelectionVisuals() {
        for (let i = 0; i < this.segments.length; i++) {
            if (i === this.selectedIndex) {
                this.segments[i].style.backgroundColor = 'rgba(0, 255, 100, 0.3)'; // Highlight Green
                this.segments[i].style.borderColor = 'rgba(0, 255, 100, 0.8)';
                this.segments[i].style.transform = 'scale(1.2)';
                this.segments[i].style.zIndex = '2';
                this.segments[i].style.boxShadow = '0 0 20px rgba(0, 255, 100, 0.4)';
            } else {
                this.segments[i].style.backgroundColor = 'rgba(0, 50, 25, 0.4)';
                this.segments[i].style.borderColor = 'rgba(0, 255, 100, 0.2)';
                this.segments[i].style.transform = 'scale(1.0)';
                this.segments[i].style.zIndex = '1';
                this.segments[i].style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
            }
        }
    }
}
