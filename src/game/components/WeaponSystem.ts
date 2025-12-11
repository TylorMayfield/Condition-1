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
    private adsPosition: THREE.Vector3 = new THREE.Vector3(0, -0.1, -0.3); // Centered, closer
    private isAiming: boolean = false;
    private adsAmount: number = 0; // 0 = hip, 1 = ADS
    private adsFOV: number = 50; // Zoomed FOV
    private normalFOV: number = 75; // Normal FOV

    constructor(game: Game, owner: any) {
        super(game, owner);
        this.createWeaponModel();
        // Add to HUD scene instead
        this.game.sceneHUD.add(this.mesh);

        // Stats overrides
        this.fireRate = 100;
        this.damage = 25;
        this.muzzleVelocity = 150;
    }


    private createWeaponModel() {
        // Realistic Rifle Model (Assault Rifle Style)
        const gunmetalDark = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 });
        const gunmetalLight = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.5 });
        const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.8 });

        // Receiver/Body (Main body)
        const receiverGeo = new THREE.BoxGeometry(0.15, 0.15, 0.4);
        const receiver = new THREE.Mesh(receiverGeo, gunmetalDark);
        receiver.position.set(0.15, -0.2, -0.4);
        receiver.castShadow = true;
        this.mesh.add(receiver);

        // Barrel (Long cylindrical barrel)
        const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8);
        const barrel = new THREE.Mesh(barrelGeo, gunmetalLight);
        barrel.position.set(0.15, -0.15, -0.75);
        barrel.rotation.x = Math.PI / 2;
        barrel.castShadow = true;
        this.mesh.add(barrel);

        // Stock (Rear shoulder rest)
        const stockGeo = new THREE.BoxGeometry(0.12, 0.08, 0.25);
        const stock = new THREE.Mesh(stockGeo, blackPlastic);
        stock.position.set(0.15, -0.18, -0.05);
        stock.castShadow = true;
        this.mesh.add(stock);

        // Magazine (Protruding down)
        const magGeo = new THREE.BoxGeometry(0.08, 0.25, 0.12);
        const mag = new THREE.Mesh(magGeo, gunmetalDark);
        mag.position.set(0.15, -0.35, -0.45);
        mag.castShadow = true;
        this.mesh.add(mag);

        // Grip/Handle
        const gripGeo = new THREE.BoxGeometry(0.06, 0.12, 0.08);
        const grip = new THREE.Mesh(gripGeo, blackPlastic);
        grip.position.set(0.15, -0.28, -0.35);
        grip.rotation.x = -0.3; // Slight angle
        grip.castShadow = true;
        this.mesh.add(grip);

        // Front Sight
        const frontSightGeo = new THREE.BoxGeometry(0.03, 0.04, 0.02);
        const frontSight = new THREE.Mesh(frontSightGeo, gunmetalDark);
        frontSight.position.set(0.15, -0.1, -0.85);
        this.mesh.add(frontSight);

        // Rear Sight
        const rearSightGeo = new THREE.BoxGeometry(0.04, 0.05, 0.02);
        const rearSight = new THREE.Mesh(rearSightGeo, gunmetalDark);
        rearSight.position.set(0.15, -0.1, -0.25);
        this.mesh.add(rearSight);
    }

    public update(dt: number, camera: THREE.Camera, controller: PlayerController) {
        // Update HUD Camera to match World Camera Rotation (look direction)
        const hudCamera = this.game.cameraHUD;
        hudCamera.quaternion.copy(camera.quaternion);

        // Handle ADS Input
        this.isAiming = this.game.input.getMouseButton(2);

        // Smooth ADS transition
        const adsSpeed = 10;
        const targetAds = this.isAiming ? 1 : 0;
        this.adsAmount += (targetAds - this.adsAmount) * adsSpeed * dt;
        this.adsAmount = Math.max(0, Math.min(1, this.adsAmount));

        // Interpolate FOV (Main Camera Only)
        if (camera instanceof THREE.PerspectiveCamera) {
            const targetFOV = this.normalFOV - (this.normalFOV - this.adsFOV) * this.adsAmount;
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, adsSpeed * dt);
            camera.updateProjectionMatrix();
        }

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
            swayAmount = 0.002;
            swaySpeed = 2;
        }

        swayAmount *= (1 - this.adsAmount * 0.8);

        const swayX = Math.sin(this.swayTime * swaySpeed) * swayAmount;
        const swayY = Math.abs(Math.cos(this.swayTime * swaySpeed * 2)) * swayAmount;

        // Reload Animation
        let reloadRotation = 0;
        let reloadPositionOffset = new THREE.Vector3(0, 0, 0);

        if (this.isReloading) {
            const progress = this.getReloadProgress();
            const easeInOut = (t: number): number => { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
            // const easedProgress = easeInOut(progress);

            if (progress < 0.4) {
                const stageProgress = progress / 0.4;
                const easedStage = easeInOut(stageProgress);
                reloadRotation = -Math.PI / 3 * easedStage;
                reloadPositionOffset.z = 0.15 * easedStage;
                reloadPositionOffset.y = -0.1 * easedStage;
            } else if (progress < 0.6) {
                reloadRotation = -Math.PI / 3;
                reloadPositionOffset.z = 0.15;
                reloadPositionOffset.y = -0.1;
            } else {
                const stageProgress = (progress - 0.6) / 0.4;
                const easedStage = easeInOut(stageProgress);
                reloadRotation = -Math.PI / 3 * (1 - easedStage);
                reloadPositionOffset.z = 0.15 * (1 - easedStage);
                reloadPositionOffset.y = -0.1 * (1 - easedStage);
            }
        }

        // Position Weapon relative to HUD Camera (at 0,0,0)
        this.mesh.position.set(0, 0, 0);
        this.mesh.quaternion.copy(hudCamera.quaternion);

        // Interpolate between hip and ADS position
        const currentBasePos = this.basePosition.clone().lerp(this.adsPosition, this.adsAmount);

        // Apply Sway (Local offset)
        const offset = currentBasePos.clone();
        offset.x += swayX;
        offset.y += swayY;
        offset.z += this.currentRecoil.y * 0.1;

        // Apply Reload Position Offset
        offset.add(reloadPositionOffset);

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

        // === MUZZLE FLASH EFFECT ===
        this.createMuzzleFlash();

        // Muzzle Position (Approximation)
        // We want to shoot from Camera center basically, but visually from gun?
        // Tactical shooters usually raycast from camera center. 
        // For Ballistics, we should spawn bullet at Muzzle, but travel towards Camera Center Target.

        // 1. Get Target Point (Raycast from Camera center)
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const targetRay = raycaster.ray;
        let targetPoint = targetRay.at(100, new THREE.Vector3()); // Aim point

        // 2. Spawn from Gun Muzzle (World Space)
        // Since the weapon mesh is in HUD space (0,0,0), we must calculate the world position 
        // relative to the camera.
        const offset = new THREE.Vector3(0.2, -0.2, -0.5); // Right, Down, Forward relative to camera
        offset.applyQuaternion(camera.quaternion);
        const muzzlePos = camera.position.clone().add(offset);

        // 3. Direction from Muzzle to Target
        const direction = targetPoint.sub(muzzlePos).normalize();

        // 4. Spread (reduced when ADS)
        let spread = controller.isMoving() ? (controller.isSprinting() ? 0.1 : 0.01) : 0.001;
        spread *= (1 - this.adsAmount * 0.9); // 90% reduction when fully aimed

        direction.x += (Math.random() - 0.5) * spread;
        direction.y += (Math.random() - 0.5) * spread;
        direction.z += (Math.random() - 0.5) * spread;
        direction.normalize();

        // Fire Base Method
        this.shoot(muzzlePos, direction);
    }

    // State for Muzzle Flash
    private currentMuzzleFlash: THREE.Object3D[] = [];
    private muzzleFlashTimeout: any = null;

    private createMuzzleFlash() {
        // remove existing flash if present to avoid stacking
        if (this.currentMuzzleFlash.length > 0) {
            this.currentMuzzleFlash.forEach(obj => {
                this.mesh.remove(obj);
                // Traverse to dispose materials/geometries if needed, though they are shared usually or simple
            });
            this.currentMuzzleFlash = [];
        }
        if (this.muzzleFlashTimeout) {
            clearTimeout(this.muzzleFlashTimeout);
            this.muzzleFlashTimeout = null;
        }

        // Create flash light
        const flashLight = new THREE.PointLight(0xffaa00, 3, 10);
        flashLight.position.set(0.15, -0.15, -1.0); // At barrel tip
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
        flashSprite.scale.set(0.3, 0.3, 0.3);
        flashSprite.position.set(0.15, -0.15, -1.0);
        this.mesh.add(flashSprite);
        this.currentMuzzleFlash.push(flashSprite);

        // Add slight random rotation to sprite for variety
        flashSprite.material.rotation = Math.random() * Math.PI * 2;

        // Remove after 20ms (1 frame at 60fps is ~16ms, so close to 1 frame)
        this.muzzleFlashTimeout = setTimeout(() => {
            if (this.currentMuzzleFlash.length > 0) {
                this.mesh.remove(flashLight);
                this.mesh.remove(flashSprite);
                flashLight.dispose();
                spriteMaterial.dispose();
                this.currentMuzzleFlash = [];
            }
            this.muzzleFlashTimeout = null;
        }, 20);
    }
}
