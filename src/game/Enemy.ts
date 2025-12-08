import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { EnemyAI, AIPersonality } from './components/EnemyAI';
import { EnemyWeapon } from './components/EnemyWeapon';

export class Enemy extends GameObject {
    public health: number = 100;
    private ai: EnemyAI;
    public weapon: EnemyWeapon;
    private rightArm: THREE.Mesh;

    constructor(game: Game, position: THREE.Vector3) {
        super(game);

        // Visuals (Compound Body)
        this.mesh = new THREE.Group();
        // Mesh will be synced to body center by GameObject.update()
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;

        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });

        // Body (torso) - more realistic proportions
        // Mesh origin is at body center (0.8m above feet), so positions are relative to that
        const bodyGeo = new THREE.BoxGeometry(0.5, 0.6, 0.35);
        const bodyMesh = new THREE.Mesh(bodyGeo, mat);
        bodyMesh.position.y = -0.5; // Torso center at 0.3m above feet = -0.5 relative to body center
        bodyMesh.castShadow = true;
        this.mesh.add(bodyMesh);

        // Head - smaller and properly positioned
        const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const headMesh = new THREE.Mesh(headGeo, mat);
        headMesh.position.y = 0.15; // Head center at ~0.95m above feet = 0.15 relative to body center
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        // Arms (Visual only) - shorter and better positioned
        const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
        const leftArm = new THREE.Mesh(armGeo, mat);
        leftArm.position.set(-0.4, -0.55, 0); // Arms at 0.25m above feet = -0.55 relative to body center
        leftArm.castShadow = true;
        this.mesh.add(leftArm);

        this.rightArm = new THREE.Mesh(armGeo, mat);
        this.rightArm.position.set(0.4, -0.55, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        this.game.scene.add(this.mesh);

        // Physics - realistic human height (~1.6m total, center at ~0.8m)
        const shape = new CANNON.Box(new CANNON.Vec3(0.25, 0.8, 0.25)); // 1.6m tall total
        this.body = new CANNON.Body({
            mass: 5, // Heavier
            position: new CANNON.Vec3(position.x, position.y + 0.8, position.z), // Center at 0.8m
            shape: shape,
            fixedRotation: true,
            material: new CANNON.Material({ friction: 0, restitution: 0 })
        });
        this.body.linearDamping = 0.9; // Drag
        this.game.world.addBody(this.body);

        // AI
        const p = Math.floor(Math.random() * 3) as AIPersonality;
        this.ai = new EnemyAI(game, this, p);

        // Weapon
        this.weapon = new EnemyWeapon(game, this);
        // Attach to Right Arm
        this.weapon.mesh.position.set(0, -0.25, 0.15); // Hold in hand (adjusted for new arm size)
        this.rightArm.add(this.weapon.mesh);

        // Color based on personality
        if (p === AIPersonality.Rusher) mat.color.setHex(0xff0000);
        if (p === AIPersonality.Sniper) mat.color.setHex(0x00ff00);
        if (p === AIPersonality.Tactical) mat.color.setHex(0x0000ff);

        // Link physics body to this instance for hit detection
        (this.body as any).gameObject = this;
    }

    public takeDamage(amount: number, forceDir: THREE.Vector3, forceMagnitude: number) {
        this.health -= amount;
        if (this.health <= 0) {
            this.dispose();
            return;
        }

        // Apply Knockback
        if (this.body) {
            const impulse = new CANNON.Vec3(forceDir.x * forceMagnitude, forceDir.y * forceMagnitude, forceDir.z * forceMagnitude);
            this.body.applyImpulse(impulse, this.body.position);
        }
    }

    public dispose() {
        if (this.mesh) {
            this.game.scene.remove(this.mesh);
            // Traverse to dispose geoms/mats if needed
        }
        if (this.body) {
            this.game.world.removeBody(this.body);
        }
        this.ai.dispose();
        this.game.removeGameObject(this);
    }

    public update(dt: number) {
        super.update(dt);
        this.ai.update(dt);
        this.weapon.update(dt);
    }
}
