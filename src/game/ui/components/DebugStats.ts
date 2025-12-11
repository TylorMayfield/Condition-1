import { HUDComponent } from './HUDComponent';
import { Game } from '../../../engine/Game';
import * as THREE from 'three';

export class DebugStats extends HUDComponent {
    private game: Game;

    private fpsDisplay: HTMLElement;
    private posDisplay: HTMLElement;
    private velDisplay: HTMLElement;
    private navDisplay: HTMLElement;
    private aiDebugContainer: HTMLElement;

    private frameCount: number = 0;
    private timeElapsed: number = 0;
    private prevPos: THREE.Vector3 = new THREE.Vector3();
    private debugAIEnabled: boolean = false;

    constructor(game: Game) {
        super();
        this.game = game;

        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.fontFamily = 'monospace';
        this.container.style.pointerEvents = 'none';

        this.fpsDisplay = this.createFPSDisplay();
        this.posDisplay = this.createPosDisplay();
        this.velDisplay = this.createVelDisplay();
        this.navDisplay = this.createNavDisplay();
        this.aiDebugContainer = this.createAIDebugContainer();

        this.container.appendChild(this.fpsDisplay);
        this.container.appendChild(this.posDisplay);
        this.container.appendChild(this.velDisplay);
        this.container.appendChild(this.navDisplay);
        this.container.appendChild(this.aiDebugContainer);
    }

    private createFPSDisplay(): HTMLElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '10px';
        div.style.left = '10px';
        div.style.fontSize = '14px';
        div.style.color = '#00ff00';
        div.innerText = 'FPS: 60';
        return div;
    }

    private createPosDisplay(): HTMLElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '50px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.fontSize = '12px';
        div.style.color = 'rgba(0, 255, 0, 0.7)';
        div.innerText = 'POS: 0 0 0';
        return div;
    }

    private createVelDisplay(): HTMLElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '70px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.fontSize = '12px';
        div.style.color = 'rgba(0, 255, 255, 0.7)';
        div.innerText = 'VEL: 0.00 m/s';
        return div;
    }

    private createNavDisplay(): HTMLElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '30px';
        div.style.left = '10px';
        div.style.fontSize = '12px';
        div.style.color = '#ffff00';
        div.innerText = 'NAV: Loading...';
        return div;
    }

    private createAIDebugContainer(): HTMLElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '0';
        div.style.left = '0';
        div.style.width = '100%';
        div.style.height = '100%';
        div.style.pointerEvents = 'none';
        return div;
    }

    public update(dt: number): void {
        this.frameCount++;
        this.timeElapsed += dt;
        if (this.timeElapsed >= 1.0) {
            this.fpsDisplay.innerText = `FPS: ${this.frameCount}`;
            this.frameCount = 0;
            this.timeElapsed = 0;
        }

        // Update Nav Stats
        if (this.game.recastNav) {
            const agentCount = this.game.recastNav.getRegisteredAgentCount();
            this.navDisplay.innerText = `NAV: Recast Active (${agentCount} Agents)`;
            this.navDisplay.style.color = '#00ff00';
        } else {
            this.navDisplay.innerText = `NAV: Recast Missing`;
            this.navDisplay.style.color = 'red';
        }

        // Update Position
        const p = this.game.camera.position;
        this.posDisplay.innerText = `POS: ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`;

        // Update Velocity
        const currentPos = this.game.camera.position;
        const dx = currentPos.x - this.prevPos.x;
        const dz = currentPos.z - this.prevPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        let speed = 0;
        if (dt > 0.001) {
            speed = dist / dt;
        }

        this.velDisplay.innerText = `VEL: ${speed.toFixed(2)} m/s`;
        this.prevPos.copy(currentPos);

        // AI Debug Toggle
        if (this.game.input.getKeyDown('KeyP')) {
            this.debugAIEnabled = !this.debugAIEnabled;
            console.log(`AI Debug Overlay: ${this.debugAIEnabled}`);
        }

        if (this.debugAIEnabled) {
            this.updateAIDebugOverlay();
        } else {
            this.aiDebugContainer.innerHTML = '';
        }
    }

    private updateAIDebugOverlay() {
        this.aiDebugContainer.innerHTML = '';

        const width = window.innerWidth;
        const height = window.innerHeight;

        // Iterate Game Objects
        for (const go of this.game.getGameObjects()) {
            const enemy = go as any;
            if (enemy.ai && enemy.body) {
                const ai = enemy.ai;
                const pos = enemy.body.position;
                const vec = new THREE.Vector3(pos.x, pos.y + 2.2, pos.z); // Above head

                // Project to Screen
                vec.project(this.game.camera);

                // Check if in front of camera
                if (vec.z < 1) {
                    const x = (vec.x * 0.5 + 0.5) * width;
                    const y = (-(vec.y * 0.5) + 0.5) * height;

                    const label = document.createElement('div');
                    label.style.position = 'absolute';
                    label.style.left = `${x}px`;
                    label.style.top = `${y}px`;
                    label.style.transform = 'translate(-50%, -100%)';
                    label.style.color = '#fff';
                    label.style.fontSize = '12px';
                    label.style.backgroundColor = 'rgba(0,0,0,0.5)';
                    label.style.padding = '2px 5px';
                    label.style.borderRadius = '3px';
                    label.style.whiteSpace = 'nowrap';
                    label.style.border = '1px solid #fff';

                    const states = ['Idle', 'Chase', 'Attack', 'Roam', 'Alert', 'TakeCover', 'Flank', 'Advance', 'Follow'];
                    const stateName = states[ai.state] || 'Unknown';

                    let vel = '0';
                    if (this.game.recastNav && ai.entityId) {
                        const v = this.game.recastNav.getAgentVelocity(ai.entityId);
                        if (v) vel = v.length().toFixed(2);
                    }

                    const targetName = ai.target ? (ai.target.name || 'Target') : 'None';

                    label.innerHTML = `
                        <b>${enemy.name || 'Enemy'}</b> [${ai.entityId}]<br>
                        State: <span style="color:yellow">${stateName}</span><br>
                        Target: ${targetName}<br>
                        Vel: ${vel} m/s<br>
                        HP: ${enemy.health}
                     `;

                    this.aiDebugContainer.appendChild(label);
                }
            }
        }
    }
}
