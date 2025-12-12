import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';

export class Grenade {
    private game: Game;
    public mesh: THREE.Mesh;
    public body: CANNON.Body;
    private fuseTime: number = 3.0; // 3 seconds
    private timer: number = 0;
    private exploded: boolean = false;
    private radius: number = 8.0; // Explosion radius in meters
    private damage: number = 100;

    constructor(game: Game, position: THREE.Vector3, velocity: THREE.Vector3) {
        this.game = game;

        // Visual
        const geo = new THREE.SphereGeometry(0.1, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0x005500, roughness: 0.8 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(position);
        this.game.scene.add(this.mesh);

        // Physics
        const shape = new CANNON.Sphere(0.1);
        this.body = new CANNON.Body({
            mass: 0.5,
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: shape,
            material: new CANNON.Material({ friction: 0.3, restitution: 0.7 })
        });
        this.body.velocity.set(velocity.x, velocity.y, velocity.z);
        this.body.angularVelocity.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
        this.body.linearDamping = 0.1;
        this.body.angularDamping = 0.1;

        this.game.world.addBody(this.body);

        this.game.addTickCallback(this.update.bind(this));
    }

    public update(dt: number) {
        if (this.exploded) return;

        // Sync visual
        this.mesh.position.copy(this.body.position as any);
        this.mesh.quaternion.copy(this.body.quaternion as any);

        this.timer += dt;
        if (this.timer >= this.fuseTime) {
            this.explode();
        }
    }

    private explode() {
        if (this.exploded) return;
        this.exploded = true;

        const pos = this.body.position;
        const explosionPos = new THREE.Vector3(pos.x, pos.y, pos.z);

        // Visual Effect
        this.createExplosionEffect(explosionPos);

        // Sound
        // this.game.soundManager.playExplosion(explosionPos); 
        // Need to implement playExplosion in SoundManager, for now generic sound or log
        // Grenade exploded

        // Physics Force & Damage
        const bodies = this.game.world.bodies; // Access all bodies
        for (const b of bodies) {
            const dist = b.position.distanceTo(pos);
            if (dist < this.radius) {
                // Apply Force
                const force = (this.radius - dist) * 50; // Force magnitude
                const dir = b.position.vsub(pos);
                dir.normalize();
                b.applyImpulse(dir.scale(force), b.position);

                // Apply Damage if it's a Game Object
                // Find owner
                const go = this.findGameObjectForBody(b);
                if (go && 'takeDamage' in go) {
                    const dmg = Math.floor((1 - (dist / this.radius)) * this.damage);
                    if (dmg > 0) {
                        (go as any).takeDamage(dmg);
                    }
                }
            }
        }

        // Cleanup
        this.destroy();
    }

    private findGameObjectForBody(body: CANNON.Body): any {
        return this.game.getGameObjects().find(go => go.body === body);
    }

    private createExplosionEffect(pos: THREE.Vector3) {
        // Flash light
        const light = new THREE.PointLight(0xffaa00, 5, 10);
        light.position.copy(pos);
        this.game.scene.add(light);

        // Particle/Geometry burst
        const geom = new THREE.SphereGeometry(0.5, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 1 });
        const sphere = new THREE.Mesh(geom, mat);
        sphere.position.copy(pos);
        this.game.scene.add(sphere);

        // Animate out
        let scale = 1.0;
        const animate = () => {
            if (scale > 5.0) {
                this.game.scene.remove(light);
                this.game.scene.remove(sphere);
                return;
            }
            scale += 0.2;
            sphere.scale.setScalar(scale);
            mat.opacity -= 0.05;
            requestAnimationFrame(animate);
        };
        animate();
    }

    public destroy() {
        this.game.scene.remove(this.mesh);
        this.game.world.removeBody(this.body);
        // Remove tick callback? Game class might not handle unregister well without ID.
        // Assuming Game has no removeTickCallback, or we just stop updating via flag.
        // Grenade effectively becomes inert.
    }
}
