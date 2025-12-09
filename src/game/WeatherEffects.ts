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

        // Spawn Logic
        this.spawnTimer += dt;

        if (weather === WeatherType.Rain) {
            if (this.spawnTimer > 0.05) {
                this.spawnTimer = 0;
                this.spawnParticle('rain');
            }
        } else if (weather === WeatherType.Snow) {
            // Snow spawns slightly slower but lingers
            if (this.spawnTimer > 0.1) {
                this.spawnTimer = 0;
                this.spawnParticle('snow');
            }
        } else {
            this.spawnTimer = 0;
        }

        // Update Particles
        const positions = this.geometry.attributes.position.array as Float32Array;
        let activeCount = 0;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            activeCount++;
        }

        // Hide unused particles
        for (let i = activeCount; i < this.maxParticles; i++) {
            positions[i * 3] = 9999;
        }

        this.geometry.attributes.position.needsUpdate = true;
    }

    private spawnParticle(type: 'rain' | 'snow') {
        if (this.particles.length >= this.maxParticles) return;

        const rangeX = type === 'snow' ? 0.8 : 0.6; // Wider area for snow
        const rangeY = 0.5;

        this.particles.push({
            x: (Math.random() - 0.5) * rangeX,
            y: (Math.random() - 0.5) * rangeY + 0.2, // Spawn higher up
            life: type === 'rain' ? 0.5 + Math.random() * 0.5 : 3.0 + Math.random() * 2.0,
            maxLife: 2.0,
            size: type === 'rain' ? 0.05 : 0.08,
            velocity: type === 'rain' ? 0.8 : 0.1, // Snow falls slow
            type: type
        });
    }
}
