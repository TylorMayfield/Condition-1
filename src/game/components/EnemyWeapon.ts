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

            this.damage = originalDamage; // Restore base damage (though it doesn't matter much if we randomize every time)
        }
    }

    // State for Muzzle Flash
    // Optimized: Removed Muzzle Flash completely per user request

    public dispose() {
        super.dispose();
    }
}
