import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { Enemy } from '../Enemy';

/**
 * Tower - Defensive structure that attacks enemies in range
 */
export class Tower extends GameObject {
    public health: number = 2000;
    public maxHealth: number = 2000;
    public attackDamage: number = 150;
    public attackRange: number = 12;
    public attackCooldown: number = 1.0; // Attack every second
    public lane: string; // Which lane this tower is in

    private attackTimer: number = 0;
    private currentTarget: GameObject | null = null;
    private turretMesh: THREE.Mesh | null = null;

    constructor(game: Game, position: THREE.Vector3, team: string, lane: string) {
        super(game);
        this.team = team;
        this.lane = lane;

        // Visual: Tower structure
        const baseGeo = new THREE.CylinderGeometry(1.5, 2, 4, 8);
        const turretGeo = new THREE.CylinderGeometry(0.8, 1, 2, 8);
        
        const mat = new THREE.MeshStandardMaterial({ 
            color: team === 'Blue' ? 0x0066ff : 0xff0000,
            metalness: 0.8,
            roughness: 0.2
        });

        const baseMesh = new THREE.Mesh(baseGeo, mat);
        baseMesh.position.y = 2;
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;

        this.turretMesh = new THREE.CylinderGeometry(0.8, 1, 2, 8);
        const turret = new THREE.Mesh(this.turretMesh, mat);
        turret.position.y = 5;
        turret.castShadow = true;

        this.mesh = new THREE.Group();
        this.mesh.add(baseMesh);
        this.mesh.add(turret);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Physics: Static body (use Box as Cylinder might not be available)
        const shape = new CANNON.Box(new CANNON.Vec3(1.5, 2, 1.5));
        this.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(position.x, position.y + 2, position.z),
            shape: shape
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
            // Tower destroyed - remove from game
            this.game.removeGameObject(this);
            if (this.mesh) {
                this.game.scene.remove(this.mesh);
            }
            if (this.body) {
                this.game.world.removeBody(this.body);
            }
            return;
        }

        this.attackTimer += dt;

        // Find target
        this.findTarget();

        // Attack if target in range
        if (this.currentTarget && this.attackTimer >= this.attackCooldown) {
            const distance = this.getDistanceToTarget();
            if (distance <= this.attackRange) {
                this.attack();
                this.attackTimer = 0;
            }
        }

        // Rotate turret toward target
        if (this.currentTarget && this.mesh) {
            const targetPos = this.getTargetPosition();
            if (targetPos) {
                const direction = targetPos.clone().sub(this.mesh.position);
                direction.y = 0; // Only rotate horizontally
                if (direction.length() > 0.1) {
                    const angle = Math.atan2(direction.x, direction.z);
                    this.mesh.rotation.y = angle;
                }
            }
        }
    }

    private findTarget(): void {
        // Find nearest enemy in range
        let nearestEnemy: GameObject | null = null;
        let nearestDistance = this.attackRange;

        const gameObjects = this.game.getGameObjects();
        for (const obj of gameObjects) {
            // Skip if same team or self
            if (obj.team === this.team || obj === this) continue;
            
            // Target enemies, minions, towers, and player
            const isTargetable = 
                obj instanceof Enemy || 
                (obj as any).isMinion || 
                obj === this.game.player ||
                (obj as any).health !== undefined; // Towers, nexus, etc.

            if (!isTargetable) continue;

            const distance = this.getDistanceTo(obj);
            if (distance < nearestDistance) {
                nearestEnemy = obj;
                nearestDistance = distance;
            }
        }

        this.currentTarget = nearestEnemy;
    }

    private getDistanceTo(obj: GameObject): number {
        if (!this.mesh || !obj.mesh) return Infinity;
        return this.mesh.position.distanceTo(obj.mesh.position);
    }

    private getDistanceToTarget(): number {
        if (!this.currentTarget) return Infinity;
        return this.getDistanceTo(this.currentTarget);
    }

    private getTargetPosition(): THREE.Vector3 | null {
        if (!this.currentTarget || !this.currentTarget.mesh) return null;
        return this.currentTarget.mesh.position.clone();
    }

    private attack(): void {
        if (!this.currentTarget) return;

        // Deal damage to target
        if (this.currentTarget instanceof Enemy) {
            this.currentTarget.takeDamage(this.attackDamage, new THREE.Vector3(0, 0, 0), 0, this, null);
        } else if (this.currentTarget === this.game.player) {
            // Player damage
            if ((this.currentTarget as any).takeDamage) {
                (this.currentTarget as any).takeDamage(this.attackDamage, new THREE.Vector3(0, 0, 0), 0, this, null);
            }
        } else if ((this.currentTarget as any).takeDamage) {
            // Minions, other entities
            (this.currentTarget as any).takeDamage(this.attackDamage, new THREE.Vector3(0, 0, 0), 0, this, null);
        }

        // Visual effect: Muzzle flash
        this.createMuzzleFlash();
        
        // Sound effect
        if (this.game.soundManager) {
            this.game.soundManager.playGunshot(this.mesh?.position || new THREE.Vector3());
        }
    }

    private createMuzzleFlash(): void {
        if (!this.mesh) return;

        const flashGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00, emissive: 0xffff00 });
        const flash = new THREE.Mesh(flashGeo, flashMat);
        
        // Position at turret top
        flash.position.copy(this.mesh.position);
        flash.position.y += 5.5;
        
        this.game.scene.add(flash);

        // Remove after short time
        setTimeout(() => {
            this.game.scene.remove(flash);
            flashGeo.dispose();
            flashMat.dispose();
        }, 100);
    }

    public takeDamage(amount: number, _direction: THREE.Vector3, _force: number, _attacker?: GameObject, _hitObject?: any): void {
        this.health -= amount;
        if (this.health < 0) this.health = 0;

        // Visual feedback: Flash red
        if (this.mesh && this.mesh.children.length > 0) {
            const baseMesh = this.mesh.children[0] as THREE.Mesh;
            if (baseMesh.material instanceof THREE.MeshStandardMaterial) {
                const originalColor = baseMesh.material.color.clone();
                baseMesh.material.color.setHex(0xff0000);
                setTimeout(() => {
                    if (baseMesh.material instanceof THREE.MeshStandardMaterial) {
                        baseMesh.material.color.copy(originalColor);
                    }
                }, 200);
            }
        }
    }
}

