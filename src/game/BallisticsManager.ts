import * as THREE from 'three';
import { Game } from '../engine/Game';


interface Projectile {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    position: THREE.Vector3;
    lifeTime: number;
    damage: number;
    owner: any; // visual ref to ignore self
}

export class BallisticsManager {
    private game: Game;
    private projectiles: Projectile[] = [];
    private gravity: number = 9.81;

    constructor(game: Game) {
        this.game = game;
    }

    public spawnBullet(origin: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, owner: any) {
        // Create visual
        const geo = new THREE.BoxGeometry(0.05, 0.05, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const mesh = new THREE.Mesh(geo, mat);

        mesh.position.copy(origin);
        mesh.lookAt(origin.clone().add(direction));

        this.game.scene.add(mesh);

        const velocity = direction.clone().multiplyScalar(speed);

        this.projectiles.push({
            mesh,
            velocity,
            position: origin.clone(),
            lifeTime: 5.0, // 5 seconds max life
            damage,
            owner
        });
    }

    public update(dt: number) {
        const wind = this.game.weatherManager?.wind || new THREE.Vector3(0, 0, 0);

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];

            p.lifeTime -= dt;
            if (p.lifeTime <= 0) {
                this.removeProjectile(i);
                continue;
            }

            // Physics Step
            // Gravity
            p.velocity.y -= this.gravity * dt * 0.5; // Slight drop

            // Wind
            p.velocity.add(wind.clone().multiplyScalar(dt * 0.5)); // Wind influence

            const startPos = p.position.clone();
            const step = p.velocity.clone().multiplyScalar(dt);
            const endPos = startPos.clone().add(step);

            // Raycast for Hit Detection (Continuous)
            const raycaster = new THREE.Raycaster(startPos, step.clone().normalize(), 0, step.length());
            const intersects = raycaster.intersectObjects(this.game.scene.children, true);

            let hitSomething = false;

            if (intersects.length > 0) {
                // Find first valid hit
                const hit = intersects.find(intersect => {
                    let obj = intersect.object;
                    // Ignore Owner
                    while (obj) {
                        if (obj === p.owner) return false;
                        if (p.owner && p.owner.children && Array.isArray(p.owner.children) && p.owner.children.includes(obj)) return false; // Check children if group
                        obj = obj.parent as THREE.Object3D;
                    }
                    return true;
                });

                if (hit) {
                    hitSomething = true;
                    this.handleHit(hit, p);
                    this.removeProjectile(i);
                }
            }

            if (!hitSomething) {
                p.position.copy(endPos);
                p.mesh.position.copy(endPos);
                p.mesh.lookAt(endPos.clone().add(p.velocity));
            }
        }
    }

    private handleHit(hit: THREE.Intersection, p: Projectile) {
        // Visual Decal
        this.spawnDecal(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));

        // Damage Logic
        let obj = hit.object;

        // Traverse to find Game Object
        while (obj) {
            // Check for any GameObject with 'takeDamage'
            // We use 'any' cast to check for method presence dynamically to avoid circular dep issues with 'instanceof Enemy'
            const foundGO = this.game.getGameObjects().find(go => {
                if (!go.mesh) return false;
                if (go.mesh === obj) return true;
                if (go.mesh instanceof THREE.Group && go.mesh.children?.includes(obj as any)) return true;
                return false;
            });

            if (foundGO) {
                // Check if it's an enemy/damageable
                if ('takeDamage' in foundGO && typeof (foundGO as any).takeDamage === 'function') {
                    // Pass owner for damage attribution and hit object for hitbox multiplier
                    (foundGO as any).takeDamage(p.damage, p.velocity.clone().normalize(), 5, p.owner, hit.object);
                    break; // Hit dealt
                }
            }

            obj = obj.parent as THREE.Object3D;
        }
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

    private removeProjectile(index: number) {
        const p = this.projectiles[index];
        this.game.scene.remove(p.mesh);
        (p.mesh.geometry as THREE.BufferGeometry).dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(index, 1);
    }
}
