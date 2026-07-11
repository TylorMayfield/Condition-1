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
        this.container.className = 'hud-compass';

        const centerMark = document.createElement('div');
        centerMark.className = 'hud-compass__center';
        this.container.appendChild(centerMark);

        this.tape = document.createElement('div');
        this.tape.className = 'hud-compass__tape';
        this.container.appendChild(this.tape);
    }

    public update(_dt: number): void {
        if (!this.tape) return;

        this.tape.innerHTML = '';

        const euler = new THREE.Euler().setFromQuaternion(this.game.camera.quaternion, 'YXZ');
        const yaw = euler.y;

        const cardinals = [
            { label: 'N', rad: 0 },
            { label: 'NW', rad: Math.PI / 4 },
            { label: 'W', rad: Math.PI / 2 },
            { label: 'SW', rad: 3 * Math.PI / 4 },
            { label: 'S', rad: Math.PI },
            { label: 'SE', rad: -3 * Math.PI / 4 },
            { label: 'E', rad: -Math.PI / 2 },
            { label: 'NE', rad: -Math.PI / 4 },
        ];

        const visibleArc = THREE.MathUtils.degToRad(120);
        const widthPx = 280;
        const pxPerRad = widthPx / visibleArc;

        for (const dir of cardinals) {
            let delta = dir.rad - yaw;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;

            if (Math.abs(delta) < visibleArc / 2) {
                const left = widthPx / 2 + delta * -1 * pxPerRad;

                const marker = document.createElement('div');
                marker.className = dir.label.length === 1
                    ? 'hud-compass__marker hud-compass__marker--cardinal'
                    : 'hud-compass__marker';
                marker.style.left = `${left}px`;
                marker.innerText = dir.label;
                this.tape.appendChild(marker);
            }
        }
    }
}
