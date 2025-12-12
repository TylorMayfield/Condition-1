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
    
    // Reusable temp vectors to avoid allocations
    private tempVec1: THREE.Vector3 = new THREE.Vector3();
    private tempVec2: THREE.Vector3 = new THREE.Vector3();
    private tempVec3: THREE.Vector3 = new THREE.Vector3();
    private tempVec4: THREE.Vector3 = new THREE.Vector3();

    // Shared geometry and material for pooling
    private bulletGeometry: THREE.BoxGeometry;
    private bulletMaterial: THREE.MeshBasicMaterial;
    
    // Cached raycastable objects (world geometry, enemies, etc.) - excludes projectiles
    private raycastableObjects: THREE.Object3D[] = [];
    private lastCacheUpdate: number = 0;
    private cacheUpdateInterval: number = 0.1; // Update cache every 100ms

    constructor(game: Game) {
        this.game = game;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 1000; // Sensible max distance

        // Init shared resources
        this.bulletGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.2);
        this.bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        
        // Initialize raycastable cache (will be updated periodically)
        this.updateRaycastableCache();
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

        // Initialize state (reuse temp vector for lookAt)
        p.position.copy(origin);
        p.mesh.position.copy(origin);
        const lookTarget = this.tempVec1.copy(origin).add(direction);
        p.mesh.lookAt(lookTarget);

        p.velocity.copy(direction).multiplyScalar(speed);
        p.lifeTime = 5.0;
        p.damage = damage;
        p.owner = owner;

        this.projectiles.push(p);
    }

    public update(dt: number) {
        // Update wind vector (don't mutate, create new for calculation)
        if (this.game.weatherManager) {
            this.windVector.copy(this.game.weatherManager.wind);
        } else {
            this.windVector.set(0, 0, 0);
        }

        // Calculate wind influence (reuse temp vector)
        const windInfluence = this.tempVec1.copy(this.windVector).multiplyScalar(dt * 0.5);

        // Update raycastable objects cache periodically (avoids checking every frame)
        this.lastCacheUpdate += dt;
        if (this.lastCacheUpdate >= this.cacheUpdateInterval) {
            this.updateRaycastableCache();
            this.lastCacheUpdate = 0;
        }

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

            // Wind (add to velocity)
            p.velocity.add(windInfluence);

            // Reuse temp vectors instead of cloning
            const startPos = this.tempVec2.copy(p.position);
            const moveStep = this.tempVec3.copy(p.velocity).multiplyScalar(dt);
            const endPos = this.tempVec4.copy(startPos).add(moveStep);

            // Raycast for Hit Detection (Continuous)
            // Use cached raycastable objects instead of all scene children
            const moveDir = this.tempVec1.copy(moveStep).normalize();
            this.raycaster.set(startPos, moveDir);
            this.raycaster.far = moveStep.length();
            this.raycaster.camera = this.game.camera;

            // OPTIMIZATION: Only raycast against relevant objects (excludes projectiles, HUD, etc.)
            const intersects = this.raycaster.intersectObjects(this.raycastableObjects, true);

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
                        while (tempObj) {
                            // Check for direct object equality (if owner is Mesh)
                            if (tempObj === p.owner) {
                                ValidHit = false;
                                break;
                            }
                            // Check for GameObject reference (if owner is GameObject)
                            if (tempObj.userData && tempObj.userData.gameObject === p.owner) {
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
                // Look along trajectory (reuse temp vector)
                const lookTarget = this.tempVec1.copy(endPos).add(p.velocity);
                p.mesh.lookAt(lookTarget);
            }
        }
    }
    
    private updateRaycastableCache() {
        // Rebuild cache of objects that can be hit by projectiles
        // Excludes: projectiles themselves, HUD elements, skybox, etc.
        this.raycastableObjects.length = 0;
        
        const scene = this.game.scene;
        const projectiles = this.projectiles;
        
        // Helper to check if object is a projectile
        const isProjectile = (obj: THREE.Object3D): boolean => {
            for (const p of projectiles) {
                if (p.mesh === obj || (p.mesh && p.mesh.children.includes(obj))) {
                    return true;
                }
            }
            return false;
        };
        
        // Traverse scene and collect raycastable objects
        scene.traverse((obj) => {
            // Skip projectiles
            if (isProjectile(obj)) return;
            
            // Skip invisible objects
            if (!obj.visible) return;
            
            // Skip HUD scene objects (they're in sceneHUD, but check just in case)
            if (obj.parent === this.game.sceneHUD) return;
            
            // Only include meshes (not lights, cameras, etc.)
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
                this.raycastableObjects.push(obj);
            }
        });
    }

    private handleHit(hit: THREE.Intersection, p: Projectile) {
        // Visual Decal (reuse temp vector for normal)
        const normal = hit.face?.normal || this.tempVec1.set(0, 1, 0);
        this.spawnDecal(hit.point, normal);

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
            // Check if it's an enemy/damageable (reuse temp vector for normalized velocity)
            if ('takeDamage' in foundGO && typeof (foundGO as any).takeDamage === 'function') {
                const normalizedVel = this.tempVec1.copy(p.velocity).normalize();
                (foundGO as any).takeDamage(p.damage, normalizedVel, 5, p.owner, hit.object);
            }
        }
    }

    private spawnDecal(point: THREE.Vector3, normal: THREE.Vector3) {
        // Optimization: Pool decimals too? For now, just create/destroy but maybe less frequent
        const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(point);
        // Reuse temp vector for lookAt target
        const lookTarget = this.tempVec1.copy(point).add(normal);
        mesh.lookAt(lookTarget);
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
