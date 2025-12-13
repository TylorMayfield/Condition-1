import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';
import { Tower } from './Tower';

/**
 * Minion - Lane-pushing unit that follows a path and attacks enemies
 */
export class Minion extends GameObject {
    public health: number = 300;
    public maxHealth: number = 300;
    public attackDamage: number = 50;
    public attackRange: number = 2;
    public attackCooldown: number = 1.5;
    public moveSpeed: number = 3;
    public lane: string;
    public isMinion: boolean = true;

    private attackTimer: number = 0;
    private currentTarget: GameObject | null = null;
    private lanePath: THREE.Vector3[];
    private currentPathIndex: number = 0;
    private pathThreshold: number = 2; // Distance to waypoint before advancing

    constructor(game: Game, position: THREE.Vector3, team: string, lane: string, lanePath: THREE.Vector3[]) {
        super(game);
        this.team = team;
        this.lane = lane;
        this.lanePath = lanePath;
        this.currentPathIndex = 0;

        // Visual: Simple soldier model
        const bodyGeo = new THREE.BoxGeometry(0.6, 1.2, 0.4);
        const headGeo = new THREE.SphereGeometry(0.25, 8, 8);
        
        const mat = new THREE.MeshStandardMaterial({ 
            color: (team && team.toLowerCase() === 'blue') ? 0x0066ff : 0xff0000
        });

        const body = new THREE.Mesh(bodyGeo, mat);
        body.position.y = 0.6;
        body.castShadow = true;

        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = 1.4;
        head.castShadow = true;

        this.mesh = new THREE.Group();
        this.mesh.add(body);
        this.mesh.add(head);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Physics: Dynamic body
        const shape = new CANNON.Box(new CANNON.Vec3(0.3, 0.6, 0.2));
        this.body = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(position.x, position.y + 0.6, position.z),
            shape: shape,
            fixedRotation: true
        });

        // Link mesh to GameObject for damage detection
        if (this.mesh) {
            this.mesh.userData.gameObject = this;
        }
    }

    public update(dt: number): void {
        // Call parent update for physics sync
        super.update(dt);
        
        if (this.health <= 0) {
            // Notify game mode of death before cleanup
            if (this.game.gameMode && this.game.gameMode.onEntityDeath) {
                this.game.gameMode.onEntityDeath(this);
            }
            
            // Clean up mesh and body
            if (this.mesh) {
                this.game.scene.remove(this.mesh);
                // Dispose geometry and materials
                this.mesh.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => m.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    }
                });
            }
            if (this.body) {
                this.game.world.removeBody(this.body);
            }
            
            // Remove from game objects
            this.game.removeGameObject(this);
            return;
        }

        this.attackTimer += dt;

        // Find target (enemies in range)
        this.findTarget();

        // If we have a target, attack it
        if (this.currentTarget) {
            const distance = this.getDistanceToTarget();
            if (distance <= this.attackRange) {
                // Stop and attack
                if (this.body) {
                    this.body.velocity.set(0, this.body.velocity.y, 0);
                }
                if (this.attackTimer >= this.attackCooldown) {
                    this.attack();
                    this.attackTimer = 0;
                }
            } else {
                // Move toward target
                this.moveTowardTarget();
            }
        } else {
            // No target - follow lane path
            this.followLanePath(dt);
        }

        // Sync mesh with physics
        if (this.body && this.mesh) {
            this.mesh.position.copy(this.body.position as any);
            this.mesh.position.y -= 0.6; // Adjust for body center offset
        }
    }

    private findTarget(): void {
        // Find nearest enemy in attack range
        let nearestEnemy: GameObject | null = null;
        let nearestDistance = this.attackRange * 2; // Look slightly beyond attack range

        const gameObjects = this.game.getGameObjects();
        for (const obj of gameObjects) {
            // Skip if same team or self - this should catch friendly towers too
            if (obj.team === this.team || obj === this) continue;
            
            // Double-check: explicitly skip friendly towers (safety check)
            const isTower = obj instanceof Tower || (obj as any).constructor?.name === 'Tower';
            if (isTower) {
                // Towers should have teams set, but double-check
                if (obj.team === this.team || !obj.team) {
                    continue; // Never target friendly towers or towers without teams
                }
            }
            
            // Only target enemy entities (enemies, enemy towers, enemy minions, player if enemy)
            const isEnemy = obj instanceof Enemy;
            const isEnemyMinion = (obj as any).isMinion && obj.team && obj.team !== this.team;
            const isEnemyTower = isTower && obj.team && obj.team !== this.team;
            const isEnemyPlayer = obj === this.game.player && obj.team && obj.team !== this.team;
            
            // Must be a valid targetable enemy
            if (!isEnemy && !isEnemyMinion && !isEnemyTower && !isEnemyPlayer) {
                continue; // Skip non-targetable objects
            }

            const distance = this.getDistanceTo(obj);
            if (distance < nearestDistance) {
                nearestEnemy = obj;
                nearestDistance = distance;
            }
        }

        this.currentTarget = nearestEnemy;
    }

    private getDistanceTo(obj: GameObject): number {
        if (!this.body || !obj.mesh) return Infinity;
        const myPos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
        return myPos.distanceTo(obj.mesh.position);
    }

    private getDistanceToTarget(): number {
        if (!this.currentTarget) return Infinity;
        return this.getDistanceTo(this.currentTarget);
    }

    private moveTowardTarget(): void {
        if (!this.currentTarget || !this.currentTarget.mesh || !this.body) return;

        const targetPos = this.currentTarget.mesh.position.clone();
        const myPos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
        
        const direction = targetPos.sub(myPos);
        direction.y = 0; // Don't move vertically
        direction.normalize();

        // Apply velocity
        this.body.velocity.x = direction.x * this.moveSpeed;
        this.body.velocity.z = direction.z * this.moveSpeed;

        // Rotate toward target
        if (this.mesh) {
            const angle = Math.atan2(direction.x, direction.z);
            this.mesh.rotation.y = angle;
        }
    }

    private followLanePath(_dt: number): void {
        if (!this.body || this.currentPathIndex >= this.lanePath.length) return;

        const targetWaypoint = this.lanePath[this.currentPathIndex];
        const myPos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
        
        // Check for obstacles (friendly towers) blocking the path
        const direction = targetWaypoint.clone().sub(myPos);
        direction.y = 0;
        const distance = myPos.distanceTo(targetWaypoint);
        
        // Simple obstacle avoidance: if there's a friendly tower nearby, try to go around it
        const obstacle = this.checkForObstacle(myPos, direction);
        if (obstacle) {
            // Calculate a path around the obstacle
            const avoidDirection = this.calculateAvoidance(myPos, obstacle, targetWaypoint);
            if (avoidDirection) {
                this.body.velocity.x = avoidDirection.x * this.moveSpeed;
                this.body.velocity.z = avoidDirection.z * this.moveSpeed;
                if (this.mesh) {
                    const angle = Math.atan2(avoidDirection.x, avoidDirection.z);
                    this.mesh.rotation.y = angle;
                }
                return;
            }
        }

        if (distance < this.pathThreshold) {
            // Reached waypoint - move to next
            this.currentPathIndex++;
            if (this.currentPathIndex >= this.lanePath.length) {
                // Reached end of lane - despawn or continue to nexus
                this.health = 0; // Despawn for now
                return;
            }
        }

        // Move toward current waypoint
        direction.normalize();
        this.body.velocity.x = direction.x * this.moveSpeed;
        this.body.velocity.z = direction.z * this.moveSpeed;

        // Rotate toward waypoint
        if (this.mesh) {
            const angle = Math.atan2(direction.x, direction.z);
            this.mesh.rotation.y = angle;
        }
    }
    
    private checkForObstacle(myPos: THREE.Vector3, direction: THREE.Vector3): GameObject | null {
        // Check for friendly towers in the path
        // Check for friendly towers in the path
        // const checkDistance = 5; // Check 5 units ahead
        // const checkPos = myPos.clone().add(direction.normalize().multiplyScalar(checkDistance));
        
        const gameObjects = this.game.getGameObjects();
        for (const obj of gameObjects) {
            if (obj.team !== this.team) continue; // Only check friendly objects
            if (!(obj instanceof Tower)) continue;
            if (!obj.mesh) continue;
            
            const objPos = obj.mesh.position;
            const distToObj = myPos.distanceTo(objPos);
            
            // If tower is within 3 units and in front of us, it's blocking
            if (distToObj < 3) {
                const toObj = objPos.clone().sub(myPos);
                toObj.y = 0;
                const dot = direction.normalize().dot(toObj.normalize());
                if (dot > 0.5) { // Tower is in front of us
                    return obj;
                }
            }
        }
        
        return null;
    }
    
    private calculateAvoidance(myPos: THREE.Vector3, obstacle: GameObject, targetWaypoint: THREE.Vector3): THREE.Vector3 | null {
        if (!obstacle.mesh) return null;
        
        const obstaclePos = obstacle.mesh.position;
        const toTarget = targetWaypoint.clone().sub(myPos);
        toTarget.y = 0;
        
        // Calculate perpendicular direction to go around obstacle
        const toObstacle = obstaclePos.clone().sub(myPos);
        toObstacle.y = 0;
        
        // Get perpendicular vector (rotate 90 degrees)
        const perpendicular = new THREE.Vector3(-toObstacle.z, 0, toObstacle.x).normalize();
        
        // Choose direction that's closer to target
        const leftDir = perpendicular.clone();
        const rightDir = perpendicular.clone().multiplyScalar(-1);
        
        const leftDot = leftDir.dot(toTarget.normalize());
        const rightDot = rightDir.dot(toTarget.normalize());
        
        // Use the direction that points more toward target
        const avoidDir = leftDot > rightDot ? leftDir : rightDir;
        
        // Blend with target direction (70% avoid, 30% toward target)
        const blended = avoidDir.multiplyScalar(0.7).add(toTarget.normalize().multiplyScalar(0.3));
        
        return blended.normalize();
    }

    private attack(): void {
        if (!this.currentTarget) return;

        // Deal damage
        if (this.currentTarget instanceof Enemy) {
            this.currentTarget.takeDamage(this.attackDamage, new THREE.Vector3(0, 0, 0), 0, this, undefined);
        } else if (this.currentTarget) {
            // Safety check for other objects
             const target = this.currentTarget as any;
             if (target.takeDamage) {
                target.takeDamage(this.attackDamage, new THREE.Vector3(0, 0, 0), 0, this, undefined);
             }
        }

        // Visual feedback: Attack animation
        if (this.mesh) {
            const originalY = this.mesh.position.y;
            this.mesh.position.y += 0.1;
            setTimeout(() => {
                if (this.mesh) {
                    this.mesh.position.y = originalY;
                }
            }, 100);
        }
    }

    public takeDamage(amount: number, _direction: THREE.Vector3, _force: number, _attacker?: GameObject, _hitObject?: any): void {
        this.health -= amount;
        if (this.health < 0) this.health = 0;

        // Visual feedback: Flash red (not white/gray)
        if (this.mesh) {
            this.mesh.children.forEach((child) => {
                if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                    // Flash red to indicate damage, not white/gray
                    child.material.color.setHex(0xff0000);
                    setTimeout(() => {
                        if (child.material instanceof THREE.MeshStandardMaterial && this.health > 0) {
                            // Only restore color if still alive
                            // Force correct team color restoration to avoid any "locked" wrong color
                            const correctColor = (this.team && this.team.toLowerCase() === 'blue') ? 0x0066ff : 0xff0000;
                            child.material.color.setHex(correctColor);
                        }
                    }, 100);
                }
            });
        }
    }
}

