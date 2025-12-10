import * as THREE from 'three';
import { Game } from '../engine/Game';

interface Boid {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    mesh: THREE.Mesh;
}

export class BoidSystem {
    private game: Game;
    private boids: Boid[] = [];
    private boidCount: number = 60; // Increased count since we are instancing
    private center: THREE.Vector3;
    private radius: number = 50;
    
    private mesh!: THREE.InstancedMesh;
    private dummy: THREE.Object3D; // Helper for matrix calculations

    // Flocking parameters
    private maxSpeed: number = 3;
    private maxForce: number = 0.05;
    private separationDistance: number = 2;
    private alignmentDistance: number = 5;
    private cohesionDistance: number = 5;

    constructor(game: Game, center: THREE.Vector3, radius: number = 50) {
        this.game = game;
        this.center = center;
        this.radius = radius;
        this.dummy = new THREE.Object3D();
        this.initBoids();
    }

    private initBoids() {
        // Simple bird geometry
        const birdGeo = new THREE.ConeGeometry(0.15, 0.4, 4);
        birdGeo.rotateX(Math.PI / 2); // Rotate to point along Z axis by default? Or Y? Cone points Y usually.
        // Let's rely on standard orientation: Cone points up (Y). We want it to point in velocity direction.
        
        const birdMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            emissive: 0x111111
        });

        this.mesh = new THREE.InstancedMesh(birdGeo, birdMat, this.boidCount);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Will be updated every frame
        this.mesh.castShadow = true;
        this.game.scene.add(this.mesh);

        for (let i = 0; i < this.boidCount; i++) {
            // Random position in sphere around center
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const r = this.radius * Math.random();

            const x = this.center.x + r * Math.sin(phi) * Math.cos(theta);
            const y = this.center.y + 10 + r * Math.sin(phi) * Math.sin(theta);
            const z = this.center.z + r * Math.cos(phi);

            const position = new THREE.Vector3(x, y, z);
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * this.maxSpeed,
                (Math.random() - 0.5) * this.maxSpeed,
                (Math.random() - 0.5) * this.maxSpeed
            );

            // No individual mesh needed anymore
            this.boids.push({ position, velocity, mesh: null as any }); 
        }
    }

    public update(dt: number) {
        if (!this.mesh) return;

        for (let i = 0; i < this.boids.length; i++) {
            const boid = this.boids[i];

            // Calculate flocking forces
            const separation = this.calculateSeparation(boid);
            const alignment = this.calculateAlignment(boid);
            const cohesion = this.calculateCohesion(boid);
            const bounds = this.calculateBounds(boid);

            // Weight the forces
            separation.multiplyScalar(1.5);
            alignment.multiplyScalar(1.0);
            cohesion.multiplyScalar(1.0);
            bounds.multiplyScalar(2.0);

            // Apply forces
            boid.velocity.add(separation);
            boid.velocity.add(alignment);
            boid.velocity.add(cohesion);
            boid.velocity.add(bounds);

            // Limit speed
            if (boid.velocity.length() > this.maxSpeed) {
                boid.velocity.normalize().multiplyScalar(this.maxSpeed);
            }

            // Update position
            boid.position.add(boid.velocity.clone().multiplyScalar(dt));

            // Update Instance Matrix
            this.dummy.position.copy(boid.position);
            
            // Point in direction of movement
            if (boid.velocity.length() > 0.1) {
                const dir = boid.velocity.clone().normalize();
                this.dummy.quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0), // Cone initial pointing direction
                    dir
                );
            }
            
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
    }

    private calculateSeparation(boid: Boid): THREE.Vector3 {
        const steer = new THREE.Vector3();
        let count = 0;

        for (const other of this.boids) {
            const d = boid.position.distanceToSquared(other.position); // Optimization: distanceToSquared
            if (d > 0 && d < this.separationDistance * this.separationDistance) {
                const diff = boid.position.clone().sub(other.position);
                diff.normalize().divideScalar(Math.sqrt(d)); // Still need actual dist for weighting if desired
                steer.add(diff);
                count++;
            }
        }

        if (count > 0) {
            steer.divideScalar(count);
            if (steer.lengthSq() > 0) { // check squared length
                steer.normalize().multiplyScalar(this.maxSpeed);
                steer.sub(boid.velocity);
                steer.clampLength(0, this.maxForce);
            }
        }

        return steer;
    }

    private calculateAlignment(boid: Boid): THREE.Vector3 {
        const sum = new THREE.Vector3();
        let count = 0;

        for (const other of this.boids) {
            const d = tempVec.copy(boid.position).sub(other.position).lengthSq(); // Optimized allocation
            if (d > 0 && d < this.alignmentDistance * this.alignmentDistance) {
                sum.add(other.velocity);
                count++;
            }
        }

        if (count > 0) {
            sum.divideScalar(count);
            sum.normalize().multiplyScalar(this.maxSpeed);
            const steer = sum.sub(boid.velocity);
            steer.clampLength(0, this.maxForce);
            return steer;
        }

        return new THREE.Vector3();
    }

    private calculateCohesion(boid: Boid): THREE.Vector3 {
        const sum = new THREE.Vector3();
        let count = 0;

        for (const other of this.boids) {
             const d = tempVec.copy(boid.position).sub(other.position).lengthSq();
            if (d > 0 && d < this.cohesionDistance * this.cohesionDistance) {
                sum.add(other.position);
                count++;
            }
        }

        if (count > 0) {
            sum.divideScalar(count);
            return this.seek(boid, sum);
        }

        return new THREE.Vector3();
    }

    private calculateBounds(boid: Boid): THREE.Vector3 {
        // Keep boids within radius of center
        const distanceSq = boid.position.distanceToSquared(this.center);
        if (distanceSq > this.radius * this.radius) {
            return this.seek(boid, this.center).multiplyScalar(2);
        }
        return new THREE.Vector3();
    }

    private seek(boid: Boid, target: THREE.Vector3): THREE.Vector3 {
        const desired = tempVec2.copy(target).sub(boid.position);
        desired.normalize().multiplyScalar(this.maxSpeed);
        const steer = desired.sub(boid.velocity);
        steer.clampLength(0, this.maxForce);
        return steer;
    }

    public dispose() {
        if (this.mesh) {
            this.game.scene.remove(this.mesh);
            this.mesh.dispose();
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) (this.mesh.material as THREE.Material).dispose();
        }
        this.boids = [];
    }
}

// Reusable vectors to avoid allocation in loops
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
