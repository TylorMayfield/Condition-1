import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { Weapon } from './Weapon';
import { Enemy } from '../Enemy';

export class EnemyWeapon extends Weapon {
    constructor(game: Game, owner: Enemy) {
        super(game, owner);
        this.createWeaponModel();

        // Enemy Weapon Stats
        this.damage = 10; // Lower damage than player
        this.fireRate = 500; // Slower fire rate
        this.muzzleVelocity = 80;
        this.magazineSize = 1000; // Infinite ammo mostly
        this.currentAmmo = 1000;
    }

    private createWeaponModel() {
        // Simple Enemy Gun (Grey Box)
        const barrelGeo = new THREE.BoxGeometry(0.1, 0.1, 0.5);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.set(0, 0, 0.3); // Forward relative to hand
        this.mesh.add(barrel);
    }

    public update(_dt: number) {
        // AI handles aiming, this just updates internals if needed
        // Helper to visualize?
    }

    public aimAt(targetPosition: THREE.Vector3) {
        this.mesh.lookAt(targetPosition);
    }

    public pullTrigger(targetPosition: THREE.Vector3) {
        const now = Date.now();
        if (now - this.lastShot > this.fireRate) {
            // Muzzle position
            // In world space, mesh is attached to enemy hand/body.
            // We need world position of muzzle.
            const worldMuzzle = new THREE.Vector3();
            this.mesh.children[0].getWorldPosition(worldMuzzle);

            // Direction with slight inaccuracy
            const direction = targetPosition.clone().sub(worldMuzzle).normalize();

            // Add spread (more human-like inaccuracy)
            const spreadAmount = 0.15; // Increased from 0.05
            direction.x += (Math.random() - 0.5) * spreadAmount;
            direction.y += (Math.random() - 0.5) * spreadAmount;
            direction.z += (Math.random() - 0.5) * spreadAmount;
            direction.normalize();

            // Randomize damage for this shot (5 to 15)
            const originalDamage = this.damage;
            this.damage = Math.floor(5 + Math.random() * 11);

            this.shoot(worldMuzzle, direction);
            this.createMuzzleFlash();

            this.damage = originalDamage; // Restore base damage (though it doesn't matter much if we randomize every time)
        }
    }

    // State for Muzzle Flash
    private currentMuzzleFlash: THREE.Object3D[] = [];
    private muzzleFlashTimeout: any = null;

    private createMuzzleFlash() {
        // remove existing flash if present to avoid stacking
        if (this.currentMuzzleFlash.length > 0) {
            this.currentMuzzleFlash.forEach(obj => {
                this.mesh.remove(obj);
            });
            this.currentMuzzleFlash = [];
        }
        if (this.muzzleFlashTimeout) {
            clearTimeout(this.muzzleFlashTimeout);
            this.muzzleFlashTimeout = null;
        }

        // Create flash light
        const flashLight = new THREE.PointLight(0xffaa00, 2, 5); // Slightly smaller for 3rd person
        flashLight.position.set(0, 0, 0.8); // At barrel tip (barrel is up to 0.8z roughly from center?)
        // Adjusted pos based on box geometry (0.5 length, positioned 0.3 z) -> tip is at 0.3 + 0.25 = 0.55 z relative to parent?
        // Let's guess 0.6
        flashLight.position.set(0, 0, 0.6);
        this.mesh.add(flashLight);
        this.currentMuzzleFlash.push(flashLight);

        // Create flash sprite
        const spriteMaterial = new THREE.SpriteMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        const flashSprite = new THREE.Sprite(spriteMaterial);
        flashSprite.scale.set(0.5, 0.5, 0.5); // Visible scale
        flashSprite.position.set(0, 0, 0.6);
        this.mesh.add(flashSprite);
        this.currentMuzzleFlash.push(flashSprite);

        // Add slight random rotation to sprite for variety
        flashSprite.material.rotation = Math.random() * Math.PI * 2;

        // Remove after 20ms
        this.muzzleFlashTimeout = setTimeout(() => {
            if (this.currentMuzzleFlash.length > 0) {
                this.mesh.remove(flashLight);
                this.mesh.remove(flashSprite);
                flashLight.dispose();
                spriteMaterial.dispose();
                this.currentMuzzleFlash = [];
            }
            this.muzzleFlashTimeout = null;
        }, 30); // Slightly longer for TPS visibility
    }
}
