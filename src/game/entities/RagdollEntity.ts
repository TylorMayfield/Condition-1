import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { RagdollBuilder } from '../RagdollBuilder';
import type { RagdollParts } from '../RagdollBuilder';

export class RagdollEntity extends GameObject {
    private ragdollBodies: CANNON.Body[] = [];
    private ragdollConstraints: CANNON.Constraint[] = [];
    private meshes: RagdollParts['meshes'];
    private deadTime: number = 0;
    private maxLifetime: number = 30; // Despawn after 30 seconds

    constructor(game: Game, meshes: RagdollParts['meshes'], initialVelocity: CANNON.Vec3) {
        super(game);
        this.meshes = meshes;

        // Build Physics
        const rd = RagdollBuilder.createRagdoll(this.game, meshes, initialVelocity);
        this.ragdollBodies = rd.bodies;
        this.ragdollConstraints = rd.constraints;

        // Add to world
        this.ragdollBodies.forEach(b => this.game.world.addBody(b));
        this.ragdollConstraints.forEach(c => this.game.world.addConstraint(c));

        // Register for updates (CRITICAL FIX: Was missing, so visual mesh never synced with physics)
        this.game.addGameObject(this);

        // Add meshes to scene (they should already be attached by Enemy before passing, or we attach them here)
        // Enemy.activateRagdoll logic attaches them to scene. We just ensure we track them.

        // Ensure meshes are in scene if not
        Object.values(this.meshes).forEach(mesh => {
            if (!mesh.parent) {
                this.game.scene.add(mesh);
            }
        });
    }

    public update(dt: number) {
        // Sync meshes to bodies
        const map = [
            { mesh: this.meshes.body, body: this.ragdollBodies[0] },
            { mesh: this.meshes.head, body: this.ragdollBodies[1] },
            { mesh: this.meshes.leftArm, body: this.ragdollBodies[2] },
            { mesh: this.meshes.rightArm, body: this.ragdollBodies[3] },
            { mesh: this.meshes.leftLeg, body: this.ragdollBodies[4] },
            { mesh: this.meshes.rightLeg, body: this.ragdollBodies[5] }
        ];

        map.forEach(item => {
            if (item.body && item.mesh) {
                // Debug: Print Head position to see if it's falling (Body 1 is Head)
                if (this.deadTime < 1.0 && item.body === this.ragdollBodies[1]) {
                    // console.log(`Ragdoll Head Y: ${item.body.position.y}`); 
                }

                item.mesh.position.copy(item.body.position as any);
                item.mesh.quaternion.copy(item.body.quaternion as any);
            }
        });

        // Lifetime Logic
        this.deadTime += dt;
        if (this.deadTime > this.maxLifetime) {
            this.dispose();
        }
    }

    public dispose() {
        // Remove Meshes
        Object.values(this.meshes).forEach(mesh => {
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            // Don't dispose material if shared? Or do? Maybe clone materials in Enemy?
            // Usually standard material is shared or unique per enemy. 
            // For now, let's assume GC handles material if no ref, or explicit dispose if unique.
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        });

        // Remove Physics
        this.ragdollBodies.forEach(b => this.game.world.removeBody(b));
        this.ragdollConstraints.forEach(c => this.game.world.removeConstraint(c));

        this.game.removeGameObject(this);
    }
}
