
import { MallowUnit } from './MallowUnit';
import { Game } from '../../engine/Game';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ==================== TANK ====================
export class TankMallow extends MallowUnit {
    constructor(game: Game, position: THREE.Vector3, team: string) {
        super(game, position, team);
        this.maxHealth = 200;
        this.health = 200;
        this.role = 'tank';
    }
    
    protected createVisuals(position: THREE.Vector3): void {
        // Call base to get Capsule + Face + Hands
        super.createVisuals(position);
        
        // --- Add Accessories ---
        
        // 1. Tank Helmet
        const helmGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 8);
        const helmMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
        const helm = new THREE.Mesh(helmGeo, helmMat);
        helm.position.y = 0.6; // Top of head
        if (this.mesh) this.mesh.add(helm);
        
        // 2. Large Shield (Left Hand)
        if (this.leftHand) {
            const shieldGeo = new THREE.BoxGeometry(0.8, 1.0, 0.1);
            const shieldMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6 });
            const shield = new THREE.Mesh(shieldGeo, shieldMat);
            shield.position.set(0, 0, 0.2); // Hold in front
            this.leftHand.add(shield);
            
            // Adjust hand pose?
            this.leftHand.position.set(-0.5, 0.2, 0.5); // Bring shield forward
        }
    }
    
    protected createPhysics(position: THREE.Vector3): void {
        // Let's use a Sphere but heavy damping.
        const sphere = new CANNON.Sphere(0.7); 
        
        this.body = new CANNON.Body({
            mass: 20, // High mass
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: sphere,
            linearDamping: 0.2, // Slower move
            angularDamping: 0.8 // Harder to rotate/tumble
        });
        this.body.angularFactor.set(0, 1, 0); // Lock upright
        this.game.world.addBody(this.body);
        this.setupDamageHandler();
    }
}

// ==================== WARRIOR ====================
export class WarriorMallow extends MallowUnit {
    constructor(game: Game, position: THREE.Vector3, team: string) {
        super(game, position, team);
        this.maxHealth = 120;
        this.health = 120;
    }
    
    protected createVisuals(position: THREE.Vector3): void {
         super.createVisuals(position);
         
         // 1. Headband
         const band = new THREE.Mesh(
             new THREE.TorusGeometry(0.45, 0.05, 8, 16),
             new THREE.MeshStandardMaterial({ color: 0xff0000 })
         );
         band.position.y = 0.4;
         band.rotation.x = Math.PI / 2;
         if (this.mesh) this.mesh.add(band);
         
         // 2. Sword (Right Hand)
         if (this.rightHand) {
             const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x442200 }));
             const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.02), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.8 }));
             
             hilt.rotation.x = Math.PI / 2;
             blade.position.y = 0.55;
             hilt.add(blade);
             
             hilt.position.set(0, 0, 0.2); // Forward
             hilt.rotation.x = Math.PI / 4; // Point forward-ish
             
             this.rightHand.add(hilt);
         }
         
         // 3. Small Shield (Left Hand)
         if (this.leftHand) {
             const shield = new THREE.Mesh(
                 new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8),
                 new THREE.MeshStandardMaterial({ color: 0x8B4513 })
             );
             shield.rotation.x = Math.PI / 2;
             shield.position.set(0, 0, 0.2);
             this.leftHand.add(shield);
         }
    }
    
    protected createPhysics(position: THREE.Vector3): void {
        const shape = new CANNON.Sphere(0.6);
        this.body = new CANNON.Body({
            mass: 5, // Medium mass
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: shape,
            linearDamping: 0.1,
            angularDamping: 0.5
        });
        this.body.angularFactor.set(0, 1, 0); // Lock upright
        this.game.world.addBody(this.body);
        this.setupDamageHandler();
    }
}

// ==================== ARCHER ====================
export class ArcherMallow extends MallowUnit {
    constructor(game: Game, position: THREE.Vector3, team: string) {
        super(game, position, team);
        this.maxHealth = 80;
        this.health = 80;
        this.role = 'ranged';
    }

    protected createVisuals(position: THREE.Vector3): void {
        super.createVisuals(position);
        
        // 1. Hat
        const hat = new THREE.Mesh(
            new THREE.ConeGeometry(0.5, 0.4, 8),
            new THREE.MeshStandardMaterial({ color: 0x228B22 }) // Forest Green
        );
        hat.position.y = 0.7;
        if (this.mesh) this.mesh.add(hat);
        
        // 2. Bow (Left Hand)
        if (this.leftHand) {
            // Simple Bow Curve
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, -0.4, 0),
                new THREE.Vector3(0, 0, 0.3),
                new THREE.Vector3(0, 0.4, 0)
            );
            const points = curve.getPoints(10);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const bow = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x8B4513, linewidth: 3 }));
            
            // String
            const stringGeo = new THREE.BufferGeometry().setFromPoints([
                 new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, 0.4, 0)
            ]);
            const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
            bow.add(string);
            
            bow.rotation.y = Math.PI / 2; // Face forward
            bow.position.set(0, 0, 0.2);
            
            this.leftHand.add(bow);
        }
    }
    
    protected createPhysics(position: THREE.Vector3): void {
        const shape = new CANNON.Sphere(0.5); 
        
        this.body = new CANNON.Body({
            mass: 2, // Low mass
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: shape,
            linearDamping: 0.1,
            angularDamping: 0.5
        });
        this.body.angularFactor.set(0, 1, 0); // Lock upright
        this.game.world.addBody(this.body);
        this.setupDamageHandler();
    }
}

// ==================== BOSS ====================
export class BossMallow extends MallowUnit {
    private jumpCooldown: number = 0;

    constructor(game: Game, position: THREE.Vector3, team: string) {
        super(game, position, team);
        this.maxHealth = 1000;
        this.health = 1000;
        this.role = 'tank'; // Behaves like tank but bigger
        this.team = 'Enemy'; // Force enemy
    }
    
    protected createVisuals(position: THREE.Vector3): void {
        const geometry = new THREE.CapsuleGeometry(1.5, 3, 4, 16); // BIG
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x880000,
            roughness: 0.2
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        this.game.scene.add(this.mesh);
        
        // Add Crown
        const crownGeo = new THREE.CylinderGeometry(2, 2, 1, 8);
        const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd700 });
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.set(0, 2.5, 0); // On head
        this.mesh.add(crown);
    }
    
    protected createPhysics(position: THREE.Vector3): void {
        const shape = new CANNON.Sphere(1.8);
        
        this.body = new CANNON.Body({
            mass: 50, // Massive
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: shape,
            linearDamping: 0.1,
            angularDamping: 0.8
        });
        this.body.angularFactor.set(0, 1, 0); // Lock upright
        this.game.world.addBody(this.body);
        this.setupDamageHandler();
    }
    
    protected combatUpdate(dt: number): void {
        super.combatUpdate(dt);
        
        this.jumpCooldown -= dt;
        
        if (this.jumpCooldown <= 0 && this.body) {
            // GROUND POUND
            this.body.velocity.y += 15;
            this.jumpCooldown = 5; // 5 seconds cooldown
            setTimeout(() => this.shockwave(), 1000);
        }
    }
    
    private shockwave(): void {
        if (!this.body) return;
        
        console.log("BOSS SMASH!");
        // Visual effect
        const ringGeo = new THREE.RingGeometry(1, 10, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(this.body.position as any);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.2;
        this.game.scene.add(ring);
        
        // Animate ring fade
        let scale = 1;
        const expand = setInterval(() => {
            scale += 0.5;
            ring.scale.setScalar(scale);
            ring.material.opacity -= 0.05;
            if (ring.material.opacity <= 0) {
                clearInterval(expand);
                this.game.scene.remove(ring);
            }
        }, 50);
    }
}
