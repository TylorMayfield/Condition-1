import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { PlayerController } from './PlayerController';
import { Weapon } from './Weapon';

/**
 * Sniper Rifle - High damage, slow fire rate, scope zoom
 */
export class SniperRifle extends Weapon {
    // Weapon-specific state
    private swayTime: number = 0;
    private basePosition: THREE.Vector3 = new THREE.Vector3(0.2, -0.2, -0.5);
    private adsPosition: THREE.Vector3 = new THREE.Vector3(0, -0.1, -0.35);
    private isAiming: boolean = false;
    private adsAmount: number = 0;
    private adsFOV: number = 25; // Zoomed scope FOV
    private normalFOV: number = 75;

    constructor(game: Game) {
        super(game, null);
        this.createWeaponModel();
        this.game.sceneHUD.add(this.mesh);

        // Sniper Stats
        this.magazineSize = 5;
        this.currentAmmo = 5;
        this.reserveAmmo = 20;
        this.fireRate = 1500; // 1.5 seconds between shots
        this.reloadTime = 3000; // 3 second reload
        this.damage = 80;
        this.muzzleVelocity = 400; // Very fast bullet
        this.recoilAmount = 0.15;
    }

    private createWeaponModel() {
        const gunmetalDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.3 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x4a3728, metalness: 0.1, roughness: 0.7 });
        const blackMetal = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.4 });

        // Long Barrel
        const barrelGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.9, 8);
        const barrel = new THREE.Mesh(barrelGeo, gunmetalDark);
        barrel.position.set(0.15, -0.15, -0.85);
        barrel.rotation.x = Math.PI / 2;
        barrel.castShadow = true;
        this.mesh.add(barrel);

        // Receiver/Action
        const receiverGeo = new THREE.BoxGeometry(0.12, 0.12, 0.35);
        const receiver = new THREE.Mesh(receiverGeo, gunmetalDark);
        receiver.position.set(0.15, -0.18, -0.35);
        receiver.castShadow = true;
        this.mesh.add(receiver);

        // Stock
        const stockGeo = new THREE.BoxGeometry(0.1, 0.15, 0.35);
        const stock = new THREE.Mesh(stockGeo, wood);
        stock.position.set(0.15, -0.2, 0);
        stock.castShadow = true;
        this.mesh.add(stock);

        // Scope
        const scopeBodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12);
        const scopeBody = new THREE.Mesh(scopeBodyGeo, blackMetal);
        scopeBody.position.set(0.15, -0.05, -0.35);
        scopeBody.rotation.x = Math.PI / 2;
        this.mesh.add(scopeBody);

        // Scope lens (front)
        const lensGeo = new THREE.CircleGeometry(0.025, 16);
        const lensMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.set(0.15, -0.05, -0.45);
        this.mesh.add(lens);

        // Bolt Handle
        const boltGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.08, 6);
        const bolt = new THREE.Mesh(boltGeo, gunmetalDark);
        bolt.position.set(0.22, -0.15, -0.3);
        bolt.rotation.z = Math.PI / 2;
        this.mesh.add(bolt);

        // Magazine
        const magGeo = new THREE.BoxGeometry(0.06, 0.15, 0.08);
        const mag = new THREE.Mesh(magGeo, gunmetalDark);
        mag.position.set(0.15, -0.3, -0.35);
        mag.castShadow = true;
        this.mesh.add(mag);

        // Bipod (folded)
        const bipodGeo = new THREE.BoxGeometry(0.02, 0.08, 0.02);
        const bipod1 = new THREE.Mesh(bipodGeo, blackMetal);
        bipod1.position.set(0.1, -0.22, -0.7);
        bipod1.rotation.x = 0.3;
        this.mesh.add(bipod1);
        
        const bipod2 = new THREE.Mesh(bipodGeo, blackMetal);
        bipod2.position.set(0.2, -0.22, -0.7);
        bipod2.rotation.x = 0.3;
        this.mesh.add(bipod2);
    }

    public update(dt: number, camera: THREE.Camera, controller: PlayerController) {
        const hudCamera = this.game.cameraHUD;
        hudCamera.quaternion.copy(camera.quaternion);

        // Handle ADS
        this.isAiming = this.game.input.getMouseButton(2);

        // Smooth ADS transition
        const adsSpeed = 8;
        const targetAds = this.isAiming ? 1 : 0;
        this.adsAmount += (targetAds - this.adsAmount) * adsSpeed * dt;
        this.adsAmount = Math.max(0, Math.min(1, this.adsAmount));

        // Scope zoom FOV
        if (camera instanceof THREE.PerspectiveCamera) {
            const targetFOV = this.normalFOV - (this.normalFOV - this.adsFOV) * this.adsAmount;
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, adsSpeed * dt);
            camera.updateProjectionMatrix();
        }

        // Recoil recovery
        this.currentRecoil.x = THREE.MathUtils.lerp(this.currentRecoil.x, 0, this.recoilRecovery * 30 * dt);
        this.currentRecoil.y = THREE.MathUtils.lerp(this.currentRecoil.y, 0, this.recoilRecovery * 30 * dt);

        // Sway (reduced when scoped)
        this.swayTime += dt;
        let swayAmount = controller.isMoving() ? 0.015 : 0.005;
        swayAmount *= (1 - this.adsAmount * 0.95); // Almost no sway when scoped

        const swayX = Math.sin(this.swayTime * 2) * swayAmount;
        const swayY = Math.sin(this.swayTime * 1.5) * swayAmount * 0.5;

        // Position weapon
        this.mesh.position.set(0, 0, 0);
        this.mesh.quaternion.copy(hudCamera.quaternion);

        const currentBasePos = this.basePosition.clone().lerp(this.adsPosition, this.adsAmount);
        const offset = currentBasePos.clone();
        offset.x += swayX;
        offset.y += swayY;

        this.mesh.translateX(offset.x);
        this.mesh.translateY(offset.y);
        this.mesh.translateZ(offset.z);

        this.mesh.rotateX(this.currentRecoil.x);

        if (this.isReloading) return;

        // Reload
        if (this.game.input.getKey('KeyR')) {
            this.reload();
            return;
        }

        // Fire
        if (this.game.input.getMouseButton(0)) {
            const now = Date.now();
            if (now - this.lastShot > this.fireRate) {
                if (this.currentAmmo > 0) {
                    this.fire(camera, controller);
                } else {
                    this.reload();
                }
            }
        }
    }

    private fire(camera: THREE.Camera, controller: PlayerController) {
        const recoilX = this.recoilAmount * (1 + Math.random() * 0.3);
        this.currentRecoil.x += recoilX;
        controller.applyRecoil(recoilX, 0);

        // Muzzle flash
        this.createMuzzleFlash();

        // Raycast target
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const targetPoint = raycaster.ray.at(200, new THREE.Vector3());

        const muzzlePos = this.mesh.position.clone().add(
            new THREE.Vector3(0.15, -0.15, -1.3).applyQuaternion(this.mesh.quaternion)
        );

        const direction = targetPoint.sub(muzzlePos).normalize();

        // Very high accuracy when scoped
        let spread = this.isAiming ? 0.0005 : 0.02;
        if (controller.isMoving()) spread *= 3;

        direction.x += (Math.random() - 0.5) * spread;
        direction.y += (Math.random() - 0.5) * spread;
        direction.z += (Math.random() - 0.5) * spread;
        direction.normalize();

        this.shoot(muzzlePos, direction);
    }

    private createMuzzleFlash() {
        const flashLight = new THREE.PointLight(0xffaa00, 5, 15);
        flashLight.position.set(0.15, -0.15, -1.4);
        this.mesh.add(flashLight);

        const spriteMaterial = new THREE.SpriteMaterial({
            color: 0xffdd00,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        const flashSprite = new THREE.Sprite(spriteMaterial);
        flashSprite.scale.set(0.4, 0.4, 0.4);
        flashSprite.position.set(0.15, -0.15, -1.4);
        this.mesh.add(flashSprite);

        flashSprite.material.rotation = Math.random() * Math.PI * 2;

        setTimeout(() => {
            this.mesh.remove(flashLight);
            this.mesh.remove(flashSprite);
            flashLight.dispose();
            spriteMaterial.dispose();
        }, 60);
    }
}
