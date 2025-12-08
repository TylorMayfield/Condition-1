import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { PlayerController } from './PlayerController';
import { Weapon } from './Weapon';

export class WeaponSystem extends Weapon {
    // Note: Keeping class name 'WeaponSystem' for now to avoid breaking imports in main/Game, 
    // but logic is 'PlayerWeapon'. We can rename file/class properly if desired, but for this refactor I'll keep name.

    // Additional State
    private swayTime: number = 0;
    private basePosition: THREE.Vector3 = new THREE.Vector3(0.2, -0.2, -0.5);

    constructor(game: Game) {
        super(game, null); // Owner set later or ignored for Player singleton usage
        this.createWeaponModel();
        this.game.scene.add(this.mesh);

        // Stats overrides
        this.fireRate = 100;
        this.damage = 25;
        this.muzzleVelocity = 150;
    }

    private createWeaponModel() {
        // Simple "Gun"
        const barrelGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.set(0.2, -0.2, -0.5);
        this.mesh.add(barrel);
    }

    public update(dt: number, camera: THREE.Camera, controller: PlayerController) {
        // Handle Recoil Recovery
        this.currentRecoil.x = THREE.MathUtils.lerp(this.currentRecoil.x, 0, this.recoilRecovery * 60 * dt);
        this.currentRecoil.y = THREE.MathUtils.lerp(this.currentRecoil.y, 0, this.recoilRecovery * 60 * dt);

        // Calculate Sway
        this.swayTime += dt;
        let swayAmount = 0;
        let swaySpeed = 0;

        if (controller.isSprinting()) {
            swayAmount = 0.1;
            swaySpeed = 15;
        } else if (controller.isMoving()) {
            swayAmount = 0.02;
            swaySpeed = 10;
        } else {
            swayAmount = 0.002; // Breathing
            swaySpeed = 2;
        }

        const swayX = Math.sin(this.swayTime * swaySpeed) * swayAmount;
        const swayY = Math.abs(Math.cos(this.swayTime * swaySpeed * 2)) * swayAmount; // Unilateral bob

        // Reload Offset
        const reloadRotation = this.isReloading ? -Math.PI / 4 : 0; // Tilt down 45 deg

        // Sync weapon to camera with offsets
        this.mesh.position.copy(camera.position);
        this.mesh.quaternion.copy(camera.quaternion);

        // Apply Sway (Local offset)
        const offset = this.basePosition.clone();
        offset.x += swayX;
        offset.y += swayY;
        offset.z += this.currentRecoil.y * 0.1; // Kickback

        // Apply to local
        this.mesh.translateX(offset.x);
        this.mesh.translateY(offset.y);
        this.mesh.translateZ(offset.z);

        // Apply Reload Rotation & Recoil Rotation
        this.mesh.rotateX(reloadRotation + this.currentRecoil.x);

        if (this.isReloading) return;

        // Reload Input
        if (this.game.input.getKey('KeyR')) {
            this.reload();
            return;
        }

        // Shoot Input
        if (this.game.input.getMouseButton(0)) {
            const now = Date.now();
            if (now - this.lastShot > this.fireRate) {
                if (this.currentAmmo > 0) {
                    this.fire(camera, controller); // Rename internal
                } else {
                    this.reload();
                }
            }
        }
    }

    private fire(camera: THREE.Camera, controller: PlayerController) {
        // Recoil
        const recoilX = this.recoilAmount * (1 + Math.random());
        const recoilY = (Math.random() - 0.5) * 0.02;
        this.currentRecoil.x += recoilX;
        controller.applyRecoil(recoilX, recoilY); // Camera recoil

        // Muzzle Position (Approximation)
        // We want to shoot from Camera center basically, but visually from gun?
        // Tactical shooters usually raycast from camera center. 
        // For Ballistics, we should spawn bullet at Muzzle, but travel towards Camera Center Target.

        // 1. Get Target Point (Raycast from Camera center)
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const targetRay = raycaster.ray;
        let targetPoint = targetRay.at(100, new THREE.Vector3()); // Aim point

        // 2. Spawn from Gun Muzzle
        const muzzlePos = this.mesh.position.clone().add(new THREE.Vector3(0.2, -0.2, -0.8).applyQuaternion(this.mesh.quaternion));

        // 3. Direction from Muzzle to Target
        const direction = targetPoint.sub(muzzlePos).normalize();

        // 4. Spread
        const spread = controller.isMoving() ? (controller.isSprinting() ? 0.1 : 0.01) : 0.001;
        direction.x += (Math.random() - 0.5) * spread;
        direction.y += (Math.random() - 0.5) * spread;
        direction.z += (Math.random() - 0.5) * spread;
        direction.normalize();

        // Fire Base Method
        this.shoot(muzzlePos, direction);
    }
}
