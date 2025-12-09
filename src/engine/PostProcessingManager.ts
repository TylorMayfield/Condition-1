import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { MotionBlurPass } from './postprocessing/MotionBlurPass.js';
import { SSRPass } from './postprocessing/SSRPass.js';

export class PostProcessingManager {
    private composer: EffectComposer;
    private renderPass: RenderPass;
    private fxaaPass: ShaderPass;
    private motionBlurPass: MotionBlurPass;
    private ssrPass: SSRPass;
    private previousCameraMatrix: THREE.Matrix4;
    private previousProjectionMatrix: THREE.Matrix4;

    constructor(
        private renderer: THREE.WebGLRenderer,
        private scene: THREE.Scene,
        private camera: THREE.PerspectiveCamera
    ) {
        // Configure renderer for post-processing
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Create composer
        this.composer = new EffectComposer(renderer);
        
        // Render pass - renders the scene
        this.renderPass = new RenderPass(scene, camera);
        this.composer.addPass(this.renderPass);

        // Screen Space Reflections Pass
        this.ssrPass = new SSRPass(scene, camera, renderer);
        this.composer.addPass(this.ssrPass);

        // Motion Blur Pass
        this.previousCameraMatrix = new THREE.Matrix4();
        this.previousProjectionMatrix = new THREE.Matrix4();
        this.motionBlurPass = new MotionBlurPass(renderer);
        this.composer.addPass(this.motionBlurPass);

        // FXAA Pass - Anti-aliasing (must be last)
        this.fxaaPass = new ShaderPass(FXAAShader);
        const pixelRatio = renderer.getPixelRatio();
        this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
        this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
        this.fxaaPass.renderToScreen = true; // Final pass renders to screen
        this.composer.addPass(this.fxaaPass);

        // Store initial camera matrices
        this.previousCameraMatrix.copy(camera.matrixWorldInverse);
        this.previousProjectionMatrix.copy(camera.projectionMatrix);
    }

    public render(deltaTime: number): void {
        // Update motion blur with camera movement
        this.motionBlurPass.update(
            this.camera,
            this.previousCameraMatrix,
            this.previousProjectionMatrix,
            deltaTime
        );

        // Store current matrices for next frame
        this.previousCameraMatrix.copy(this.camera.matrixWorldInverse);
        this.previousProjectionMatrix.copy(this.camera.projectionMatrix);

        // Render with post-processing
        this.composer.render(deltaTime);
    }

    public setSize(width: number, height: number): void {
        this.composer.setSize(width, height);
        
        // Update FXAA resolution
        const pixelRatio = this.renderer.getPixelRatio();
        this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
        this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }

    public dispose(): void {
        this.composer.dispose();
    }
}

