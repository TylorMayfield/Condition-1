import { Game } from '../engine/Game';
import * as THREE from 'three';

export class HUDManager {
    private game: Game;
    private container: HTMLDivElement;

    // Elements
    private healthDisplay: HTMLDivElement;
    private ammoDisplay: HTMLDivElement;
    
    private fpsDisplay: HTMLDivElement;
    private posDisplay: HTMLDivElement;
    private velDisplay: HTMLDivElement;
    private navDisplay: HTMLDivElement;

    // Compass
    private compassTape: HTMLDivElement;

    // Scoreboard
    private scoreboard: HTMLDivElement;


    private frameCount: number = 0;
    private timeElapsed: number = 0;
    private prevPos: THREE.Vector3 = new THREE.Vector3();

    // Pause Menu
    private pauseMenu: HTMLDivElement;
    private bakeButton: HTMLButtonElement;

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

        // Compass Setup
        const compassObj = this.createCompassDisplay();
        this.compassTape = compassObj.tape;

        this.fpsDisplay = this.createFPSDisplay();

        this.posDisplay = this.createPosDisplay();
        this.velDisplay = this.createVelDisplay();
        this.createVignette();

        this.scoreboard = this.createScoreboardDisplay();
        
        this.navDisplay = this.createNavDisplay();

        // Pause Menu
        this.pauseMenu = this.createPauseMenu();
        // @ts-ignore
        this.bakeButton = this.pauseMenu.querySelector('#bake-btn');
    }

    private createPauseMenu(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '50%';
        div.style.left = '50%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.backgroundColor = 'rgba(0, 20, 0, 0.9)';
        div.style.border = '2px solid #00ff00';
        div.style.padding = '20px';
        div.style.borderRadius = '8px';
        div.style.display = 'none';
        div.style.pointerEvents = 'auto'; // Allow clicking buttons
        div.style.textAlign = 'center';

        div.innerHTML = `
            <h2 style="color: #00ff00; margin-bottom: 20px;">PAUSED</h2>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="resume-btn" style="padding: 10px 20px; background: #004400; color: #fff; border: 1px solid #00ff00; cursor: pointer;">RESUME</button>
                <button id="bake-btn" style="padding: 10px 20px; background: #004400; color: #fff; border: 1px solid #00ff00; cursor: pointer;">BAKE NAVMESH</button>
            </div>
        `;

        this.container.appendChild(div);

        // Attach listeners
        // Need to wait for append? Element exists now.
        const resumeBtn = div.querySelector('#resume-btn') as HTMLButtonElement;
        resumeBtn.onclick = () => {
            this.game.togglePause();
        };

        const bakeBtn = div.querySelector('#bake-btn') as HTMLButtonElement;
        bakeBtn.onclick = () => {
            console.log("Baking Navmesh...");
            const json = this.game.navigationSystem.serialize();
            
            // Download file
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'navmesh.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert("Navmesh Baked & Downloaded! Move 'navmesh.json' to the public folder.");
        };

        return div;
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

    private createPosDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '50px'; // Below compass
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.fontSize = '12px';
        div.style.color = 'rgba(0, 255, 0, 0.7)';
        div.innerText = 'POS: 0 0 0';
        this.container.appendChild(div);
        return div;
    }

    private createVelDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '70px'; // Below POS
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.fontSize = '12px';
        div.style.color = 'rgba(0, 255, 255, 0.7)'; // Cyan for velocity
        div.innerText = 'VEL: 0.00 m/s';
        this.container.appendChild(div);
        return div;
    }

    private createNavDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '30px';
        div.style.left = '10px';
        div.style.fontSize = '12px';
        div.style.color = '#ffff00';
        div.innerText = 'NAV: Loading...';
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

        // Goggle vignette
        const svgMask = `data:image/svg+xml,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                <defs>
                    <radialGradient id="vignette" cx="50%" cy="50%">
                        <stop offset="60%" stop-color="white" stop-opacity="0"/>
                        <stop offset="100%" stop-color="white" stop-opacity="1"/>
                    </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#vignette)"/>
                <ellipse cx="50%" cy="100%" rx="15%" ry="8%" fill="white" opacity="0.2"/>
            </svg>
        `)}`;

        div.style.background = 'rgba(0,0,0,0.3)';
        div.style.maskImage = svgMask;
        div.style.webkitMaskImage = svgMask;
        div.style.maskSize = '100% 100%';
        div.style.webkitMaskSize = '100% 100%';

        if (this.container.firstChild) {
            this.container.insertBefore(div, this.container.firstChild);
        } else {
            this.container.appendChild(div);
        }
        return div;
    }

    private createCompassDisplay(): { container: HTMLDivElement, tape: HTMLDivElement } {
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '20px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.width = '300px';
        container.style.height = '24px';
        container.style.border = '1px solid #00ff00';
        container.style.borderRadius = '4px';
        container.style.overflow = 'hidden';
        container.style.background = 'rgba(0, 50, 0, 0.5)';

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
        container.appendChild(centerMark);

        // Tape (Holds markers)
        const tape = document.createElement('div');
        tape.style.position = 'absolute';
        tape.style.top = '0';
        tape.style.left = '0';
        tape.style.width = '100%';
        tape.style.height = '100%';
        container.appendChild(tape);

        this.container.appendChild(container);
        return { container, tape };
    }


    private createScoreboardDisplay(): HTMLDivElement {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '50%';
        div.style.left = '50%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        div.style.color = 'white';
        div.style.padding = '20px';
        div.style.borderRadius = '5px';
        div.style.minWidth = '400px';
        div.style.display = 'none'; // Hidden by default
        div.style.border = '1px solid #00ff00';
        
        // Header
        div.innerHTML = `
            <h2 style="text-align: center; border-bottom: 1px solid #00ff00; padding-bottom: 10px;">MISSION STATUS</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <thead style="text-align: left; color: #00ff00;">
                    <tr>
                        <th style="padding: 5px;">Faction</th>
                        <th style="padding: 5px;">Name</th>
                        <th style="padding: 5px;">Status</th>
                        <th style="padding: 5px;">Score</th>
                    </tr>
                </thead>
                <tbody id="scoreboard-body">
                </tbody>
            </table>
        `;
        
        this.container.appendChild(div);
        return div;
    }

    public update(_dt: number) {
        this.frameCount++;
        this.timeElapsed += _dt;
        if (this.timeElapsed >= 1.0) {
            this.fpsDisplay.innerText = `FPS: ${this.frameCount}`;
            this.frameCount = 0;
            this.timeElapsed = 0;
        }
        
        // Update Nav Stats
        if (this.navDisplay && this.game.navigationSystem) {
             // Access private nodes via cast or expose getter. 
             // Assuming I add getter or use cast.
             const nodeCount = (this.game.navigationSystem as any).nodes.length;
             this.navDisplay.innerText = `NAV: ${nodeCount} Nodes`;
             if (nodeCount === 0) this.navDisplay.style.color = 'red';
             else this.navDisplay.style.color = '#00ff00';
        }

        // Display Pause Menu
        if (this.game.isPaused) {
            this.pauseMenu.style.display = 'block';
        } else {
            this.pauseMenu.style.display = 'none';
        }

        if (!this.game.player) return;

        // Scoreboard Input
        if (this.game.input.getAction('Scoreboard')) {
            this.scoreboard.style.display = 'block';
            this.updateScoreboard();
        } else {
            this.scoreboard.style.display = 'none';
        }

        // Update Health
        if (this.healthDisplay) {
            this.healthDisplay.innerText = `HEALTH: ${this.game.player.health}%`;
        }

        // Update Ammo
        const weapon = this.game.player.getCurrentWeapon();
        if (weapon) {
            this.ammoDisplay.innerHTML = `MAG: ${weapon.currentAmmo} <br> RES: ${weapon.reserveAmmo}`;
        }

        // Update Position
        if (this.posDisplay) {
            const p = this.game.camera.position;
            // VMF coordinates are scaled by 0.02.
            this.posDisplay.innerText = `POS: ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`;
        }

        // Update Velocity (Real Speed based on Position Delta)
        if (this.velDisplay) {
            const currentPos = this.game.camera.position;
            // Horizontal distance
            const dx = currentPos.x - this.prevPos.x;
            const dz = currentPos.z - this.prevPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Avoid division by zero or massive spikes on first frame
            let speed = 0;
            if (_dt > 0.001) {
                speed = dist / _dt;
            }

            this.velDisplay.innerText = `VEL: ${speed.toFixed(2)} m/s`;

            // Update prevPos
            this.prevPos.copy(currentPos);
        }

        // Update Compass
        this.updateCompass();
    }

    private updateScoreboard() {
        if (!this.scoreboard) return;
        const tbody = this.scoreboard.querySelector('#scoreboard-body');
        if (!tbody) return;

        // Get Data
        const data = this.game.gameMode.getScoreboardData();
        
        // Sort by Score (Desc) then Name
        data.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

        // Rebuild rows
        let html = '';
        data.forEach(entry => {
            const color = entry.team === 'TaskForce' || entry.team === 'Blue' ? '#00aaff' : '#ff4444';
            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <td style="padding: 5px; color: ${color};">${entry.team}</td>
                    <td style="padding: 5px;">${entry.name}</td>
                    <td style="padding: 5px; color: ${entry.status === 'Active' || entry.status === 'Alive' ? '#00ff00' : '#888'};">${entry.status}</td>
                    <td style="padding: 5px;">${entry.score}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    private updateCompass() {
        if (!this.compassTape) return;

        // Clear previous markers (inefficient but simple)
        this.compassTape.innerHTML = '';

        // Player Yaw
        const euler = new THREE.Euler().setFromQuaternion(this.game.camera.quaternion, 'YXZ');
        let yaw = euler.y; // Radians, 0 = South (Three.js +Z is South)
        // Three JS: +Z is South, -Z is North. +X is East, -X is West.
        // Yaw starts at 0 facing -Z (North)? No, Euler 0,0,0 means looking down -Z. 
        // Let's verify standard Three.js orientation.
        // Default camera looks down -Z.
        // Rotation Y affects which way is "forward" relative to -Z.

        // Compass Directions in Radians relative to World -Z
        /* Unused reference
        const directions = [
            { label: 'N', angle: 0 },             // -Z
            { label: 'NE', angle: -Math.PI / 4 },
            { label: 'E', angle: -Math.PI / 2 },  // -X
            { label: 'SE', angle: -Math.PI * 0.75 },
            { label: 'S', angle: Math.PI },       // +Z
            { label: 'SW', angle: Math.PI * 0.75 },
            { label: 'W', angle: Math.PI / 2 },   // +X
            { label: 'NW', angle: Math.PI / 4 }
        ];
        */

        // Correcting Angles based on Three.js:
        // N = 0 (Look -Z)
        // W = +PI/2 (Look -X) -> Yaw +90 deg turns Left
        // S = PI (Look +Z)
        // E = -PI/2 (Look +X) -> Yaw -90 deg turns Right

        // Override logic:
        const cardinals = [
            { label: 'N', rad: 0 },
            { label: 'NW', rad: Math.PI / 4 },
            { label: 'W', rad: Math.PI / 2 },
            { label: 'SW', rad: 3 * Math.PI / 4 },
            { label: 'S', rad: Math.PI }, // or -PI
            { label: 'SE', rad: -3 * Math.PI / 4 },
            { label: 'E', rad: -Math.PI / 2 },
            { label: 'NE', rad: -Math.PI / 4 }
        ];

        // visible FOV on compass (width in radians)
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
                const left = (widthPx / 2) + (delta * -1 * pxPerRad); // -1 to reverse movement (turn right -> objects move left)

                const marker = document.createElement('div');
                marker.style.position = 'absolute';
                marker.style.left = `${left}px`;
                marker.style.top = '2px';
                marker.style.transform = 'translateX(-50%)';
                marker.style.color = dir.label.length === 1 ? '#fff' : '#aaa'; // Highlight main cardinals
                marker.style.fontWeight = dir.label.length === 1 ? 'bold' : 'normal';
                marker.innerText = dir.label;
                this.compassTape.appendChild(marker);
            }
        }
    }
}
