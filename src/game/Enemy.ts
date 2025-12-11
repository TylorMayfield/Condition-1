import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { EnemyAI, AIPersonality } from './components/EnemyAI';
import { EnemyWeapon } from './components/EnemyWeapon';
import { RagdollBuilder } from './RagdollBuilder';
import { AmmoPickup } from './pickups/AmmoPickup';

export class Enemy extends GameObject {
    public health: number = 100;
    public ai: EnemyAI;
    public weapon: EnemyWeapon;
    private rightArm: THREE.Mesh;
    private leftArm: THREE.Mesh;
    private leftLeg: THREE.Mesh;
    private rightLeg: THREE.Mesh;
    private head: THREE.Mesh;
    private bodyMesh: THREE.Mesh;
    private time: number = 0;

    // Identity
    public name: string;
    public score: number = 0;
    public damageDealt: number = 0; // Track damage this bot has dealt

    private static BOT_NAMES = [
        "Viper", "Cobra", "Python", "Eagle", "Hawk", "Falcon",
        "Wolf", "Bear", "Tiger", "Fox", "Ghost", "Shadow",
        "Ranger", "Hunter", "Stalker", "Spectre"
    ];

    // Ragdoll State (also indicates death - ragdolled enemies are dead)
    public isRagdoll: boolean = false;
    private ragdollBodies: CANNON.Body[] = [];
    private ragdollConstraints: CANNON.Constraint[] = [];
    private deadTime: number = 0;

    /** Returns true if this enemy is dead (ragdolled) */
    public get isDead(): boolean {
        return this.isRagdoll || this.health <= 0;
    }

    constructor(game: Game, position: THREE.Vector3, team: string = 'Enemy') {
        super(game);
        this.team = team;
        this.name = Enemy.BOT_NAMES[Math.floor(Math.random() * Enemy.BOT_NAMES.length)] + " " + Math.floor(Math.random() * 100);

        // Visuals (Compound Body)
        this.mesh = new THREE.Group();
        // Mesh will be synced to body center by GameObject.update()
        // Apply spawn offset to avoid embedding in walls
        const spawnOffset = new THREE.Vector3(position.x, position.y + 1.0, position.z);
        this.mesh.position.copy(spawnOffset);
        this.mesh.castShadow = true;

        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });

        // Body (torso) - more realistic proportions
        // Mesh origin is at body center (0.8m above feet), so positions are relative to that
        const bodyGeo = new THREE.BoxGeometry(0.5, 0.6, 0.35);
        this.bodyMesh = new THREE.Mesh(bodyGeo, mat);
        this.bodyMesh.position.y = 0.6; // Was -0.5, shifted +1.1
        this.bodyMesh.castShadow = true;
        this.bodyMesh.name = 'hitbox_body'; // For damage multiplier identification
        this.mesh.add(this.bodyMesh);

        // Head - smaller and properly positioned
        const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        this.head = new THREE.Mesh(headGeo, mat);
        this.head.position.y = 1.25; // Was 0.15, shifted +1.1
        this.head.castShadow = true;
        this.head.name = 'hitbox_head'; // For damage multiplier identification
        this.mesh.add(this.head);

        // Arms (Visual only) - shorter and better positioned
        const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
        this.leftArm = new THREE.Mesh(armGeo, mat);
        this.leftArm.position.set(-0.4, 0.55, 0); // Was -0.55, shifted +1.1
        this.leftArm.castShadow = true;
        this.leftArm.name = 'hitbox_arm'; // For damage multiplier identification
        this.mesh.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, mat);
        this.rightArm.position.set(0.4, 0.55, 0); // Was -0.55, shifted +1.1
        this.rightArm.castShadow = true;
        this.rightArm.name = 'hitbox_arm'; // For damage multiplier identification
        this.mesh.add(this.rightArm);

        // Legs (Visual only) - positioned from torso bottom to feet
        const legGeo = new THREE.BoxGeometry(0.15, 0.7, 0.2);

        this.leftLeg = new THREE.Mesh(legGeo, mat);
        this.leftLeg.position.set(-0.15, -0.05, 0); // Was -1.15, shifted +1.1
        this.leftLeg.castShadow = true;
        this.leftLeg.name = 'hitbox_leg'; // For damage multiplier identification
        this.mesh.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, mat);
        this.rightLeg.position.set(0.15, -0.05, 0); // Was -1.15, shifted +1.1
        this.rightLeg.castShadow = true;
        this.rightLeg.name = 'hitbox_leg'; // For damage multiplier identification
        this.mesh.add(this.rightLeg);

        this.game.scene.add(this.mesh);

        // Physics - realistic human height (~1.6m total, center at ~0.8m)
        // Use Sphere for better stability on Trimesh floors (Box can fall through)
        const radius = 0.4; // 0.8m diameter
        const shape = new CANNON.Sphere(radius);
        this.body = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(position.x, position.y + 0.5, position.z),
            shape: shape,
            fixedRotation: true,
            material: new CANNON.Material({ friction: 0, restitution: 0 })
        });
        this.body.linearDamping = 0.1; // Low damping to allow movement
        this.body.angularFactor.set(0, 0, 0); // No rotation allowed physically
        // this.game.world.addBody(this.body); // Handled by Game.addGameObject

        // AI
        const p = Math.floor(Math.random() * 3) as AIPersonality;
        this.ai = new EnemyAI(game, this, p);

        // Weapon
        this.weapon = new EnemyWeapon(game, this);
        // Attach to Right Arm
        this.weapon.mesh.position.set(0, -0.25, 0.15); // Hold in hand (adjusted for new arm size)
        this.rightArm.add(this.weapon.mesh);

        // Color based on Team (Priority) or Personality
        if (this.team === 'Player' || this.team === 'TaskForce') {
            mat.color.setHex(0x0066cc); // Blue for Friendlies
        } else if (this.team === 'OpFor') {
            mat.color.setHex(0xcc3300); // Red for Enemies
        } else {
            // Fallback to personality if not in TDM/Team mode
            if (p === AIPersonality.Rusher) mat.color.setHex(0xff0000);
            if (p === AIPersonality.Sniper) mat.color.setHex(0x00ff00);
            if (p === AIPersonality.Tactical) mat.color.setHex(0x0000ff);
        }

        // Link physics body to this instance for hit detection
        (this.body as any).gameObject = this;
    }

    public takeDamage(amount: number, forceDir: THREE.Vector3, forceMagnitude: number, attacker?: any, hitObject?: THREE.Object3D) {
        if (this.isRagdoll) return; // Already dead/ragdolled

        // Calculate damage multiplier based on body part hit
        let multiplier = 1.0;
        let hitZone = 'body';

        if (hitObject && hitObject.name) {
            if (hitObject.name === 'hitbox_head') {
                multiplier = 2.5; // Headshot: 2.5x damage
                hitZone = 'head';
            } else if (hitObject.name === 'hitbox_body') {
                multiplier = 1.0; // Torso: normal damage
                hitZone = 'body';
            } else if (hitObject.name === 'hitbox_arm') {
                multiplier = 0.6; // Arm: reduced damage
                hitZone = 'arm';
            } else if (hitObject.name === 'hitbox_leg') {
                multiplier = 0.6; // Leg: reduced damage
                hitZone = 'leg';
            }
        }

        // Apply multiplier with slight variance (±10%)
        const variance = 0.9 + Math.random() * 0.2;
        const finalDamage = Math.round(amount * multiplier * variance);

        this.health -= finalDamage;

        // Credit damage to attacker (final damage after multiplier)
        if (attacker && 'damageDealt' in attacker) {
            attacker.damageDealt += finalDamage;
        }

        // Log hit for debugging
        console.log(`Hit ${this.name} in ${hitZone}: ${amount} * ${multiplier.toFixed(1)}x = ${finalDamage} damage`);

        // Play impact sound at hit location
        if (this.body) {
            const pos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
            this.game.soundManager.playImpact(pos);
        }

        // Notify AI of damage direction
        if (this.ai && this.body) {
            const damagePos = new THREE.Vector3(
                this.body.position.x - forceDir.x * 5,
                this.body.position.y,
                this.body.position.z - forceDir.z * 5
            );
            this.ai.onTakeDamage(damagePos);
        }

        if (this.health <= 0) {
            // Play death sound
            if (this.body) {
                const deathPos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
                this.game.soundManager.playDeath(deathPos);
            }

            // Notify game mode of death
            this.game.onEnemyDeath(this, attacker);

            this.activateRagdoll(forceDir.multiplyScalar(forceMagnitude));
            return;
        }

        // Apply Knockback
        if (this.body) {
            const impulse = new CANNON.Vec3(forceDir.x * forceMagnitude, forceDir.y * forceMagnitude, forceDir.z * forceMagnitude);
            this.body.applyImpulse(impulse, this.body.position);
        }
    }

    private activateRagdoll(forceVec?: THREE.Vector3) {
        if (this.isRagdoll) return;
        this.isRagdoll = true;

        console.log("Activating Ragdoll for Enemy");

        // 1. Remove Gameplay Body
        if (this.body) {
            this.game.world.removeBody(this.body);
            this.body = null; // Clear reference
        }

        // 2. Prepare Meshes for World Space
        // We need to detach them from the group so they can move independently
        // transform control: attach to scene, maintain world transform
        const parts: THREE.Object3D[] = [this.head, this.bodyMesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg];
        parts.forEach(part => {
            // Offset slightly upward BEFORE attaching to scene to ensure physics start clear of ground
            // (THREE.Scene.attach preserves world transform, so we modify transform first)
            // Actually, attach PRESERVES world transform, so moving it while child of Group moves it relative to Group.
            // Group is at world pos.
            part.position.y += 0.2;
            part.updateMatrixWorld(); // Update world matrix with new local pos
            this.game.scene.attach(part);
        });

        // Remove the container mesh (Group) as it is now empty/useless
        if (this.mesh) this.game.scene.remove(this.mesh);

        // 3. Create Ragdoll Physics
        // Initial velocity from the kill shot + current movement
        const initVel = new CANNON.Vec3(0, 0, 0);
        if (forceVec) {
            // CLAMP FORCE: Too much force causes tunneling through map
            const clampedForce = forceVec.clone().clampLength(0, 10); // Max 10 m/s impulse
            initVel.copy(clampedForce as any);
        }

        const rd = RagdollBuilder.createRagdoll(this.game, {
            head: this.head,
            body: this.bodyMesh,
            leftArm: this.leftArm,
            rightArm: this.rightArm,
            leftLeg: this.leftLeg,
            rightLeg: this.rightLeg
        }, initVel);

        this.ragdollBodies = rd.bodies;
        this.ragdollConstraints = rd.constraints;

        // Add to world
        this.ragdollBodies.forEach(b => this.game.world.addBody(b));
        this.ragdollConstraints.forEach(c => this.game.world.addConstraint(c));

        // Spawn ammo pickup at death location
        const deathPos = new THREE.Vector3();
        if (this.ragdollBodies[0]) {
            deathPos.set(
                this.ragdollBodies[0].position.x,
                this.ragdollBodies[0].position.y,
                this.ragdollBodies[0].position.z
            );
        } else if (this.mesh) {
            deathPos.copy(this.mesh.position);
        }
        new AmmoPickup(this.game, deathPos, 30);

        // Disable AI
        // this.ai.dispose(); // Or just stop updating
    }

    public dispose() {
        if (this.mesh) {
            this.game.scene.remove(this.mesh);
        }

        // Clean up loose parts if ragdolled
        if (this.isRagdoll) {
            [this.head, this.bodyMesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach(p => {
                this.game.scene.remove(p);
                if (p.geometry) p.geometry.dispose();
            });

            this.ragdollBodies.forEach(b => this.game.world.removeBody(b));
            this.ragdollConstraints.forEach(c => this.game.world.removeConstraint(c));
        }

        if (this.body) {
            this.game.world.removeBody(this.body);
        }
        this.ai.dispose();
        this.game.removeGameObject(this);
    }

    public update(dt: number) {
        if (this.isRagdoll) {
            // Sync meshes to bodies
            const map = [
                { mesh: this.bodyMesh, body: this.ragdollBodies[0] },
                { mesh: this.head, body: this.ragdollBodies[1] },
                { mesh: this.leftArm, body: this.ragdollBodies[2] },
                { mesh: this.rightArm, body: this.ragdollBodies[3] },
                { mesh: this.leftLeg, body: this.ragdollBodies[4] },
                { mesh: this.rightLeg, body: this.ragdollBodies[5] }
            ];

            map.forEach(item => {
                if (item.body) {
                    item.mesh.position.copy(item.body.position as any);
                    item.mesh.quaternion.copy(item.body.quaternion as any);
                }
            });

            // Cleanup after time
            this.deadTime += dt;
            // if (this.deadTime > 10) { // Disappear after 10s
            //     this.dispose();
            // }
            // Keep bodies for round duration (or until max limit handled by game)
            return;
        }

        // super.update(dt); // Don't use default sync, we want manual control over rotation

        // Sync graphics with physics (Position Only)
        if (this.body && this.mesh) {
            this.mesh.position.copy(this.body.position as any);
            // Do NOT sync rotation. Mesh rotation is handled by AI (lookAt).

            // Force body to be upright (Physics Fix)
            this.body.quaternion.set(0, 0, 0, 1);
            this.body.angularVelocity.set(0, 0, 0);

            // Force Mesh Upright (Visual Fix)
            this.mesh.rotation.z = 0;
            this.mesh.rotation.x = 0;
            this.mesh.up.set(0, 1, 0);
        }
        this.ai.update(dt);
        this.weapon.update(dt);
        this.animate(dt);
    }

    public setProne(prone: boolean) {
        this.isProne = prone;
    }

    private isProne: boolean = false;

    private animate(dt: number) {
        this.time += dt * 10; // Animation speed

        if (!this.body) return;

        // Velocity Check
        const vel = this.body.velocity;
        const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        const isMoving = speed > 0.5;

        // Reset rotations
        this.leftArm.rotation.set(0, 0, 0);
        this.rightArm.rotation.set(0, 0, 0);
        this.leftLeg.rotation.set(0, 0, 0);
        this.rightLeg.rotation.set(0, 0, 0);
        this.head.rotation.set(0, 0, 0);
        this.bodyMesh.rotation.set(0, 0, 0);
        if (this.mesh) this.mesh.rotation.x = 0; // Ensure base group is upright

        // Reset body bob
        this.bodyMesh.position.y = 0.6;
        this.head.position.y = 1.25;
        this.bodyMesh.position.z = 0;

        if (this.isProne) {
            // Prone Animation
            // Rotate the body mesh to lie flat
            this.bodyMesh.rotation.x = -Math.PI / 2;
            this.bodyMesh.position.y = -0.2; // Move down
            this.bodyMesh.position.z = -0.3; // Center mass

            this.head.position.y = 0;
            this.head.position.z = 0.6; // Forward
            this.head.rotation.x = -0.2; // Look up slightly

            this.leftLeg.rotation.x = -Math.PI / 2;
            this.leftLeg.position.y = -0.3;
            this.leftLeg.position.z = -0.8;

            this.rightLeg.rotation.x = -Math.PI / 2;
            this.rightLeg.position.y = -0.3;
            this.rightLeg.position.z = -0.8;

            if (isMoving) {
                // Crawl visual
                const crawl = Math.sin(this.time);
                this.leftArm.rotation.z = crawl * 0.5;
                this.rightArm.rotation.z = -crawl * 0.5;
                this.leftLeg.rotation.z = -crawl * 0.2;
                this.rightLeg.rotation.z = crawl * 0.2;
            }
            return; // Skip standard walking
        }

        // Walking Animation
        if (isMoving) {
            const walkCycle = Math.sin(this.time);
            const cosCycle = Math.cos(this.time);

            // Legs swing
            this.leftLeg.rotation.x = walkCycle * 0.6;
            this.rightLeg.rotation.x = -walkCycle * 0.6;

            // Arms swing (opposite to legs)
            this.leftArm.rotation.x = -walkCycle * 0.4;
            this.rightArm.rotation.x = walkCycle * 0.4;

            // Body Bob
            this.bodyMesh.position.y = 0.6 + Math.abs(cosCycle) * 0.05;
            this.head.position.y = 1.25 + Math.abs(cosCycle) * 0.05;
        }

        // Posture Overrides based on State
        const aiState = this.ai.getState();

        // Combat Stance (Aiming)
        // If Attacking, Chasing, or Alert
        if (aiState === 2 || aiState === 1 || aiState === 6 || aiState === 7 || aiState === 4) {
            // Bring right arm up to aim
            this.rightArm.rotation.x = -Math.PI / 2; // Point forward
            this.rightArm.rotation.z = -0.1; // Slight tilt

            // Left arm supports
            this.leftArm.rotation.x = -Math.PI / 2.2;
            this.leftArm.rotation.z = 0.3; // Angle in
            this.leftArm.rotation.y = 0.2;

            // Head looks intense/down sights
            this.head.rotation.x = 0.1;

            // If moving while aiming, reduce arm swing
            if (isMoving) {
                this.leftArm.rotation.x += Math.sin(this.time) * 0.1;
                this.rightArm.rotation.x += Math.sin(this.time) * 0.1;
            }
        }
    }
}

