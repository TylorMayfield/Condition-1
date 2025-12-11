import { HUDComponent } from './HUDComponent';
import { Game } from '../../../engine/Game';
import * as THREE from 'three';

export class Compass extends HUDComponent {
    private game: Game;
    private tape: HTMLElement | null = null;

    constructor(game: Game) {
        super();
        this.game = game;
        this.createDOM();
    }

    private createDOM() {
        // Container Stying
        this.container.style.position = 'absolute';
        this.container.style.top = '20px';
        this.container.style.left = '50%';
        this.container.style.transform = 'translateX(-50%)';
        this.container.style.width = '300px';
        this.container.style.height = '24px';
        this.container.style.border = '1px solid #00ff00';
        this.container.style.borderRadius = '4px';
        this.container.style.overflow = 'hidden';
        this.container.style.background = 'rgba(0, 50, 0, 0.5)';

        // Center Indicator
        const centerMark = document.createElement('div');
        centerMark.style.position = 'absolute';
        centerMark.style.top = '0';
        centerMark.style.left = '50%';
        centerMark.style.width = '2px';
        centerMark.style.height = '100%';
        centerMark.style.backgroundColor = '#ffff00'; // Yellow center
        centerMark.style.transform = 'translateX(-50%)';
        centerMark.style.zIndex = '2';
        this.container.appendChild(centerMark);

        // Tape (Holds markers)
        this.tape = document.createElement('div');
        this.tape.style.position = 'absolute';
        this.tape.style.top = '0';
        this.tape.style.left = '0';
        this.tape.style.width = '100%';
        this.tape.style.height = '100%';
        this.container.appendChild(this.tape);
    }

    public update(_dt: number): void {
        if (!this.tape) return;

        // Clear previous markers
        this.tape.innerHTML = '';

        // Player Yaw
        const euler = new THREE.Euler().setFromQuaternion(this.game.camera.quaternion, 'YXZ');
        let yaw = euler.y;

        const cardinals = [
            { label: 'N', rad: 0 },
            { label: 'NW', rad: Math.PI / 4 },
            { label: 'W', rad: Math.PI / 2 },
            { label: 'SW', rad: 3 * Math.PI / 4 },
            { label: 'S', rad: Math.PI },
            { label: 'SE', rad: -3 * Math.PI / 4 },
            { label: 'E', rad: -Math.PI / 2 },
            { label: 'NE', rad: -Math.PI / 4 }
        ];

        // Visible FOV on compass (width in radians)
        const visibleArc = THREE.MathUtils.degToRad(120);
        const widthPx = 300;
        const pxPerRad = widthPx / visibleArc;

        for (const dir of cardinals) {
            // Calculate delta
            let delta = dir.rad - yaw;

            // Normalize delta to -PI..PI
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;

            // Check if visible
            if (Math.abs(delta) < visibleArc / 2) {
                // Render
                const left = (widthPx / 2) + (delta * -1 * pxPerRad);

                const marker = document.createElement('div');
                marker.style.position = 'absolute';
                marker.style.left = `${left}px`;
                marker.style.top = '2px';
                marker.style.transform = 'translateX(-50%)';
                marker.style.color = dir.label.length === 1 ? '#fff' : '#aaa';
                marker.style.fontWeight = dir.label.length === 1 ? 'bold' : 'normal';
                marker.innerText = dir.label;
                this.tape.appendChild(marker);
            }
        }
    }
}
