import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { Weapon } from './Weapon';
import { Enemy } from '../Enemy';

import type { AIPersonality } from '../ai/AIPersonality';

export interface FireContext {
    moving?: boolean;
    suppressed?: boolean;
    distance?: number;
    personality?: AIPersonality;
    accuracyScale?: number;
    inCover?: boolean;
}

export class EnemyWeapon extends Weapon {
    private burstShotsRemaining = 0;
    private burstPauseUntil = 0;

    constructor(game: Game, owner: Enemy) {
        super(game, owner);
        this.createWeaponModel();

        this.damage = 8;
        this.fireRate = 120;
        this.muzzleVelocity = 80;
        this.magazineSize = 30;
        this.currentAmmo = 30;
        this.reserveAmmo = 90;
        this.reloadTime = 2200;
    }

    private createWeaponModel() {
        const barrelGeo = new THREE.BoxGeometry(0.1, 0.1, 0.5);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.set(0, 0, 0.3);
        this.mesh.add(barrel);
    }

    public update(_dt: number) {
        if (this.currentAmmo <= 0 && !this.isReloading && this.reserveAmmo > 0) {
            void this.reload();
        }
    }

    public aimAt(targetPosition: THREE.Vector3) {
        this.mesh.lookAt(targetPosition);
    }

    /**
     * Fire in short bursts with pauses — closer to human rifle discipline.
     */
    public pullTrigger(targetPosition: THREE.Vector3, context: FireContext = {}) {
        const now = Date.now();
        if (this.isReloading || now < this.burstPauseUntil) return;

        if (this.burstShotsRemaining <= 0) {
            if (now - this.lastShot < 500 + Math.random() * 400) return;
            this.burstShotsRemaining = 2 + Math.floor(Math.random() * 3);
        }

        if (now - this.lastShot < this.fireRate) return;

        const worldMuzzle = new THREE.Vector3();
        this.mesh.children[0].getWorldPosition(worldMuzzle);

        const direction = targetPosition.clone().sub(worldMuzzle).normalize();

        let spread = 0.08;
        if (context.moving) spread += 0.06;
        if (context.suppressed) spread += 0.04;
        if (context.inCover) spread -= 0.02;
        if (context.distance && context.distance > 25) spread += 0.04;
        if (context.distance && context.distance > 35) spread += 0.06;
        if (context.personality === 1) spread *= 0.55; // Sniper
        if (context.personality === 2 && !context.moving) spread *= 0.75; // Tactical planted shots
        if (context.accuracyScale) spread *= context.accuracyScale;
        spread = Math.max(0.02, spread);

        direction.x += (Math.random() - 0.5) * spread;
        direction.y += (Math.random() - 0.5) * spread;
        direction.z += (Math.random() - 0.5) * spread;
        direction.normalize();

        const originalDamage = this.damage;
        this.damage = Math.floor(4 + Math.random() * 7);
        this.shoot(worldMuzzle, direction);
        this.damage = originalDamage;

        this.burstShotsRemaining--;
        if (this.burstShotsRemaining <= 0) {
            this.burstPauseUntil = now + 450 + Math.random() * 750;
        }
    }

    public dispose() {
        super.dispose();
    }
}
