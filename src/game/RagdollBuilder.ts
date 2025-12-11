
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Game } from '../engine/Game';

export interface RagdollParts {
    meshes: {
        head: THREE.Mesh;
        body: THREE.Mesh;
        leftArm: THREE.Mesh;
        rightArm: THREE.Mesh;
        leftLeg: THREE.Mesh;
        rightLeg: THREE.Mesh;
    };
    bodies: CANNON.Body[];
    constraints: CANNON.Constraint[];
}

export class RagdollBuilder {
    public static createRagdoll(_game: Game, meshes: RagdollParts['meshes'], initialVelocity: CANNON.Vec3): { bodies: CANNON.Body[], constraints: CANNON.Constraint[] } {
        const bodies: CANNON.Body[] = [];
        const constraints: CANNON.Constraint[] = [];

        const material = new CANNON.Material({ friction: 0.5, restitution: 0.1 });

        // Helper to create body from mesh
        const createBody = (mesh: THREE.Mesh, size: CANNON.Vec3, mass: number): CANNON.Body => {
            // Get world transform
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            mesh.getWorldPosition(worldPos);
            mesh.getWorldQuaternion(worldQuat);

            const shape = new CANNON.Box(size);
            const body = new CANNON.Body({
                mass: mass,
                position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
                quaternion: new CANNON.Quaternion(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w),
                material: material,
                linearDamping: 0.5,
                angularDamping: 0.5,
                // CRITICAL: Set collision groups so ragdoll interacts with world geometry
                collisionFilterGroup: 2, // Ragdoll group
                collisionFilterMask: -1 // Collide with EVERYTHING (World, other ragdolls, default objects)
            });
            body.addShape(shape);
            
            // Apply initial velocity (e.g. from the killing shot)
            body.velocity.copy(initialVelocity);

            return body;
        };

        // Dimensions (Half-extents for Cannon)
        // Dimensions (Half-extents for Cannon)
        // Slightly reduced to prevent initial interpenetration with ground
        const torsoSize = new CANNON.Vec3(0.24, 0.28, 0.16);
        const headSize = new CANNON.Vec3(0.14, 0.14, 0.14); 
        const armSize = new CANNON.Vec3(0.07, 0.24, 0.07);
        const legSize = new CANNON.Vec3(0.07, 0.34, 0.09); 
        
        // 1. Create Bodies
        const createBodyWithCCD = (mesh: THREE.Mesh, size: CANNON.Vec3, mass: number): CANNON.Body => {
            const body = createBody(mesh, size, mass);
            // Enable CCD to prevent tunneling through thin map geometry
            (body as any).ccdSpeedThreshold = 0.1;
            (body as any).ccdIterations = 2;
            return body;
        };

        const torsoBody = createBodyWithCCD(meshes.body, torsoSize, 20);
        const headBody = createBodyWithCCD(meshes.head, headSize, 5);
        const leftArmBody = createBodyWithCCD(meshes.leftArm, armSize, 5);
        const rightArmBody = createBodyWithCCD(meshes.rightArm, armSize, 5);
        const leftLegBody = createBodyWithCCD(meshes.leftLeg, legSize, 10);
        const rightLegBody = createBodyWithCCD(meshes.rightLeg, legSize, 10);

        bodies.push(torsoBody, headBody, leftArmBody, rightArmBody, leftLegBody, rightLegBody);

        // 2. Create Constraints
        // Neck: Head <-> Torso
        // Pivot in Body A (Head): Bottom center (0, -0.15, 0)
        // Pivot in Body B (Torso): Top Center (0, 0.3, 0)
        const neck = new CANNON.ConeTwistConstraint(headBody, torsoBody, {
            pivotA: new CANNON.Vec3(0, -0.15, 0),
            pivotB: new CANNON.Vec3(0, 0.3, 0),
            axisA: new CANNON.Vec3(0, 1, 0),
            axisB: new CANNON.Vec3(0, 1, 0),
            angle: Math.PI / 4,
            twistAngle: Math.PI / 4
        });
        constraints.push(neck);

        // Shoulders
        // Left Arm <-> Torso. 
        // Arm pivot: Top center (0, 0.25, 0)
        // Torso pivot: Top Left (-0.25, 0.25, 0)
        const leftShoulder = new CANNON.ConeTwistConstraint(leftArmBody, torsoBody, {
            pivotA: new CANNON.Vec3(0, 0.25, 0),
            pivotB: new CANNON.Vec3(-0.35, 0.25, 0), 
            axisA: new CANNON.Vec3(0, 1, 0),
            axisB: new CANNON.Vec3(0, 1, 0),
            angle: Math.PI / 2,
            twistAngle: Math.PI / 2
        });
        constraints.push(leftShoulder);

        const rightShoulder = new CANNON.ConeTwistConstraint(rightArmBody, torsoBody, {
            pivotA: new CANNON.Vec3(0, 0.25, 0),
            pivotB: new CANNON.Vec3(0.35, 0.25, 0),
            axisA: new CANNON.Vec3(0, 1, 0),
            axisB: new CANNON.Vec3(0, 1, 0),
            angle: Math.PI / 2,
            twistAngle: Math.PI / 2
        });
        constraints.push(rightShoulder);

        // Hips (Legs)
        // Left Leg <-> Torso
        // Leg pivot: Top center (0, 0.35, 0)
        // Torso pivot: Bottom Left (-0.15, -0.3, 0)
        const leftHip = new CANNON.ConeTwistConstraint(leftLegBody, torsoBody, {
            pivotA: new CANNON.Vec3(0, 0.35, 0),
            pivotB: new CANNON.Vec3(-0.15, -0.3, 0),
            axisA: new CANNON.Vec3(0, 1, 0),
            axisB: new CANNON.Vec3(0, 1, 0),
            angle: Math.PI / 4,
            twistAngle: Math.PI / 4
        });
        constraints.push(leftHip);

        const rightHip = new CANNON.ConeTwistConstraint(rightLegBody, torsoBody, {
            pivotA: new CANNON.Vec3(0, 0.35, 0),
            pivotB: new CANNON.Vec3(0.15, -0.3, 0),
            axisA: new CANNON.Vec3(0, 1, 0),
            axisB: new CANNON.Vec3(0, 1, 0),
            angle: Math.PI / 4,
            twistAngle: Math.PI / 4
        });
        constraints.push(rightHip);

        // Collision filtering (Optional: prevent limbs colliding with each other if messy)
        // For now, let them collide or use groups if it explodes.

        return { bodies, constraints };
    }
}
