import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export class SSRPass extends Pass {
    private fsQuad: FullScreenQuad;
    private material: THREE.ShaderMaterial;

    constructor(
        private scene: THREE.Scene,
        private camera: THREE.Camera,
        private renderer: THREE.WebGLRenderer
    ) {
        super();

        // Screen Space Reflections shader
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                cameraProjectionMatrix: { value: camera.projectionMatrix },
                cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse.clone() },
                intensity: { value: 0.3 },
                maxDistance: { value: 5.0 },
                stepSize: { value: 0.1 }
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
                uniform vec2 resolution;
                uniform mat4 cameraProjectionMatrix;
                uniform mat4 cameraProjectionMatrixInverse;
                uniform float intensity;
                uniform float maxDistance;
                uniform float stepSize;
                varying vec2 vUv;

                // Simplified screen-space reflections
                // This is a basic implementation that samples the color buffer
                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    
                    // Calculate reflection direction based on screen position
                    // This is a simplified approximation
                    vec2 screenPos = vUv * 2.0 - 1.0;
                    vec2 reflectDir = normalize(screenPos);
                    
                    // Sample along reflection direction
                    vec3 reflectionColor = vec3(0.0);
                    float reflectionWeight = 0.0;
                    int maxSteps = int(maxDistance / stepSize);
                    
                    for (int i = 1; i <= maxSteps; i++) {
                        vec2 sampleUV = vUv + reflectDir * float(i) * stepSize / resolution;
                        
                        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
                            break;
                        }
                        
                        vec3 sampleColor = texture2D(tDiffuse, sampleUV).rgb;
                        float weight = 1.0 / (1.0 + float(i) * 0.1);
                        reflectionColor += sampleColor * weight;
                        reflectionWeight += weight;
                    }
                    
                    if (reflectionWeight > 0.0) {
                        reflectionColor /= reflectionWeight;
                        // Only apply reflections to darker areas (surfaces)
                        float surfaceFactor = 1.0 - dot(color.rgb, vec3(0.299, 0.587, 0.114));
                        reflectionColor = mix(color.rgb, reflectionColor, surfaceFactor * intensity);
                    } else {
                        reflectionColor = color.rgb;
                    }
                    
                    gl_FragColor = vec4(reflectionColor, color.a);
                }
            `
        });

        this.fsQuad = new FullScreenQuad(this.material);
    }

    render(
        renderer: THREE.WebGLRenderer,
        writeBuffer: THREE.WebGLRenderTarget,
        readBuffer: THREE.WebGLRenderTarget,
        deltaTime: number
    ): void {
        this.material.uniforms['tDiffuse'].value = readBuffer.texture;
        this.material.uniforms['cameraProjectionMatrix'].value = this.camera.projectionMatrix;
        this.material.uniforms['cameraProjectionMatrixInverse'].value = this.camera.projectionMatrixInverse.clone();
        this.material.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);

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

