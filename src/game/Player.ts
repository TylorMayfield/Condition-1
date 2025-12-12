import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameObject } from '../engine/GameObject';
import { Game } from '../engine/Game';
import { PlayerController } from './components/PlayerController';
import { WeaponSystem } from './components/WeaponSystem';
import { Weapon } from './components/Weapon';
import { SniperRifle } from './components/SniperRifle';
import { Grenade } from './components/Grenade';

export class Player extends GameObject {
    public health: number = 100;
    public damageDealt: number = 0; // Track damage for TDM scoring

    private controller: PlayerController;
    private weapons: Weapon[] = [];
    private currentWeaponIndex: number = 0;
    public grenadeCount: number = 3;

    // Spectator State
    public isSpectating: boolean = false;

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

        // Init Weapons
        this.addWeapon(new WeaponSystem(game, this)); // Assault Rifle
        this.addWeapon(new SniperRifle(game, this));  // Sniper Rifle
        this.switchWeapon(0);

        // Hitbox Mesh (for Ballistics Detection)
        // Cylinder representing standing player (Height 1.8m, Radius 0.4m)
        const hitboxGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8);
        hitboxGeo.translate(0, 0.4, 0); // Offset center to align with body (Sphere center at 0.5, Cylinder center needs to be 0.9)
        const hitboxMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0, // Invisible but hittable
            depthWrite: false
        });
        this.mesh = new THREE.Mesh(hitboxGeo, hitboxMat);
        this.mesh.name = 'hitbox_body'; // Player is treated as body shot for balancing
        this.game.scene.add(this.mesh);
    }

    public update(dt: number) {
        // Toggle HUD visibility based on spectator state
        this.game.sceneHUD.visible = !this.isSpectating;

        if (this.isSpectating) return;

        if (this.health <= 0) {
            // Death State
            if (this.body) {
                // If we had a death mesh it would go here. 
                // Currently just camera.
                this.game.camera.position.copy(this.body.position as any);
                this.game.camera.quaternion.copy(this.body.quaternion as any);
            }
            return;
        }

        // Custom update to keep hitbox upright (ignore rolling sphere body rotation)
        if (this.body && this.mesh) {
            this.mesh.position.copy(this.body.position as any);
            this.mesh.quaternion.set(0, 0, 0, 1); // Stay upright
        }

        // Delegate to components
        this.controller.updatePhysics(dt);

        // Update current weapon
        const currentWeapon = this.getCurrentWeapon();
        if (currentWeapon) {
            // Weapon switching is now handled by WeaponSelector in HUDManager

            // Grenade Input
            if (this.game.input.getKeyDown('KeyG')) {
                this.throwGrenade();
            }

            // Scroll handling would happen in input listener usually, 
            // but we can poll for now if Input class supports delta, 
            // or just rely on Controller.

            (currentWeapon as any).update(dt, this.game.camera, this.controller);
        }

        this.updateHUD();
    }

    public updateLook(dt: number) {
        if (this.isSpectating) return;
        this.controller.updateLook(dt);
    }

    public addWeapon(weapon: Weapon) {
        this.weapons.push(weapon);
        weapon.mesh.visible = false; // Hide by default
    }

    public switchWeapon(index: number) {
        if (index < 0 || index >= this.weapons.length) return;
        if (index === this.currentWeaponIndex && this.weapons[this.currentWeaponIndex].mesh.visible) return;

        // Hide old
        if (this.getCurrentWeapon()) {
            this.getCurrentWeapon().mesh.visible = false;
        }

        this.currentWeaponIndex = index;

        // Show new
        const newWeapon = this.getCurrentWeapon();
        if (newWeapon) {
            newWeapon.mesh.visible = true;
            // Reset ADS/States if needed?
        }
    }

    public nextWeapon() {
        let nextIndex = this.currentWeaponIndex + 1;
        if (nextIndex >= this.weapons.length) nextIndex = 0;
        this.switchWeapon(nextIndex);
    }

    public previousWeapon() {
        let prevIndex = this.currentWeaponIndex - 1;
        if (prevIndex < 0) prevIndex = this.weapons.length - 1;
        this.switchWeapon(prevIndex);
    }

    public throwGrenade() {
        if (this.grenadeCount <= 0) return;
        this.grenadeCount--;

        const camera = this.game.camera;
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const origin = camera.position.clone().add(dir.clone().multiplyScalar(0.5));

        // Add slight up-lob
        const velocity = dir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 5, 0));

        new Grenade(this.game, origin, velocity);

        // Update HUD (if supported)
        console.log(`Thrown Grenade! Remaining: ${this.grenadeCount}`);
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

        // Notify GameMode
        this.game.onEnemyDeath(this);
    }

    public getCurrentWeapon() {
        return this.weapons[this.currentWeaponIndex];
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

    public respawn(position: THREE.Vector3) {
        console.log("Respawning Player...");
        this.health = 100;
        this.isSpectating = false; // CRITICAL: Reset spectator mode on respawn

        // Reset Physics
        if (this.body) {
            this.body.position.set(position.x, position.y, position.z);
            this.body.velocity.set(0, 0, 0);
            this.body.angularVelocity.set(0, 0, 0);
            // Restore upright constraint if it was disabled on death
            this.body.fixedRotation = true;
            this.body.quaternion.set(0, 0, 0, 1);
            this.body.updateMassProperties();
        }

        // Reset Weapon
        const weapon = this.getCurrentWeapon();
        if (weapon) {
            weapon.currentAmmo = weapon.magazineSize;
            weapon.reserveAmmo = 20; // Or max reserve
            weapon.isReloading = false;
        }

        // Replenish Grenades
        this.grenadeCount = 3;

        // Re-enable controls if disabled
        this.game.input.lockCursor();
    }
}
