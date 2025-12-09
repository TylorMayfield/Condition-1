import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export class MotionBlurPass extends Pass {
    private fsQuad: FullScreenQuad;
    private material: THREE.ShaderMaterial;
    private previousCameraPosition: THREE.Vector3;
    private cameraVelocity: THREE.Vector3;

    constructor(private renderer: THREE.WebGLRenderer) {
        super();

        this.previousCameraPosition = new THREE.Vector3();
        this.cameraVelocity = new THREE.Vector3();

        // Simplified motion blur shader based on camera movement
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                intensity: { value: 0.3 },
                direction: { value: new THREE.Vector2(0, 0) },
                maxBlur: { value: 0.5 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float intensity;
                uniform vec2 direction;
                uniform float maxBlur;
                varying vec2 vUv;

                void main() {
                    float speed = length(direction);
                    
                    if (speed < 0.001) {
                        gl_FragColor = texture2D(tDiffuse, vUv);
                        return;
                    }

                    vec2 dir = normalize(direction);
                    vec3 color = vec3(0.0);
                    float totalWeight = 0.0;
                    int samples = int(min(speed * intensity * 20.0, maxBlur * 20.0));

                    for (int i = -samples; i <= samples; i++) {
                        float weight = 1.0 - abs(float(i)) / float(samples + 1);
                        vec2 offset = dir * float(i) * 0.005;
                        color += texture2D(tDiffuse, vUv + offset).rgb * weight;
                        totalWeight += weight;
                    }

                    gl_FragColor = vec4(color / totalWeight, 1.0);
                }
            `
        });

        this.fsQuad = new FullScreenQuad(this.material);
    }

    public update(
        camera: THREE.Camera,
        previousViewMatrix: THREE.Matrix4,
        previousProjectionMatrix: THREE.Matrix4,
        deltaTime: number
    ): void {
        // Calculate camera velocity from position change
        const currentPosition = new THREE.Vector3();
        camera.getWorldPosition(currentPosition);
        
        // Initialize previous position on first frame
        if (this.previousCameraPosition.lengthSq() === 0) {
            this.previousCameraPosition.copy(currentPosition);
        }
        
        // Calculate velocity vector
        this.cameraVelocity.subVectors(currentPosition, this.previousCameraPosition);
        this.previousCameraPosition.copy(currentPosition);

        // Convert 3D velocity to 2D screen space direction
        // This is a simplified approximation
        const speed = this.cameraVelocity.length();
        if (speed > 0.001 && deltaTime > 0) {
            // Normalize velocity for direction
            const normalizedVelocity = this.cameraVelocity.clone().normalize();
            
            // Get camera basis vectors
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            
            // Project velocity onto screen space
            const rightComponent = normalizedVelocity.dot(right);
            const upComponent = normalizedVelocity.dot(up);
            
            // Scale by speed and deltaTime for smooth motion blur
            const blurAmount = Math.min(speed * 50.0 * deltaTime, 0.5);
            this.material.uniforms['direction'].value.set(rightComponent * blurAmount, upComponent * blurAmount);
            this.material.uniforms['intensity'].value = blurAmount;
        } else {
            // Decay motion blur when not moving
            const currentIntensity = this.material.uniforms['intensity'].value;
            this.material.uniforms['intensity'].value = Math.max(0, currentIntensity - deltaTime * 2.0);
            this.material.uniforms['direction'].value.set(0, 0);
        }
    }

    render(
        renderer: THREE.WebGLRenderer,
        writeBuffer: THREE.WebGLRenderTarget,
        readBuffer: THREE.WebGLRenderTarget,
        deltaTime: number
    ): void {
        this.material.uniforms['tDiffuse'].value = readBuffer.texture;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }
    }

    dispose(): void {
        this.material.dispose();
        this.fsQuad.dispose();
    }
}

