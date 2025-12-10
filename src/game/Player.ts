import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameObject } from '../engine/GameObject';
import { Game } from '../engine/Game';
import { PlayerController } from './components/PlayerController';
import { WeaponSystem } from './components/WeaponSystem';

export class Player extends GameObject {
    public health: number = 100;

    private controller: PlayerController;
    private weapon: WeaponSystem;

    constructor(game: Game) {
        super(game);
        this.team = 'Player';

        // Physics Body
        const radius = 0.5;
        const shape = new CANNON.Sphere(radius);
        this.body = new CANNON.Body({
            mass: 1, // Dynamic
            position: new CANNON.Vec3(0, 5, 0), // Spawn higher
            shape: shape,
            fixedRotation: true, // Prevent rolling
            material: new CANNON.Material({ friction: 0, restitution: 0 })
        });
        this.body.linearDamping = 0.9;

        // Init Components
        this.controller = new PlayerController(game, this);
        this.weapon = new WeaponSystem(game);
    }

    public update(dt: number) {
        if (this.health <= 0) {
            // Death State
            if (this.body) {
                this.mesh?.position.copy(this.body.position as any);
                this.game.camera.position.copy(this.body.position as any);
                this.game.camera.quaternion.copy(this.body.quaternion as any);
                // Adjust camera height for rolling head ??
                // Actually if body is sphere(0.5), local point (0, 0.4, 0)
            }
            return;
        }

        super.update(dt);

        // Delegate to components
        this.controller.update(dt);
        this.weapon.update(dt, this.game.camera, this.controller);

        this.updateHUD();
    }

    public takeDamage(amount: number) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        }
    }

    private die() {
        console.log("Player Died");
        
        // precise death physics
        if (this.body) {
            this.body.fixedRotation = false;
            this.body.updateMassProperties(); // Update inertia
            
            // Push it over
            this.body.applyImpulse(new CANNON.Vec3(2, 0, 0), new CANNON.Vec3(0, 0.5, 0));
            this.body.angularDamping = 0.5;
        }
        
        // Disable controls
        this.game.input.unlockCursor(); // Show cursor
        this.controller.dispose(); // Or disable
        // TODO: Show Game Over Screen
    }

    public getCurrentWeapon() {
        return this.weapon;
    }

    public moveTo(position: THREE.Vector3) {
        if (this.body) {
            this.body.position.set(position.x, position.y, position.z);
            this.body.velocity.set(0, 0, 0);
            this.body.angularVelocity.set(0, 0, 0);
        }
    }

    private updateHUD() {
        // Old HUD logic disabled
    }

    public setSensitivity(value: number) {
        if (this.controller) {
            this.controller.setSensitivity(value);
        }
    }
}
