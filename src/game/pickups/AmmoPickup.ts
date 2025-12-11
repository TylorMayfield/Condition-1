import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';

/**
 * AmmoPickup - Dropped by dead enemies
 * Player can walk over to collect ammo
 */
export class AmmoPickup extends GameObject {
    private ammoAmount: number = 30;
    private lifetime: number = 60; // 60 seconds before despawn
    private collected: boolean = false;
    private bobTime: number = 0;
    private initialY: number = 0;

    constructor(game: Game, position: THREE.Vector3, ammoAmount: number = 30) {
        super(game);
        this.ammoAmount = ammoAmount;

        // Create visual - ammo box
        const boxGeo = new THREE.BoxGeometry(0.3, 0.2, 0.4);
        const boxMat = new THREE.MeshStandardMaterial({
            color: 0x665544,
            metalness: 0.3,
            roughness: 0.7
        });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.castShadow = true;

        // Add ammo indicator stripe
        const stripeGeo = new THREE.BoxGeometry(0.31, 0.05, 0.41);
        const stripeMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            emissive: 0x553300,
            emissiveIntensity: 0.5
        });
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.y = 0.02;
        box.add(stripe);

        this.mesh = box;
        this.mesh.position.copy(position);
        this.mesh.position.y += 0.3; // Slight offset above ground
        this.initialY = this.mesh.position.y;

        this.game.scene.add(this.mesh);

        // Physics body for collision detection only (trigger)
        const shape = new CANNON.Box(new CANNON.Vec3(0.3, 0.2, 0.3));
        this.body = new CANNON.Body({
            mass: 0, // Static
            position: new CANNON.Vec3(position.x, position.y + 0.3, position.z),
            shape: shape,
            isTrigger: true,
            collisionFilterGroup: 4, // Pickup group
            collisionFilterMask: 1 // Only collide with player
        });

        this.game.world.addBody(this.body);
        this.game.addGameObject(this);

        // Register collision listener
        this.body.addEventListener('collide', (e: any) => {
            this.onCollide(e);
        });
    }

    private onCollide(event: any) {
        if (this.collected) return;

        // Check if it's the player
        const otherBody = event.body;
        if (otherBody === this.game.player?.body) {
            this.collect();
        }
    }

    private collect() {
        if (this.collected) return;
        this.collected = true;

        // Add ammo to player's current weapon
        const player = this.game.player;
        if (player) {
            const weapon = player.getCurrentWeapon();
            if (weapon) {
                weapon.reserveAmmo += this.ammoAmount;
                console.log(`Picked up ${this.ammoAmount} ammo. Reserve: ${weapon.reserveAmmo}`);
            }
        }

        // Play pickup sound (using impact as placeholder)
        if (this.mesh) {
            this.game.soundManager.playImpact(this.mesh.position);
        }

        // Cleanup
        this.dispose();
    }

    public update(dt: number) {
        if (this.collected) return;

        this.lifetime -= dt;
        if (this.lifetime <= 0) {
            this.dispose();
            return;
        }

        // Bob animation
        this.bobTime += dt * 2;
        if (this.mesh) {
            this.mesh.position.y = this.initialY + Math.sin(this.bobTime) * 0.05;
            this.mesh.rotation.y += dt * 0.5; // Slow spin
        }

        // Manual collision check (since trigger events might not fire)
        this.checkPlayerCollision();
    }

    private checkPlayerCollision() {
        const player = this.game.player;
        if (!player || !player.body || !this.mesh) return;

        const playerPos = new THREE.Vector3(
            player.body.position.x,
            player.body.position.y,
            player.body.position.z
        );
        const pickupPos = this.mesh.position;

        const dist = playerPos.distanceTo(pickupPos);
        if (dist < 1.0) { // 1 meter pickup range
            this.collect();
        }
    }

    public dispose() {
        if (this.mesh) {
            this.game.scene.remove(this.mesh);
            if (this.mesh instanceof THREE.Mesh) {
                this.mesh.geometry.dispose();
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(m => m.dispose());
                } else {
                    this.mesh.material.dispose();
                }
            }
        }

        if (this.body) {
            this.game.world.removeBody(this.body);
        }

        this.game.removeGameObject(this);
    }
}
