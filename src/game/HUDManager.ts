import { Game } from '../engine/Game';
import * as THREE from 'three';

export class HUDManager {
    private game: Game;
    private container: HTMLDivElement;

    // Elements
    private healthDisplay: HTMLDivElement;
    private ammoDisplay: HTMLDivElement;
    private compassDisplay: HTMLDivElement;
    private compassMarker!: HTMLDivElement;
    private squadDisplay: HTMLDivElement;
    private fpsDisplay: HTMLDivElement;
    // private vignette: HTMLDivElement; // Not stored if not accessed

    private frameCount: number = 0;
    private timeElapsed: number = 0;

    constructor(game: Game) {
        this.game = game;
        this.container = document.createElement('div');
        this.container.id = 'hud-container';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.pointerEvents = 'none'; // Click through
        this.container.style.fontFamily = 'monospace';
        this.container.style.color = '#00ff00';
        this.container.style.textShadow = '1px 1px 0 #000';
        document.body.appendChild(this.container);

        this.healthDisplay = this.createHealthDisplay();
        this.ammoDisplay = this.createAmmoDisplay();
        this.compassDisplay = this.createCompassDisplay();
        this.squadDisplay = this.createSquadDisplay();
        this.fpsDisplay = this.createFPSDisplay();
        this.createVignette();
    }

    private createHealthDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.bottom = '20px';
        div.style.left = '20px';
        div.style.fontSize = '24px';
        div.innerHTML = 'HEALTH: 100%';
        this.container.appendChild(div);
        return div;
    }

    private createAmmoDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.bottom = '20px';
        div.style.right = '20px';
        div.style.fontSize = '24px';
        div.style.textAlign = 'right';
        div.innerHTML = 'AMMO: -- / --';
        this.container.appendChild(div);
        return div;
    }

    private createFPSDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '10px';
        div.style.left = '10px';
        div.style.fontSize = '14px';
        div.style.color = '#00ff00';
        div.innerText = 'FPS: 60';
        this.container.appendChild(div);
        return div;
    }

    private createVignette(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '0';
        div.style.left = '0';
        div.style.width = '100%';
        div.style.height = '100%';
        div.style.pointerEvents = 'none';
        div.style.background = 'radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,0.9) 100%)';
        // Prepend to be behind other elements
        if (this.container.firstChild) {
            this.container.insertBefore(div, this.container.firstChild);
        } else {
            this.container.appendChild(div);
        }
        return div;
    }

    private createCompassDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '20px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.width = '300px';
        div.style.height = '20px';
        div.style.border = '2px solid #00ff00';
        div.style.borderRadius = '10px';
        div.style.overflow = 'hidden';
        div.style.background = 'rgba(0, 50, 0, 0.5)';

        // Marker
        this.compassMarker = document.createElement('div');
        this.compassMarker.style.position = 'absolute';
        this.compassMarker.style.top = '0';
        this.compassMarker.style.left = '50%';
        this.compassMarker.style.width = '4px';
        this.compassMarker.style.height = '100%';
        this.compassMarker.style.backgroundColor = '#ffff00';

        div.appendChild(this.compassMarker);
        this.container.appendChild(div);
        return div;
    }

    private createSquadDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '60px';
        div.style.left = '20px';
        div.style.fontSize = '16px';
        div.innerHTML = 'SQUAD:<br>- BRAVO (FOLLOWING)';
        this.container.appendChild(div);
        return div;
    }

    public updateSquadOrder(order: number) {
        const orderName = ['FOLLOW', 'HOLD', 'ATTACK'][order] || 'UNKNOWN';
        if (this.squadDisplay) {
            this.squadDisplay.innerHTML = `SQUAD:<br>- BRAVO (${orderName})`;
        }
    }

    public update(_dt: number) {
        this.frameCount++;
        this.timeElapsed += _dt;
        if (this.timeElapsed >= 1.0) {
            this.fpsDisplay.innerText = `FPS: ${this.frameCount}`;
            this.frameCount = 0;
            this.timeElapsed = 0;
        }

        if (!this.game.player) return;

        // Update Health
        if (this.healthDisplay) {
            this.healthDisplay.innerText = `HEALTH: ${this.game.player.health}%`;
        }

        // Update Ammo
        const weapon = this.game.player.getCurrentWeapon(); // Need to ensure this exists or similar
        if (weapon) {
            this.ammoDisplay.innerHTML = `MAG: ${weapon.currentAmmo} <br> RES: ${weapon.reserveAmmo}`;
        }

        if (this.compassDisplay && this.squadDisplay) {
            // Placeholder usage
        }

        // Update Compass
        // Calculate angle to Extraction Zone
        if (this.game.extractionZone) {
            const playerPos = this.game.camera.position;
            const targetPos = this.game.extractionZone.mesh.position;

            // Player forward direction (yaw)
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.game.camera.quaternion);
            forward.y = 0;
            forward.normalize();

            // Direction to target
            const toTarget = new THREE.Vector3().subVectors(targetPos, playerPos);
            toTarget.y = 0;
            toTarget.normalize();

            // Angle difference
            // Dot product gives cos(angle). Cross product y gives sign.
            // Actually simpler: 
            // Camera Yaw
            const euler = new THREE.Euler().setFromQuaternion(this.game.camera.quaternion, 'YXZ');
            const yaw = euler.y; // Radians

            // Target Yaw
            const targetYaw = Math.atan2(targetPos.x - playerPos.x, targetPos.z - playerPos.z);

            // Delta
            let delta = targetYaw - yaw;
            // Normalize to -PI to PI
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;

            // Map delta (-PI to PI) to pixel offset in bar (say +/- 150px)
            // Clamp to FOV roughly? Or generic compass
            // Let's scroll the marker. 
            // If delta is 0 (facing), marker is at 50%.
            // If delta is PI/2 (right), marker is at 100%?

            const pxOffset = (delta / (Math.PI / 2)) * 150; // 90 degrees = full edge
            // Clamp visual
            const center = 150; // half of 300px
            let left = center + pxOffset;

            // Hide if behind
            if (Math.abs(delta) > Math.PI / 2) {
                this.compassMarker.style.display = 'none';
            } else {
                this.compassMarker.style.display = 'block';
                this.compassMarker.style.left = `${left}px`;
            }
        }
    }
}
