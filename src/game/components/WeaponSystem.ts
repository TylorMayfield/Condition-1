import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { PlayerController } from './PlayerController';
import { Enemy } from '../Enemy';

export class WeaponSystem {
    private game: Game;
    private weaponMesh: THREE.Group;

    // Stats
    private magazineSize: number = 30;
    private currentAmmo: number = 30;
    private reserveAmmo: number = 90;
    private fireRate: number = 100; // ms
    private reloadTime: number = 2000; // ms
    private recoilAmount: number = 0.05;

    // State
    private lastShot: number = 0;
    private isReloading: boolean = false;
    private swayTime: number = 0;
    private basePosition: THREE.Vector3 = new THREE.Vector3(0.2, -0.2, -0.5);
    private currentRecoil: { x: number, y: number } = { x: 0, y: 0 };
    private recoilRecovery: number = 0.1;

    constructor(game: Game) {
        this.game = game;
        this.weaponMesh = new THREE.Group();
        this.createWeaponModel();
        this.game.scene.add(this.weaponMesh);
    }

    private createWeaponModel() {
        // Simple "Gun"
        const barrelGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.set(0.2, -0.2, -0.5);
        this.weaponMesh.add(barrel);
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
        this.weaponMesh.position.copy(camera.position);
        this.weaponMesh.quaternion.copy(camera.quaternion);

        // Apply Sway (Local offset)
        const offset = this.basePosition.clone();
        offset.x += swayX;
        offset.y += swayY;
        offset.z += this.currentRecoil.y * 0.1; // Kickback

        // Apply to local
        this.weaponMesh.translateX(offset.x);
        this.weaponMesh.translateY(offset.y);
        this.weaponMesh.translateZ(offset.z);

        // Apply Reload Rotation & Recoil Rotation
        this.weaponMesh.rotateX(reloadRotation + this.currentRecoil.x);

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
                    this.shoot(camera, controller);
                    this.lastShot = now;
                } else {
                    // Auto reload or click sound?
                    this.reload();
                }
            }
        }
    }

    private async reload() {
        if (this.isReloading || this.currentAmmo === this.magazineSize || this.reserveAmmo <= 0) return;

        this.isReloading = true;
        console.log('Reloading...');

        // Simple animation or state delay
        await new Promise(resolve => setTimeout(resolve, this.reloadTime));

        const needed = this.magazineSize - this.currentAmmo;
        const toAdd = Math.min(needed, this.reserveAmmo);

        this.reserveAmmo -= toAdd;
        this.currentAmmo += toAdd;
        this.isReloading = false;
        console.log('Reload Complete');
    }

    private shoot(camera: THREE.Camera, controller: PlayerController) {
        this.currentAmmo--;

        // Recoil
        // Recoil
        const recoilX = this.recoilAmount * (1 + Math.random());
        const recoilY = (Math.random() - 0.5) * 0.02;
        this.currentRecoil.x += recoilX;
        controller.applyRecoil(recoilX, recoilY); // Camera recoil

        // Sound
        this.game.soundManager.emitSound(camera.position.clone(), 50);

        // Raycast
        const raycaster = new THREE.Raycaster();
        // Add random spread?
        const spread = controller.isMoving() ? (controller.isSprinting() ? 0.1 : 0.01) : 0.001;
        const spreadOffset = new THREE.Vector2((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
        raycaster.setFromCamera(spreadOffset, camera);

        // Visual Tracer
        // We need a direction.
        const ray = raycaster.ray;
        let targetPoint = ray.at(100, new THREE.Vector3()); // Default far point

        // Apply Wind to "Fake" Ballistics (Raycast offset)
        const wind = this.game.weatherManager?.wind || new THREE.Vector3(0, 0, 0);
        const distance = 100; // Simplified
        // Factor: Strength of wind effect. 
        const windOffset = wind.clone().multiplyScalar(distance * 0.05);
        targetPoint.add(windOffset);

        // Debug: Actual Raycast for hit detection should technically curve, but for POC we just offset the target check?
        // No, Raycast is straight line. We can't curve a single raycast.
        // Option 1: Raycast to the "windy" target from camera? No, that shifts origin angle.
        // Option 2: Raycast straight, but visuals look curvy? 
        // Option 3: Raycast straight to offset point. This simulates "aiming" shift or bullet drift.
        // Let's actually adjust the Raycaster direction to point towards the wind-drifted point.
        raycaster.set(camera.position, targetPoint.clone().sub(camera.position).normalize());

        const intersects = raycaster.intersectObjects(this.game.scene.children, true); // Recursive

        if (intersects.length > 0) {
            const hit = intersects.find(i => {
                let p = i.object;
                while (p) {
                    // Ignore self and players if multiplayer (future)
                    if (p === this.weaponMesh) return false;
                    p = p.parent as THREE.Object3D;
                }
                return true;
            });

            if (hit) {
                targetPoint = hit.point; // Update target for tracer
                this.spawnDecal(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));

                // Check for Enemy
                let obj = hit.object;
                let enemy: Enemy | null = null;

                // Traverse up to find if it belongs to an enemy
                while (obj) {
                    enemy = this.game.getGameObjects().find(go => go instanceof Enemy && (go.mesh === obj || (go.mesh as THREE.Group).children.includes(obj as any))) as Enemy;
                    if (enemy) break;

                    obj = obj.parent as THREE.Object3D;
                }

                if (enemy) {
                    const direction = hit.point.clone().sub(camera.position).normalize();
                    enemy.takeDamage(20, direction, 20);
                }
            }
        }

        // Spawn Tracer
        this.spawnTracer(this.weaponMesh.position.clone().add(new THREE.Vector3(0.1, -0.1, -0.5).applyQuaternion(this.weaponMesh.quaternion)), targetPoint);
    }

    private spawnTracer(start: THREE.Vector3, end: THREE.Vector3) {
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        this.game.scene.add(line);

        // Fade out
        setTimeout(() => {
            this.game.scene.remove(line);
            geometry.dispose();
            material.dispose();
        }, 100);
    }

    private spawnDecal(point: THREE.Vector3, normal: THREE.Vector3) {
        const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(point);
        mesh.lookAt(point.clone().add(normal));
        this.game.scene.add(mesh);

        setTimeout(() => {
            this.game.scene.remove(mesh);
            geo.dispose();
            mat.dispose();
        }, 2000);
    }

    public getAmmoInfo(): string {
        if (this.isReloading) return 'RELOADING...';
        return `${this.currentAmmo} / ${this.reserveAmmo}`;
    }
}
