import * as THREE from 'three';
import { Game } from '../engine/Game';

export class SkyboxManager {
    private game: Game;
    private sunLight: THREE.DirectionalLight;
    private skyMesh!: THREE.Mesh;
    private godraysMesh!: THREE.Mesh;

    constructor(game: Game) {
        this.game = game;
        this.initSky();
        this.initGodrays();

        // Find existing sun or create new
        // Game.ts setupLighting creates a dir light. Let's find it or just add ours.
        // For simplicity, we add a controllable sun here.
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;
        this.game.scene.add(this.sunLight);
    }

    private initSky() {
        // Simple Gradient Sky Sphere
        const geo = new THREE.SphereGeometry(90, 32, 32);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
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
                    float h = normalize( vWorldPosition + offset ).y;
                    gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
                }
            `,
            side: THREE.BackSide
        });

        this.skyMesh = new THREE.Mesh(geo, mat);
        this.game.scene.add(this.skyMesh);
    }

    private initGodrays() {
        // Volumetric Cone Logic (simplified fake godrays)
        // Adjust geometry to look like beams coming from sun direction
        const geo = new THREE.ConeGeometry(20, 100, 8, 1, true);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffddaa,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.godraysMesh = new THREE.Mesh(geo, mat);

        // Position high up
        this.godraysMesh.position.set(20, 40, 20);
        this.godraysMesh.lookAt(0, 0, 0);

        this.game.scene.add(this.godraysMesh);
    }

    public update(dt: number) {
        // Rotate godrays slightly for dynamic effect
        if (this.godraysMesh) {
            this.godraysMesh.rotation.z += dt * 0.05;
        }

        // Move clouds?
    }
}
