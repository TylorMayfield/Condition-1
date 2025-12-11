import * as THREE from 'three';
import { Game } from '../../engine/Game';

export abstract class Weapon {
    protected game: Game;
    public mesh: THREE.Group;
    public owner: any;

    // Stats
    protected magazineSize: number = 30;
    public currentAmmo: number = 30;
    public reserveAmmo: number = 90;
    protected fireRate: number = 100; // ms
    protected reloadTime: number = 2000; // ms
    protected recoilAmount: number = 0.05;
    protected damage: number = 20;
    protected muzzleVelocity: number = 100; // m/s

    // State
    protected lastShot: number = 0;
    public isReloading: boolean = false;
    protected reloadStartTime: number = 0;
    protected currentRecoil: { x: number, y: number } = { x: 0, y: 0 };
    protected recoilRecovery: number = 0.1;

    constructor(game: Game, owner: any) {
        this.game = game;
        this.owner = owner;
        this.mesh = new THREE.Group();
    }

    public abstract update(dt: number, ...args: any[]): void;

    protected shoot(origin: THREE.Vector3, direction: THREE.Vector3) {
        if (this.currentAmmo <= 0 || this.isReloading) return;

        this.currentAmmo--;
        this.lastShot = Date.now();

        // Spawn Bullet via Manager
        this.game.ballisticsManager.spawnBullet(origin, direction, this.muzzleVelocity, this.damage, this.owner);

        // Play 3D gunshot sound
        this.game.soundManager.playGunshot(origin);

        // Recoil
        // Handled by implementation (Camera vs Animation recoil)
    }

    public async reload() {
        if (this.isReloading || this.currentAmmo === this.magazineSize || this.reserveAmmo <= 0) return;

        this.isReloading = true;
        this.reloadStartTime = Date.now();
        // console.log('Reloading...'); // Debug

        // Wait
        await new Promise(resolve => setTimeout(resolve, this.reloadTime));

        const needed = this.magazineSize - this.currentAmmo;
        const toAdd = Math.min(needed, this.reserveAmmo);

        this.reserveAmmo -= toAdd;
        this.currentAmmo += toAdd;
        this.isReloading = false;
        this.reloadStartTime = 0;
        // console.log('Reload Complete');
    }

    public getReloadProgress(): number {
        if (!this.isReloading) return 0;
        const elapsed = Date.now() - this.reloadStartTime;
        return Math.min(elapsed / this.reloadTime, 1);
    }

    public getAmmoInfo(): string {
        if (this.isReloading) return 'RELOADING...';
        return `${this.currentAmmo} / ${this.reserveAmmo}`;
    }
}
