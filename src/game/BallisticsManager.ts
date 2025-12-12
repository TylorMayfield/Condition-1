import * as THREE from 'three';
import { Game } from '../engine/Game';


interface Projectile {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    position: THREE.Vector3;
    lifeTime: number;
    damage: number;
    owner: any; // visual ref to ignore self
    active: boolean; // For pooling
}

export class BallisticsManager {
    private game: Game;
    private projectiles: Projectile[] = [];
    private projectilePool: Projectile[] = []; // Inactive projectiles
    private gravity: number = 9.81;
    private raycaster: THREE.Raycaster;
    private windVector: THREE.Vector3 = new THREE.Vector3();

    // Shared geometry and material for pooling
    private bulletGeometry: THREE.BoxGeometry;
    private bulletMaterial: THREE.MeshBasicMaterial;

    constructor(game: Game) {
        this.game = game;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 1000; // Sensible max distance
        
        // Init shared resources
        this.bulletGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.2);
        this.bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    }

    public spawnBullet(origin: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, owner: any) {
        let p: Projectile;

        // Try to reuse from pool
        const inactiveIdx = this.projectilePool.findIndex(px => !px.active);
        
        if (inactiveIdx >= 0) {
            p = this.projectilePool[inactiveIdx];
            // Remove from pool list to active list implies logic change, 
            // but here let's just keep single list/separate lists?
            // Actually simpler: pop from pool, add to active.
            this.projectilePool.splice(inactiveIdx, 1);
            p.active = true;
            p.mesh.visible = true;
            this.game.scene.add(p.mesh);
        } else {
            // Create new
            const mesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterial);
            p = {
                mesh,
                velocity: new THREE.Vector3(),
                position: new THREE.Vector3(),
                lifeTime: 0,
                damage: 0,
                owner: null,
                active: true
            };
            this.game.scene.add(mesh);
        }

        // Initialize state
        p.position.copy(origin);
        p.mesh.position.copy(origin);
        p.mesh.lookAt(origin.clone().add(direction));
        
        p.velocity.copy(direction).multiplyScalar(speed);
        p.lifeTime = 5.0;
        p.damage = damage;
        p.owner = owner;

        this.projectiles.push(p);
    }

    public update(dt: number) {
        if (this.game.weatherManager) {
            this.windVector.copy(this.game.weatherManager.wind);
        } else {
            this.windVector.set(0, 0, 0);
        }

        const windInfluence = this.windVector.multiplyScalar(dt * 0.5);

        // Iterate backwards for safe removal
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];

            p.lifeTime -= dt;
            if (p.lifeTime <= 0) {
                this.recycleProjectile(i);
                continue;
            }

            // Physics Step
            // Gravity
            p.velocity.y -= this.gravity * dt * 0.5; // Slight drop

            // Wind
            p.velocity.add(windInfluence);

            const startPos = p.position.clone(); // Optimization: Could reuse a temp vector if strictly single-threaded
            const moveStep = p.velocity.clone().multiplyScalar(dt); // Optimization: reuse temp
            const endPos = startPos.clone().add(moveStep); 

            // Raycast for Hit Detection (Continuous)
            // Reuse raycaster
            this.raycaster.set(startPos, moveStep.clone().normalize());
            this.raycaster.far = moveStep.length();
            
            // Fix: Raycasting against Sprites requires camera to be set
            this.raycaster.camera = this.game.camera;

            // Optimization: Intersect only what we need? 
            // scene.children includes everything. Ideally we check specific layers.
            // For now, checking scene.children is still O(N) but reusing raycaster saves GC.
            const intersects = this.raycaster.intersectObjects(this.game.scene.children, true);

            let hitSomething = false;

            if (intersects.length > 0) {
                // Find first valid hit
                for (const intersect of intersects) {
                     let obj: any = intersect.object;
                     let ValidHit = true;
                     
                     // Ignore Owner check (traverse up to check if child of owner)
                     // If owner is defined, check hierarchy
                     if (p.owner) {
                         let tempObj = obj;
                         while(tempObj) {
                             if (tempObj === p.owner) { 
                                 ValidHit = false; 
                                 break; 
                             }
                             // Also check if owner has this child (for groups)
                             if (p.owner.children && Array.isArray(p.owner.children) && p.owner.children.includes(tempObj)) {
                                 ValidHit = false;
                                 break;
                             }
                             tempObj = tempObj.parent;
                         }
                     }
                     
                     if (!ValidHit) continue; 
                     
                     // If valid hit found
                     hitSomething = true;
                     this.handleHit(intersect, p);
                     this.recycleProjectile(i);
                     break;
                }
            }

            if (!hitSomething) {
                p.position.copy(endPos);
                p.mesh.position.copy(endPos);
                // Look along trajectory
                const lookTarget = endPos.clone().add(p.velocity);
                p.mesh.lookAt(lookTarget);
            }
        }
    }

    private handleHit(hit: THREE.Intersection, p: Projectile) {
        // Visual Decal
        this.spawnDecal(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));

        // Damage Logic - Optimized Lookup
        let obj: any = hit.object;
        let foundGO: any = null;

        // Traverse up to find userData.gameObject
        while (obj) {
            if (obj.userData && obj.userData.gameObject) {
                foundGO = obj.userData.gameObject;
                break;
            }
            obj = obj.parent;
        }

        // Check Legacy Lookup (Slow) if optimization missing
        if (!foundGO) {
             obj = hit.object;
             const allGOs = this.game.getGameObjects();
             // Limited depth search to avoid infinite loops or massive cost
             let depth = 0;
             while (obj && depth < 5) {
                const found = allGOs.find(go => {
                    if (!go.mesh) return false;
                    if (go.mesh === obj) return true;
                    if (go.mesh instanceof THREE.Group && go.mesh.children?.includes(obj as any)) return true;
                    return false;
                });
                if (found) {
                    foundGO = found;
                    break;
                }
                obj = obj.parent;
                depth++;
             }
        }

        if (foundGO) {
            // Check if it's an enemy/damageable
            if ('takeDamage' in foundGO && typeof (foundGO as any).takeDamage === 'function') {
                (foundGO as any).takeDamage(p.damage, p.velocity.clone().normalize(), 5, p.owner, hit.object);
            }
        }
    }

    private spawnDecal(point: THREE.Vector3, normal: THREE.Vector3) {
        // Optimization: Pool decimals too? For now, just create/destroy but maybe less frequent
        const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(point);
        mesh.lookAt(point.clone().add(normal));
        this.game.scene.add(mesh);

        // Use a simpler timeout or pool for debris
        setTimeout(() => {
            this.game.scene.remove(mesh);
            geo.dispose();
            mat.dispose();
        }, 2000);
    }

    private recycleProjectile(index: number) {
        const p = this.projectiles[index];
        
        // Hide and remove from scene (or keep in scene but invisible? removing is safer for raycasts)
        this.game.scene.remove(p.mesh);
        p.active = false;
        
        // Remove from active list
        this.projectiles.splice(index, 1);
        
        // Add to pool
        this.projectilePool.push(p);
    }
}
