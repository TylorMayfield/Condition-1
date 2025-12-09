import * as THREE from 'three';
import { Game } from '../engine/Game';

export class SkyboxManager {
    private game: Game;
    private sunLight: THREE.DirectionalLight;
    private skyMesh!: THREE.Mesh;
    private clouds: THREE.Group[] = [];

    constructor(game: Game) {
        this.game = game;
        this.initSky();
        this.initClouds();

        // Use the existing directional light from Game.ts instead of creating a duplicate
        // This prevents over-lighting and conflicting shadows
        const existingLight = (game as any).mainDirectionalLight;
        if (existingLight) {
            this.sunLight = existingLight;
        } else {
            // Fallback if light doesn't exist (shouldn't happen)
            this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
            this.sunLight.position.set(-3, 10, -10);
            this.sunLight.castShadow = true;
            this.game.scene.add(this.sunLight);
        }
    }

    public reset() {
        if (this.skyMesh) {
            this.game.scene.remove(this.skyMesh);
            // dispose geometry/material?
        }
        this.clouds.forEach(c => this.game.scene.remove(c));
        this.clouds = [];

        this.initSky();
        this.initClouds();
    }

    private initSky() {
        // Gradient Sky Sphere
        const geo = new THREE.SphereGeometry(2000, 32, 32);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x4da6ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize( vWorldPosition + vec3(0, offset, 0) ).y;
                    gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
                }
            `,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        });

        this.skyMesh = new THREE.Mesh(geo, mat);
        this.skyMesh.renderOrder = -999; // Force render first
        // Ensure skybox doesn't interfere with lighting
        this.skyMesh.castShadow = false;
        this.skyMesh.receiveShadow = false;
        this.skyMesh.frustumCulled = false; // Always render
        this.game.scene.add(this.skyMesh);
    }

    private initClouds() {
        // Create a few simple cloud meshes
        const cloudCount = 30;
        for (let i = 0; i < cloudCount; i++) {
            // Random position in sky
            const x = (Math.random() - 0.5) * 100;
            const y = 20 + Math.random() * 30; // Height between 20-50
            const z = (Math.random() - 0.5) * 100;

            // Simple cloud shape using multiple spheres
            const cloudGroup = new THREE.Group();

            // Main cloud body
            const geo = new THREE.SphereGeometry(3 + Math.random() * 2, 8, 8);
            const mat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.6,
                flatShading: true
            });

            // Create cloud from multiple overlapping spheres
            for (let j = 0; j < 5; j++) {
                const cloudPart = new THREE.Mesh(geo, mat);
                cloudPart.position.set(
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 4
                );
                cloudPart.scale.set(
                    0.8 + Math.random() * 0.4,
                    0.6 + Math.random() * 0.3,
                    0.8 + Math.random() * 0.4
                );
                cloudPart.castShadow = false;
                cloudPart.receiveShadow = false;
                cloudGroup.add(cloudPart);
            }

            cloudGroup.position.set(x, y, z);
            this.clouds.push(cloudGroup);
            this.game.scene.add(cloudGroup);
        }
    }

    public update(dt: number) {
        // Move clouds slowly
        this.clouds.forEach((cloud, index) => {
            // Slow drift
            cloud.position.x += dt * (0.1 + Math.sin(index) * 0.05);
            cloud.rotation.y += dt * 0.01;

            // Wrap around if too far
            if (cloud.position.x > 60) {
                cloud.position.x = -60;
            }
        });
    }
}
