
import { GameObject } from '../../engine/GameObject';
import { Game } from '../../engine/Game';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class MallowUnit extends GameObject {
    public health: number = 100;
    public maxHealth: number = 100;
    public team: string;
    public uuid: string = Math.random().toString(36).substr(2, 9);
    public role: 'melee' | 'ranged' | 'tank' = 'melee';
    
    protected isLaunchPhase: boolean = true;
    public isCombatActive: boolean = false;
    
    // Type-only import for the property to avoid circular dependency issues at runtime
    public ai: import('../ai/MallowAI').MallowAI | null = null;
    
    // Physics Config
    protected uprightStiffness: number = 50;
    protected uprightDamping: number = 5;
    
    private leftEye!: THREE.Mesh;
    private rightEye!: THREE.Mesh;
    protected leftHand!: THREE.Mesh;
    protected rightHand!: THREE.Mesh;

    constructor(game: Game, position: THREE.Vector3, team: string) {
        super(game);
        this.team = team;
        
        this.createVisuals(position);
        this.createPhysics(position);
        
        // Dynamic import to avoid circular dependency during initialization
        import('../ai/MallowAI').then(({ MallowAI }) => {
            this.ai = new MallowAI(this);
        });
    }

    protected combatUpdate(_dt: number): void {
        // Base implementation does nothing
    }
    
    protected createVisuals(position: THREE.Vector3): void {
        const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: this.team === 'Player' ? 0xffffff : 0xaaaaaa, // White for player, Gray for enemy
            roughness: 0.3,
            metalness: 0
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        this.createFace();
        this.createHands();
        
        this.game.scene.add(this.mesh);
    }

    protected createHands(): void {
        const handGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const handMat = new THREE.MeshStandardMaterial({ color: 0xffffff }); // Same as body
        
        this.leftHand = new THREE.Mesh(handGeo, handMat);
        this.rightHand = new THREE.Mesh(handGeo, handMat);
        
        // Position hands relative to body
        this.leftHand.position.set(-0.6, 0.2, 0.3);
        this.rightHand.position.set(0.6, 0.2, 0.3);
        
        if (this.mesh) {
            this.mesh.add(this.leftHand);
            this.mesh.add(this.rightHand);
        }
    }
    
    protected createFace(): void {
        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        
        // Position on the "front" (+Z)
        this.leftEye.position.set(-0.2, 0.2, 0.45);
        this.rightEye.position.set(0.2, 0.2, 0.45);
        
        if (this.mesh) {
            this.mesh.add(this.leftEye);
            this.mesh.add(this.rightEye);
        }
    }
    
    public setExpression(type: 'neutral' | 'angry' | 'scared' | 'dead'): void {
        if (!this.leftEye || !this.rightEye) return;
        
        this.leftEye.scale.set(1, 1, 1);
        this.rightEye.scale.set(1, 1, 1);
        
        switch (type) {
            case 'angry':
                this.leftEye.scale.set(1, 0.5, 1);
                this.rightEye.scale.set(1, 0.5, 1);
                break;
            case 'scared':
                this.leftEye.scale.set(1.5, 1.5, 1);
                this.rightEye.scale.set(1.5, 1.5, 1);
                break;
            case 'dead':
                this.leftEye.scale.set(1, 0.1, 1);
                this.rightEye.scale.set(1, 0.1, 1);
                break;
        }
    }
    
    protected createPhysics(position: THREE.Vector3): void {
        const shape = new CANNON.Sphere(0.6); // Simple blob physics
        
        this.body = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: shape,
            linearDamping: 0.5, // Increase drag to stop sliding forever
            angularDamping: 0.5
        });

        // LOCK ROTATION: Only allow Y-axis rotation (Yaw)
        this.body.angularFactor.set(0, 1, 0);
        
        this.game.world.addBody(this.body);
        
        this.setupDamageHandler();
    }
    
    protected setupDamageHandler(): void {
        if (!this.body) return;
        
        this.body.addEventListener('collide', (e: any) => {
            const impactVelocity = e.contact.getImpactVelocityAlongNormal();
            
            // Lower threshold slightly to 2
            if (Math.abs(impactVelocity) > 2) { 
                const damage = Math.floor(Math.abs(impactVelocity) * 10); 
                
                if (damage > 1) {
                    this.takeDamage(damage);
                    if (damage > 10) {
                        this.setExpression('scared');
                        setTimeout(() => this.setExpression('angry'), 500);
                    }
                }
            }
        });
    }
    
    public update(dt: number): void {
        super.update(dt);
        
        // Removed: applyUprightForce (angularFactor handles upright now)
        // Just handle Facing
        if (this.isCombatActive || !this.isLaunchPhase) {
            this.handleFacing(dt);
        }
        
        if (this.isCombatActive) {
            this.combatUpdate(dt);
        }
        
        // Ring Out / Fall Death
        if (this.mesh && this.mesh.position.y < -10) {
            this.takeDamage(9999); // Instant Kill
        }
        
        if (this.body && this.mesh) {
            this.mesh.position.copy(this.body.position as any);
            this.mesh.quaternion.copy(this.body.quaternion as any);
        }
    }
    
    private handleFacing(_dt: number): void {
         if (!this.body) return;
         
         // If moving, face velocity
         const vel = this.body.velocity;
         const speed = Math.sqrt(vel.x*vel.x + vel.z*vel.z);
         
         if (speed > 0.1) {
             const targetAngle = Math.atan2(vel.x, vel.z);
             const currentQ = new THREE.Quaternion(this.body.quaternion.x, this.body.quaternion.y, this.body.quaternion.z, this.body.quaternion.w);
             const currentEuler = new THREE.Euler().setFromQuaternion(currentQ);
             
             // Smooth lerp
             let diff = targetAngle - currentEuler.y;
             while (diff > Math.PI) diff -= Math.PI * 2;
             while (diff < -Math.PI) diff += Math.PI * 2;
             
             // Apply torque to turn? Or just set angular velocity? 
             // Setting angular velocity is more stable for characters
             this.body.angularVelocity.y = diff * 5; // P-Controller
         }
    }
    
    public onLaunch(): void {
        this.isLaunchPhase = true;
        this.isCombatActive = false;
        this.setExpression('scared'); // :D
    }
    
    public onLand(): void {
        this.isLaunchPhase = false;
        this.setExpression('neutral');
    }
    
    public setCombatState(active: boolean): void {
        this.isCombatActive = active;
        if (active) {
            this.isLaunchPhase = false;
            this.setExpression('angry');
        }
    }
    
    public takeDamage(amount: number): void {
        this.health -= amount;
        const scale = 0.5 + (this.health / this.maxHealth) * 0.5;
        if (this.mesh) {
            this.mesh.scale.setScalar(scale);
        }
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    public equipHat(type: 'cowboy' | 'viking'): void {
        let hatGeo: THREE.BufferGeometry;
        let hatMat: THREE.Material;
        
        if (type === 'cowboy') {
            hatGeo = new THREE.ConeGeometry(0.6, 0.2, 8); // Brim
            // Add top part? Complicated in code. Just a cone for now.
             hatMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        } else {
            // Viking
            hatGeo = new THREE.BoxGeometry(0.6, 0.3, 0.4);
            hatMat = new THREE.MeshStandardMaterial({ color: 0x999999 });
        }
        
        const hat = new THREE.Mesh(hatGeo, hatMat);
        hat.position.set(0, 0.6, 0); // On top of head
        hat.rotation.x = -0.2; // Tilted slightly
        
        if (this.mesh) {
            this.mesh.add(hat);
        }
    }

    protected die(): void {
        this.setExpression('dead');
        this.game.removeGameObject(this);
        
        // Goo Effect: Spawn static green blob
        // For now, simpler: Just a decal or a small sphere
        const gooGeo = new THREE.SphereGeometry(0.5, 4, 4);
        const gooMat = new THREE.MeshBasicMaterial({ 
            color: this.team === 'Player' ? 0xddffdd : 0xffdddd,
            transparent: true,
            opacity: 0.8
        });
        const goo = new THREE.Mesh(gooGeo, gooMat);
        if (this.body && this.mesh) {
             goo.position.copy(this.body.position as any);
             goo.position.y = 0.1; // Flat on ground
             goo.scale.set(1, 0.1, 1); // Splat
        }
        this.game.scene.add(goo);
        
        // Register for cleanup
        const gm = this.game.gameMode as any;
        if (gm && typeof gm.registerGoo === 'function') {
            gm.registerGoo(goo);
        }
        
        // Cleanup physics
        if (this.body) {
            this.game.world.removeBody(this.body);
        }
    }
}
