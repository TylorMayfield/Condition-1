import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { EnemyAI, AIPersonality } from './components/EnemyAI';

export class Enemy extends GameObject {
    public health: number = 100;
    private ai: EnemyAI;

    constructor(game: Game, position: THREE.Vector3) {
        super(game);

        // Visuals (Compound Body)
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;

        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });

        // Body
        const bodyGeo = new THREE.BoxGeometry(0.6, 1.0, 0.4);
        const bodyMesh = new THREE.Mesh(bodyGeo, mat);
        bodyMesh.position.y = 0;
        bodyMesh.castShadow = true;
        this.mesh.add(bodyMesh);

        // Head
        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMesh = new THREE.Mesh(headGeo, mat);
        headMesh.position.y = 0.8;
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        // Arms (Visual only)
        const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        const leftArm = new THREE.Mesh(armGeo, mat);
        leftArm.position.set(-0.5, 0.1, 0);
        leftArm.castShadow = true;
        this.mesh.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, mat);
        rightArm.position.set(0.5, 0.1, 0);
        rightArm.castShadow = true;
        this.mesh.add(rightArm);

        this.game.scene.add(this.mesh);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(0.3, 0.9, 0.3)); // Extended height to cover full body
        this.body = new CANNON.Body({
            mass: 5, // Heavier
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: shape,
            fixedRotation: true,
            material: new CANNON.Material({ friction: 0, restitution: 0 })
        });
        this.body.linearDamping = 0.9; // Drag
        this.game.world.addBody(this.body);

        // AI
        const p = Math.floor(Math.random() * 3) as AIPersonality;
        this.ai = new EnemyAI(game, this, p);

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
    }
}
