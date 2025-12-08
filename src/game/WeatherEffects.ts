import * as THREE from 'three';
import { Game } from '../engine/Game';
import { WeatherType } from './WeatherManager';

interface LensParticle {
    x: number;
    y: number; // local y relative to camera center
    life: number;
    maxLife: number;
    size: number;
    velocity: number;
    type: 'rain' | 'snow';
}

export class WeatherEffects {
    private game: Game;
    private particles: LensParticle[] = [];
    private mesh: THREE.Points;
    private geometry: THREE.BufferGeometry;
    private material: THREE.PointsMaterial;

    private maxParticles = 500;
    private spawnTimer = 0;

    constructor(game: Game) {
        this.game = game;

        // Setup Lens Particle System
        this.geometry = new THREE.BufferGeometry();

        // Pre-allocate buffers
        const positions = new Float32Array(this.maxParticles * 3);
        const sizes = new Float32Array(this.maxParticles);

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Use a simple texture for droplets/flakes? Or simple points
        // For distinct rain/snow look, we might want a simple canvas texture
        const texture = this.createParticleTexture();

        this.material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            map: texture,
            transparent: true,
            opacity: 1.0,
            depthTest: false,
            depthWrite: false
        });

        this.mesh = new THREE.Points(this.geometry, this.material);

        // Attach to camera so it moves with it (HUD-like)
        // Adjust z to be just in front of near plane
        this.mesh.position.set(0, 0, -0.5);
        this.mesh.frustumCulled = false; // Always render

        this.game.camera.add(this.mesh);
    }

    private createParticleTexture(): THREE.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Soft circle
            const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 32, 32);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    public update(dt: number) {
        const weather = this.game.weatherManager.currentWeather;

        // Spawn
        if (weather !== WeatherType.Clear) {
            this.spawnTimer += dt;
            const spawnRate = weather === WeatherType.Rain ? 0.05 : 0.1; // Rain faster, Snow pile up?

            // Spawn multiple per frame if needed?
            // Simple approach: spawn 1-5 based on intensity
            if (this.spawnTimer > spawnRate) {
                this.spawnTimer = 0;
                this.spawnParticle(weather === WeatherType.Rain ? 'rain' : 'snow');
            }
        }

        // Update Particles
        const positions = this.geometry.attributes.position.array as Float32Array;
        // We can't easily control per-particle opacity with basic PointsMaterial (it's global opacity * texture alpha).
        // For "fade out", simpler to just shrink size? Or usage VertexColors?
        // Let's rely on shrinking size for fade out effect for now, or assume constant alpha until death.

        let activeCount = 0;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Logic
            if (p.type === 'rain') {
                p.y -= p.velocity * dt; // Slide down
            } else {
                // Snow sticks more, maybe slides very slowly
                p.y -= (p.velocity * 0.1) * dt;
            }

            // Update Buffer
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = 0; // Local Z relative to container (which is at -0.5)

            activeCount++;
        }

        // Hide unused particles
        // Actually, we must rebuild the buffer or just draw active count. 
        // ThreeJS Points draws all vertices in buffer. Max range. 
        // We need to 'hide' the rest.
        for (let i = activeCount; i < this.maxParticles; i++) {
            positions[i * 3] = 9999; // Move offscreen
        }

        this.geometry.attributes.position.needsUpdate = true;
    }

    private spawnParticle(type: 'rain' | 'snow') {
        if (this.particles.length >= this.maxParticles) return;

        // Screen bounds at z=-0.5 roughly
        // FoV 75, Aspect ~1.7
        // H = 2 * tan(75/2) * 0.5 ~= 0.76
        // W = H * Aspect ~= 1.3
        const rangeX = 0.6;
        const rangeY = 0.4;

        this.particles.push({
            x: (Math.random() - 0.5) * rangeX,
            y: (Math.random() - 0.5) * rangeY,
            life: type === 'rain' ? 0.5 + Math.random() * 0.5 : 2.0 + Math.random() * 2.0, // Snow lasts longer
            maxLife: 2.0,
            size: type === 'rain' ? 0.05 : 0.08,
            velocity: type === 'rain' ? 0.5 : 0.05,
            type: type
        });
    }
}
