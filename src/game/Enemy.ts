import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { EnemyAI, AIPersonality } from './components/EnemyAI';
import { EnemyWeapon } from './components/EnemyWeapon';

import { AmmoPickup } from './pickups/AmmoPickup';
import { RagdollEntity } from './entities/RagdollEntity';
import { Grenade } from './components/Grenade';

export class Enemy extends GameObject {
    public health: number = 100;
    public ai: EnemyAI;
    public weapon: EnemyWeapon;
    private rightArm: THREE.Mesh;
    private leftArm: THREE.Mesh;
    private leftLeg: THREE.Mesh;
    private rightLeg: THREE.Mesh;
    public head: THREE.Mesh;
    private bodyMesh: THREE.Mesh;
    private time: number = 0;

    // Identity
    public name: string;
    public score: number = 0;
    public damageDealt: number = 0; // Track total damage this bot has dealt
    public enemyDamageDealt: number = 0; // Damage dealt to enemies only
    public friendlyDamageDealt: number = 0; // Friendly fire damage

    // Animation State
    public aimWeight: number = 0; // 0 = Relaxed, 1 = Aiming
    public leanAmount: number = 0; // -1 (Left) to 1 (Right)

    // Threat Tracking
    public isUnderFire: boolean = false;
    private underFireTimer: number = 0;

    // Aiming State
    private lookPitch: number = 0;

    private static BOT_NAMES = [
        "Viper", "Cobra", "Python", "Eagle", "Hawk", "Falcon",
        "Wolf", "Bear", "Tiger", "Fox", "Ghost", "Shadow",
        "Ranger", "Hunter", "Stalker", "Spectre"
    ];

    // Ragdoll State (also indicates death - ragdolled enemies are dead)
    public isRagdoll: boolean = false;

    /** Returns true if this enemy is dead (ragdolled) */
    public get isDead(): boolean {
        return this.isRagdoll || this.health <= 0;
    }

    constructor(game: Game, position: THREE.Vector3, team: string = 'Enemy', name?: string) {
        super(game);
        this.team = team;
        this.name = name || (Enemy.BOT_NAMES[Math.floor(Math.random() * Enemy.BOT_NAMES.length)] + " " + Math.floor(Math.random() * 100));

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

        // Link visual mesh to this instance for fast raycast lookup
        this.mesh.userData.gameObject = this;
        this.mesh.traverse((child) => {
            child.userData.gameObject = this;
        });
    }

    public takeDamage(amount: number, forceDir: THREE.Vector3 = new THREE.Vector3(0, 0, 0), forceMagnitude: number = 0, attacker?: any, hitObject?: THREE.Object3D) {
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

            // Track enemy damage vs friendly fire separately
            if ('team' in attacker) {
                if (attacker.team === this.team) {
                    // Friendly fire - same team
                    (attacker as any).friendlyDamageDealt = ((attacker as any).friendlyDamageDealt || 0) + finalDamage;
                } else {
                    // Enemy damage - different team
                    (attacker as any).enemyDamageDealt = ((attacker as any).enemyDamageDealt || 0) + finalDamage;
                }
            }
        }

        // Log hit for debugging
        // Debug hit logging removed for performance

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

        // Mark as under fire
        this.isUnderFire = true;
        this.underFireTimer = 2.0; // 2 seconds of under fire status

        // Apply Knockback
        if (this.body) {
            const impulse = new CANNON.Vec3(forceDir.x * forceMagnitude, forceDir.y * forceMagnitude, forceDir.z * forceMagnitude);
            this.body.applyImpulse(impulse, this.body.position);
        }
    }

    private activateRagdoll(forceVec?: THREE.Vector3) {
        if (this.isRagdoll) return;
        this.isRagdoll = true;

        // Activating ragdoll

        // 1. Remove Gameplay Body
        if (this.body) {
            this.game.world.removeBody(this.body);
            this.body = null;
        }

        // 2. Prepare Meshes
        // Detach from group, attach to scene so they persist
        const parts = {
            head: this.head,
            body: this.bodyMesh,
            leftArm: this.leftArm,
            rightArm: this.rightArm,
            leftLeg: this.leftLeg,
            rightLeg: this.rightLeg
        };

        // Attach to scene to detach from this.mesh group
        Object.values(parts).forEach(part => {
            // Offset up slightly to avoid floor clip on spawn
            part.position.y += 0.2;
            part.updateMatrixWorld();
            this.game.scene.attach(part);
        });

        // 3. Calculate Velocity
        const initVel = new CANNON.Vec3(0, 0, 0);
        if (forceVec) {
            const clampedForce = forceVec.clone().clampLength(0, 10);
            initVel.copy(clampedForce as any);
        }

        // 4. Create Ragdoll Entity
        new RagdollEntity(this.game, parts, initVel);

        // 5. Spawn Ammo
        const deathPos = this.mesh ? this.mesh.position.clone() : new THREE.Vector3();
        new AmmoPickup(this.game, deathPos, 30);

        // 6. Dispose this Enemy
        // We need to prevent dispose() from destroying the meshes we just handed off
        // By detaching them from this.mesh, they are no longer children.
        // We just need to make sure dispose() doesn't explicitly remove 'this.head', etc.
        // I will update dispose() next.
        this.dispose();
    }

    public dispose() {
        if (this.mesh) {
            this.game.scene.remove(this.mesh);
        }

        // If ragdolled, meshes are owned by RagdollEntity.
        // If NOT ragdolled (e.g. round reset), we should clean up geometry?
        // For simplicity, let's assume if we are disposing alive enemy (round reset), we should clean up geometry.
        if (!this.isRagdoll) {
            [this.head, this.bodyMesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach(p => {
                if (p && p.geometry) p.geometry.dispose();
            });
        }

        if (this.body) {
            this.game.world.removeBody(this.body);
        }
        this.ai.dispose();
        this.game.removeGameObject(this);
    }

    public update(dt: number) {
        if (this.isRagdoll) return; // Should be disposed, but safety check

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

        // Only update AI if GameMode allows it
        if (!this.game.gameMode || this.game.gameMode.aiEnabled) {
            this.ai.update(dt);
        } else {
            // Even if AI disabled, we might want to ensure they aren't stuck in a moving animation?
            // For now, just freezing logic is enough, animations are handled below in animate() which relies on velocity.
            // If we stop calling ai.update(), navigation/movement stops updating velocity, so they should stop.
        }

        this.weapon.update(dt);

        if (this.grenadeCooldown > 0) {
            this.grenadeCooldown -= dt;
        }

        if (this.underFireTimer > 0) {
            this.underFireTimer -= dt;
            if (this.underFireTimer <= 0) {
                this.isUnderFire = false;
            }
        }

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
        this.head.rotation.set(this.lookPitch, 0, 0);
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
            this.head.position.y = 1.25 + Math.abs(cosCycle) * 0.05;
        }

        // Apply Leaning (Upper Body Only)
        if (Math.abs(this.leanAmount) > 0.01) {
            const leanAngle = -this.leanAmount * 0.5; // Max ~30 degrees

            // Rotate body around Z
            this.bodyMesh.rotation.z += leanAngle;
            // Head follows
            this.head.rotation.z += leanAngle;
            // Arms follow
            this.leftArm.rotation.z += leanAngle;
            this.rightArm.rotation.z += leanAngle;

            // Visual Offset to simulate leaning out
            this.head.position.x += this.leanAmount * 0.3;
            this.bodyMesh.position.x += this.leanAmount * 0.15;
        }

        // Posture Overrides based on State
        const aiState = this.ai.getState();

        // Check if we should be aiming
        // Attacking(2), Chasing(1), Alert(6), Guarding(7), Searching(4)
        const shouldAim = (aiState === 2 || aiState === 1 || aiState === 6 || aiState === 7 || aiState === 4);
        const targetAimWeight = shouldAim ? 1.0 : 0.0;

        // Lerp aim weight
        this.aimWeight = THREE.MathUtils.lerp(this.aimWeight, targetAimWeight, dt * 10);

        // Apply Aiming Pose on top of walk cycle
        if (this.aimWeight > 0.01) {
            // Right arm (Weapon)
            const currentRA_X = this.rightArm.rotation.x;
            // Base aim is -90 deg (forward), plus pitch (look up/down)
            const targetRA_X = -Math.PI / 2 + this.lookPitch;
            this.rightArm.rotation.x = THREE.MathUtils.lerp(currentRA_X, targetRA_X, this.aimWeight);

            this.rightArm.rotation.z = THREE.MathUtils.lerp(0, -0.1, this.aimWeight);

            // Left arm (Support)
            const currentLA_X = this.leftArm.rotation.x;
            this.leftArm.rotation.x = THREE.MathUtils.lerp(currentLA_X, -Math.PI / 2.2, this.aimWeight);
            this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0.3, this.aimWeight);
            this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0.2, this.aimWeight);

            // Head looks based on lookPitch
            this.head.rotation.x = this.lookPitch;

            // Aim Wiggle while moving
            if (isMoving && this.aimWeight > 0.5) {
                const wiggle = Math.sin(this.time) * 0.05 * this.aimWeight;
                this.leftArm.rotation.x += wiggle;
                this.rightArm.rotation.x += wiggle;
            }
        }
    }

    // === COMBAT ABILITIES ===

    public setLookAngles(yaw: number, pitch: number) {
        if (this.mesh) {
            this.mesh.rotation.y = yaw;
        }
        if (this.head) {
            // Clamp pitch to avoid neck breaking (-80 to +80 degrees)
            const clampedPitch = Math.max(-1.4, Math.min(1.4, pitch));
            this.lookPitch = clampedPitch;
            this.head.rotation.x = clampedPitch;
        }
    }

    public fireAtLookDirection() {
        if (!this.weapon || !this.head || !this.mesh) return;

        // Calculate aim direction from mesh/head rotation
        // Mesh Y rotation + Head X rotation
        const yaw = this.mesh.rotation.y;
        const pitch = this.head.rotation.x;

        // Convert to direction vector
        const dir = new THREE.Vector3(0, 0, 1); // Forward relative to object
        // Apply Head Pitch first (rotation around local X)
        dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
        // Apply Body Yaw (rotation around world Y)
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        // Calculate target point far away
        const origin = this.head.position.clone().add(this.mesh.position);
        const targetPos = origin.clone().add(dir.multiplyScalar(100)); // 100m away

        this.weapon.pullTrigger(targetPos);
    }

    private grenadeCooldown: number = 0;

    public throwGrenade() {
        if (this.grenadeCooldown > 0) return;
        if (!this.head || !this.mesh) return;

        this.grenadeCooldown = 5.0; // 5 seconds cooldown

        // Throwing grenade

        // Spawn position (from hand/head)
        const origin = this.head.position.clone().add(this.mesh.position);
        origin.y += 0.2;
        origin.add(new THREE.Vector3(0.5, 0, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y));

        // Throw velocity (aim direction * power)
        const yaw = this.mesh.rotation.y;
        const pitch = this.head.rotation.x;

        const dir = new THREE.Vector3(0, 0, 1);
        dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch - 0.2); // Tilted up slightly for arc
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        const velocity = dir.multiplyScalar(15); // 15 m/s throw

        new Grenade(this.game, origin, velocity);
    }

    // === MOVEMENT ABILITIES ===

    public jump() {
        if (this.checkGrounded()) {
            if (this.body) {
                this.body.velocity.y = 5; // Jump Force
            }
        }
    }

    public lean(amount: number) {
        // -1 (Left) to 1 (Right)
        this.leanAmount = THREE.MathUtils.clamp(amount, -1, 1);

        if (this.bodyMesh && this.head) {
            // Visual Lean: Rotate torso and head around Z axis
            // Note: animate() resets rotations every frame, so we need to apply this IN animate() or ensure animate() respects it.
            // We will modify animate() to apply this offset.
        }
    }

    public toggleCrouch() {
        // Simple toggle state
        this.isProne = !this.isProne; // Reusing isProne internal link or separate crouch? 
        // Logic uses setProne/isProne. Let's assume toggleCrouch means toggle Low Profile (Prone/Crouch)
        // For AI simplicity, let's map it to Prone for now or add explicit Crouch later.
        // The implementation plan mentioned Crouch/Prone. 
        // Existing code has setProne. I will use that.
    }

    public setCrouch(isCrouching: boolean) {
        // Reuse isProne for now as "Low Profile" mode
        this.setProne(isCrouching);
    }

    private checkGrounded(): boolean {
        if (!this.body) return false;

        const world = this.game.world;
        let isGrounded = false;

        for (const contact of world.contacts) {
            let normalY = 0;
            if (contact.bi === this.body) {
                normalY = -contact.ni.y;
            } else if (contact.bj === this.body) {
                normalY = contact.ni.y;
            } else {
                continue;
            }

            if (normalY > 0.5) {
                isGrounded = true;
                break;
            }
        }
        return isGrounded;
    }
}
