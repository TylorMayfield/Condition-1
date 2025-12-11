import { Game } from '../engine/Game';
import * as THREE from 'three';
import { WeaponWheel } from './components/WeaponWheel';

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

    // AI Debug
    private debugAIEnabled: boolean = false;
    private aiDebugContainer: HTMLDivElement;

    // Pause Menu
    private pauseMenu: HTMLDivElement;
    
    // Weapon Wheel
    private weaponWheel: WeaponWheel;


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

        this.posDisplay = this.createPosDisplay();
        this.velDisplay = this.createVelDisplay();
        this.createVignette();

        this.aiDebugContainer = document.createElement('div');
        this.aiDebugContainer.style.position = 'absolute';
        this.aiDebugContainer.style.top = '0';
        this.aiDebugContainer.style.left = '0';
        this.aiDebugContainer.style.width = '100%';
        this.aiDebugContainer.style.height = '100%';
        this.aiDebugContainer.style.pointerEvents = 'none';
        this.container.appendChild(this.aiDebugContainer);

        this.scoreboard = this.createScoreboardDisplay();

        this.navDisplay = this.createNavDisplay();

        // Pause Menu
        this.pauseMenu = this.createPauseMenu();
        // @ts-ignore

        this.weaponWheel = new WeaponWheel(game);
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
            console.log("Navmesh baking via HUD is currently disabled with Recast.");
            alert("Navmesh baking via HUD is disabled. Use the build tools.");
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
        div.style.display = 'none'; // Hidden by default
        div.style.fontFamily = "'Segoe UI', Roboto, sans-serif";
        div.style.minWidth = '700px';

        div.innerHTML = `
            <div style="
                background: linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(20,30,20,0.95) 100%);
                backdrop-filter: blur(10px);
                border: 2px solid rgba(0,255,0,0.3);
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1);
                overflow: hidden;
            ">
                <!-- Header with Round Info -->
                <div style="
                    background: linear-gradient(90deg, rgba(0,100,50,0.5) 0%, rgba(0,50,100,0.5) 100%);
                    padding: 15px 20px;
                    text-align: center;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                ">
                    <div id="scoreboard-title" style="
                        font-size: 24px;
                        font-weight: 700;
                        color: #fff;
                        text-transform: uppercase;
                        letter-spacing: 3px;
                        text-shadow: 0 0 20px rgba(0,255,100,0.5);
                    ">TEAM DEATHMATCH</div>
                    <div id="scoreboard-round" style="
                        font-size: 14px;
                        color: rgba(255,255,255,0.7);
                        margin-top: 5px;
                    ">Round 1</div>
                </div>

                <!-- Teams Container -->
                <div style="display: flex; padding: 15px; gap: 15px;">
                    <!-- TaskForce Team -->
                    <div style="flex: 1;">
                        <div style="
                            background: linear-gradient(180deg, rgba(0,100,200,0.3) 0%, transparent 100%);
                            border: 1px solid rgba(0,150,255,0.3);
                            border-radius: 8px;
                            overflow: hidden;
                        ">
                            <div style="
                                padding: 10px 15px;
                                background: rgba(0,100,200,0.2);
                                border-bottom: 1px solid rgba(0,150,255,0.3);
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="color: #4dabff; font-weight: 600; font-size: 14px;">⚔️ TASKFORCE</span>
                                <span id="taskforce-score" style="
                                    background: #0066cc;
                                    color: white;
                                    padding: 3px 12px;
                                    border-radius: 10px;
                                    font-weight: bold;
                                    font-size: 14px;
                                ">0</span>
                            </div>
                            <div id="taskforce-players" style="padding: 10px;"></div>
                        </div>
                    </div>

                    <!-- OpFor Team -->
                    <div style="flex: 1;">
                        <div style="
                            background: linear-gradient(180deg, rgba(200,50,0,0.3) 0%, transparent 100%);
                            border: 1px solid rgba(255,100,50,0.3);
                            border-radius: 8px;
                            overflow: hidden;
                        ">
                            <div style="
                                padding: 10px 15px;
                                background: rgba(200,50,0,0.2);
                                border-bottom: 1px solid rgba(255,100,50,0.3);
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="color: #ff6b4a; font-weight: 600; font-size: 14px;">💀 OPFOR</span>
                                <span id="opfor-score" style="
                                    background: #cc3300;
                                    color: white;
                                    padding: 3px 12px;
                                    border-radius: 10px;
                                    font-weight: bold;
                                    font-size: 14px;
                                ">0</span>
                            </div>
                            <div id="opfor-players" style="padding: 10px;"></div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="
                    padding: 10px;
                    text-align: center;
                    color: rgba(255,255,255,0.4);
                    font-size: 11px;
                    border-top: 1px solid rgba(255,255,255,0.05);
                ">Press TAB to close</div>
            </div>
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
        // Update Nav Stats
        if (this.navDisplay && this.game.recastNav) {
            const agentCount = this.game.recastNav.getRegisteredAgentCount();
            this.navDisplay.innerText = `NAV: Recast Active (${agentCount} Agents)`;
            this.navDisplay.style.color = '#00ff00';
        } else if (this.navDisplay) {
            this.navDisplay.innerText = `NAV: Recast Missing`;
            this.navDisplay.style.color = 'red';
        }

        // Display Pause Menu
        if (this.game.isPaused) {
            this.pauseMenu.style.display = 'block';
        } else {
            this.pauseMenu.style.display = 'none';
        }

        if (!this.game.player) return;

        if (this.game.input.getAction('Scoreboard')) {
            this.scoreboard.style.display = 'block';
            this.updateScoreboard();
        } else {
            this.scoreboard.style.display = 'none';
        }

        // Weapon Wheel Input (Hold X)
        if (this.weaponWheel) {
            if (this.game.input.getKey('KeyX')) {
                this.weaponWheel.show();
            } else {
                this.weaponWheel.hide();
            }
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
        // Update Compass
        this.updateCompass();

        // AI Debug Toggle
        if (this.game.input.getKeyDown('KeyP')) {
            this.debugAIEnabled = !this.debugAIEnabled;
            // Also toggle Recast debug draw
            if (this.game.recastNav) {
                // Keep navmesh on (true), toggle agents? Or just use overlay?
                // User asked for overlay. Let's keep recast debug separate or sync?
                // Let's just use overlay for now.
                console.log(`AI Debug Overlay: ${this.debugAIEnabled}`);
            }
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
            // Check if it's an Enemy (has 'ai' property)
            // Need to cast or check type.
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
                    label.style.transform = 'translate(-50%, -100%)'; // Center bottom
                    label.style.color = '#fff';
                    label.style.fontSize = '12px';
                    label.style.backgroundColor = 'rgba(0,0,0,0.5)';
                    label.style.padding = '2px 5px';
                    label.style.borderRadius = '3px';
                    label.style.whiteSpace = 'nowrap';
                    label.style.border = '1px solid #fff';

                    // Map State to String
                    const states = ['Idle', 'Chase', 'Attack', 'Roam', 'Alert', 'TakeCover', 'Flank', 'Advance', 'Follow'];
                    const stateName = states[ai.state] || 'Unknown';

                    // Velocity info
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

    private updateScoreboard() {
        if (!this.scoreboard) return;

        // Get Data
        const data = this.game.gameMode.getScoreboardData();

        // Get team containers
        const taskforcePlayers = this.scoreboard.querySelector('#taskforce-players');
        const opforPlayers = this.scoreboard.querySelector('#opfor-players');
        const taskforceScore = this.scoreboard.querySelector('#taskforce-score');
        const opforScore = this.scoreboard.querySelector('#opfor-score');
        const roundInfo = this.scoreboard.querySelector('#scoreboard-round');

        if (!taskforcePlayers || !opforPlayers) return;

        // Get round wins from game mode (if available)
        const gameMode = this.game.gameMode as any;
        if (gameMode.roundWins && taskforceScore && opforScore) {
            taskforceScore.textContent = gameMode.roundWins['TaskForce'] || '0';
            opforScore.textContent = gameMode.roundWins['OpFor'] || '0';
        }
        if (gameMode.roundNumber && roundInfo) {
            roundInfo.textContent = `Round ${gameMode.roundNumber} • First to ${gameMode.roundLimit || 5}`;
        }

        // Split players by team
        const taskforce = data.filter(p => p.team === 'TaskForce' || p.team === 'Player' || p.team === 'Blue');
        const opfor = data.filter(p => p.team === 'OpFor' || p.team === 'Red' || (p.team !== 'TaskForce' && p.team !== 'Player' && p.team !== 'Blue' && p.team !== ''));

        // Helper to create player row
        const createPlayerRow = (entry: any, isBlue: boolean) => {
            const isAlive = entry.status === 'Alive' || entry.status === 'Active';
            const isYou = entry.name === 'You';
            const bgColor = isBlue 
                ? (isAlive ? 'rgba(0,100,200,0.15)' : 'rgba(50,50,50,0.3)')
                : (isAlive ? 'rgba(200,50,0,0.15)' : 'rgba(50,50,50,0.3)');
            const borderColor = isBlue ? 'rgba(0,150,255,0.2)' : 'rgba(255,100,50,0.2)';
            
            return `
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 10px;
                    margin-bottom: 4px;
                    background: ${bgColor};
                    border: 1px solid ${borderColor};
                    border-radius: 4px;
                    opacity: ${isAlive ? '1' : '0.5'};
                ">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="
                            width: 8px;
                            height: 8px;
                            border-radius: 50%;
                            background: ${isAlive ? '#00ff00' : '#ff4444'};
                            box-shadow: 0 0 6px ${isAlive ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.3)'};
                        "></span>
                        <span style="
                            color: ${isYou ? '#ffdd00' : '#fff'};
                            font-weight: ${isYou ? '600' : '400'};
                            font-size: 13px;
                        ">${entry.name}${isYou ? ' ★' : ''}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="
                            color: ${isAlive ? 'rgba(0,255,100,0.8)' : 'rgba(255,100,100,0.8)'};
                            font-size: 11px;
                            text-transform: uppercase;
                        ">${isAlive ? '● ALIVE' : '✕ DEAD'}</span>
                        <span style="
                            background: rgba(255,255,255,0.1);
                            padding: 2px 8px;
                            border-radius: 8px;
                            font-size: 12px;
                            color: #fff;
                            min-width: 20px;
                            text-align: center;
                        ">${entry.score}</span>
                    </div>
                </div>
            `;
        };

        // Build HTML
        taskforcePlayers.innerHTML = taskforce.map(p => createPlayerRow(p, true)).join('');
        opforPlayers.innerHTML = opfor.map(p => createPlayerRow(p, false)).join('');

        // Show empty state if no players
        if (taskforce.length === 0) {
            taskforcePlayers.innerHTML = '<div style="color: rgba(255,255,255,0.3); text-align: center; padding: 20px;">No players</div>';
        }
        if (opfor.length === 0) {
            opforPlayers.innerHTML = '<div style="color: rgba(255,255,255,0.3); text-align: center; padding: 20px;">No players</div>';
        }
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
    public showRoundResult(winner: string, reason: string) {
        if (!this.roundResultDisplay) {
            this.roundResultDisplay = document.createElement('div');
            this.roundResultDisplay.style.position = 'absolute';
            this.roundResultDisplay.style.top = '30%';
            this.roundResultDisplay.style.left = '50%';
            this.roundResultDisplay.style.transform = 'translate(-50%, -50%)';
            this.roundResultDisplay.style.textAlign = 'center';
            this.roundResultDisplay.style.textShadow = '0 0 10px rgba(0,0,0,0.8)';
            this.roundResultDisplay.style.fontFamily = "'Segoe UI', sans-serif";
            this.container.appendChild(this.roundResultDisplay);
        }

        const color = winner === 'TaskForce' ? '#00ccff' : (winner === 'OpFor' ? '#ff3300' : '#ffffff');
        
        this.roundResultDisplay.innerHTML = `
            <div style="font-size: 48px; font-weight: 800; color: ${color}; text-transform: uppercase; margin-bottom: 10px;">
                ${winner ? winner + ' WINS' : 'ROUND DRAW'}
            </div>
            <div style="font-size: 24px; color: #fff; opacity: 0.8;">
                ${reason}
            </div>
        `;
        
        this.roundResultDisplay.style.display = 'block';

        // Auto hide after a few seconds
        setTimeout(() => {
            if (this.roundResultDisplay) this.roundResultDisplay.style.display = 'none';
        }, 4000);
    }
    
    private roundResultDisplay?: HTMLDivElement;
}
