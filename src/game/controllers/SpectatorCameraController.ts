
import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';

export class SpectatorCameraController {
    private game: Game;

    // State
    private currentTarget: GameObject | null = null;
    private targets: GameObject[] = [];
    private currentTargetIndex: number = 0;

    // Orbit parameters
    private radius: number = 5;
    private theta: number = 0; // Horizontal angle
    private phi: number = Math.PI / 3; // Vertical angle (from top)
    private centerOffset: THREE.Vector3 = new THREE.Vector3(0, 1.5, 0); // Look at slightly above center

    // Settings
    private sensitivity: number = 0.005;
    // private scrollSensitivity: number = 0.5;
    private minRadius: number = 2;
    private maxRadius: number = 15;

    constructor(game: Game) {
        this.game = game;
    }

    public update(_dt: number): void {
        this.handleInput();
        this.updateCameraPosition();
    }

    public setTargets(targets: GameObject[]): void {
        this.targets = targets.filter(t => !(t as any).isDead); // Only alive targets

        // If we have a current target, try to keep it or find it in new list
        if (this.currentTarget) {
            const index = this.targets.indexOf(this.currentTarget);
            if (index !== -1) {
                this.currentTargetIndex = index;
            } else {
                // Target lost (died or removed), pick next available
                this.nextTarget();
            }
        } else {
            // No current target, pick first
            if (this.targets.length > 0) {
                this.currentTargetIndex = 0;
                this.currentTarget = this.targets[0];
            }
        }
    }

    public cycleTarget(direction: 1 | -1): void {
        if (this.targets.length === 0) return;

        this.currentTargetIndex += direction;

        // Wrap around
        if (this.currentTargetIndex >= this.targets.length) this.currentTargetIndex = 0;
        if (this.currentTargetIndex < 0) this.currentTargetIndex = this.targets.length - 1;

        this.currentTarget = this.targets[this.currentTargetIndex];

        // Announce target (optional debug)
        console.log(`Spectating: ${(this.currentTarget as any).name || 'Unknown'}`);
    }

    private nextTarget(): void {
        if (this.targets.length === 0) {
            this.currentTarget = null;
            return;
        }
        // Just pick 0 or stay within bounds
        this.currentTargetIndex = 0;
        this.currentTarget = this.targets[0];
    }

    private handleInput(): void {
        // Orbit (Mouse)
        if (this.game.input.isPointerLocked) {
            const md = this.game.input.mouseDelta;
            this.theta -= md.x * this.sensitivity;
            this.phi -= md.y * this.sensitivity;

            // Clamp vertical angle to avoid flipping
            this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));
        }

        // Cycle Targets (A/D or Arrow Keys)
        if (this.game.input.getKeyDown('ArrowRight') || this.game.input.getActionDown('MoveRight')) {
            this.cycleTarget(1);
        }
        if (this.game.input.getKeyDown('ArrowLeft') || this.game.input.getActionDown('MoveLeft')) {
            this.cycleTarget(-1);
        }

        // Cycle Target (Mouse Click)
        if (this.game.input.getMouseButtonDown(0)) {
            this.cycleTarget(1);
        }

        // Zoom (Scroll)
        // Accessing raw scroll from existing input system might require an update to Input.ts or checking specific keys if scroll isn't mapped.
        // For now, let's use Up/Down arrows for zoom as fallback if scroll isn't readily available in `game.input`.
        // Actually, let's just use W/S for zoom in spectator mode
        if (this.game.input.getAction('MoveForward')) {
            this.radius = Math.max(this.minRadius, this.radius - 0.1);
        }
        if (this.game.input.getAction('MoveBackward')) {
            this.radius = Math.min(this.maxRadius, this.radius + 0.1);
        }
    }

    private updateCameraPosition(): void {
        if (!this.currentTarget || !this.currentTarget.body) return;

        // Calculate target center
        const targetPos = new THREE.Vector3(
            this.currentTarget.body.position.x,
            this.currentTarget.body.position.y,
            this.currentTarget.body.position.z
        ).add(this.centerOffset);

        // Spherical controls
        const x = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
        const y = this.radius * Math.cos(this.phi);
        const z = this.radius * Math.sin(this.phi) * Math.sin(this.theta);

        const camPos = targetPos.clone().add(new THREE.Vector3(x, y, z));

        this.game.camera.position.copy(camPos);
        this.game.camera.lookAt(targetPos);
    }
}
