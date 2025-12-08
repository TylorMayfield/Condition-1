import * as THREE from 'three';
import { Game } from '../engine/Game';

export const WeatherType = {
    Clear: 0,
    Rain: 1,
    Snow: 2
} as const;
export type WeatherType = (typeof WeatherType)[keyof typeof WeatherType];

export class WeatherManager {
    private game: Game;
    public currentWeather: WeatherType = WeatherType.Clear;
    public wind: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

    // Particles
    private systems: THREE.Points[] = [];
    private rainGeo!: THREE.BufferGeometry;
    private snowGeo!: THREE.BufferGeometry;
    private rainMat!: THREE.PointsMaterial;
    private snowMat!: THREE.PointsMaterial;

    private particleCount = 1000;
    private rainVelocity = new THREE.Vector3(0, -10, 0);
    private snowVelocity = new THREE.Vector3(0, -2, 0);

    constructor(game: Game) {
        this.game = game;
        this.initParticles();

        // Start random weather
        this.setWeather(WeatherType.Rain);
    }

    private initParticles() {
        // Rain
        this.rainGeo = new THREE.BufferGeometry();
        const rainPos = [];
        for (let i = 0; i < this.particleCount; i++) {
            rainPos.push((Math.random() - 0.5) * 40);
            rainPos.push(Math.random() * 20);
            rainPos.push((Math.random() - 0.5) * 40);
        }
        this.rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainPos, 3));
        this.rainMat = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.1,
            transparent: true,
            opacity: 0.8
        });

        // Snow - use completely random heights across a large range to prevent synchronized falling
        this.snowGeo = new THREE.BufferGeometry();
        const snowPos = [];
        for (let i = 0; i < this.particleCount; i++) {
            snowPos.push((Math.random() - 0.5) * 40);
            // Completely random heights from 0 to 60 to ensure particles are never synchronized
            snowPos.push(Math.random() * 60);
            snowPos.push((Math.random() - 0.5) * 40);
        }
        this.snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(snowPos, 3));
        this.snowMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.2,
            transparent: true,
            opacity: 0.8
        });
    }

    public setWeather(type: WeatherType) {
        // Clear existing
        this.systems.forEach(s => this.game.scene.remove(s));
        this.systems = [];

        this.currentWeather = type;

        if (type === WeatherType.Rain) {
            const sys = new THREE.Points(this.rainGeo, this.rainMat);
            this.game.scene.add(sys);
            this.systems.push(sys);
            this.wind.set(0.1, 0, 0.1); // Light wind
        } else if (type === WeatherType.Snow) {
            const sys = new THREE.Points(this.snowGeo, this.snowMat);
            this.game.scene.add(sys);
            this.systems.push(sys);
            this.wind.set(-0.5, 0, 0); // Stronger wind
        } else {
            this.wind.set(0, 0, 0);
        }
    }

    public update(dt: number) {
        if (this.currentWeather === WeatherType.Clear) return;

        // Process both rain and snow particles
        this.systems.forEach(sys => {
            const positions = sys.geometry.attributes.position.array as Float32Array;
            // Use appropriate velocity based on which geometry this is
            const velocity = sys.geometry === this.snowGeo ? this.snowVelocity : this.rainVelocity;

            // Move with camera
            sys.position.x = this.game.camera.position.x;
            sys.position.z = this.game.camera.position.z;

            // Sim
            for (let i = 0; i < this.particleCount; i++) {
                let x = positions[i * 3];
                let y = positions[i * 3 + 1];
                let z = positions[i * 3 + 2];

                x += (velocity.x + this.wind.x) * dt;
                y += (velocity.y + this.wind.y) * dt;
                z += (velocity.z + this.wind.z) * dt;

                // Wrap around - use larger range for snow (60) vs rain (20)
                // For snow, reset to random height to prevent synchronized "wall" effect
                const maxY = sys.geometry === this.snowGeo ? 60 : 20;
                if (y < 0) {
                    // Reset snow particles to random heights to prevent wall effect
                    y = sys.geometry === this.snowGeo ? Math.random() * 60 : maxY;
                    // Also randomize X and Z slightly when wrapping to break up patterns
                    if (sys.geometry === this.snowGeo) {
                        x = (Math.random() - 0.5) * 40;
                        z = (Math.random() - 0.5) * 40;
                    }
                }
                if (x < -20) x = 20;
                if (x > 20) x = -20;
                if (z < -20) z = 20;
                if (z > 20) z = -20;

                positions[i * 3] = x;
                positions[i * 3 + 1] = y;
                positions[i * 3 + 2] = z;
            }
            sys.geometry.attributes.position.needsUpdate = true;
        });

        // Randomly change wind slightly
        this.wind.x += (Math.random() - 0.5) * dt * 0.5;
        this.wind.z += (Math.random() - 0.5) * dt * 0.5;
    }
}
