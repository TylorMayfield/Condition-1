import * as THREE from 'three';
import { Game } from '../engine/Game';

/**
 * Manages the Three.js scene for the editor.
 * Handles Grid, Helpers, and basic scene setup.
 */
export class EditorScene {
    private scene: THREE.Scene;
    private gridHelper: THREE.GridHelper;
    private axesHelper: THREE.AxesHelper;
    private light: THREE.DirectionalLight;
    private ambientLight: THREE.AmbientLight;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        // 1. Grid Helper (Classic Hammer/Source style: Grey grid)
        // Size: 2000 units, Divisions: 64 (approx 32 units per cell)
        this.gridHelper = new THREE.GridHelper(2048, 64, 0x555555, 0x333333);
        this.gridHelper.position.y = 0.1; // Slightly above zero to avoid z-fighting if there's a floor
        this.gridHelper.visible = false;
        this.scene.add(this.gridHelper);

        // 2. Axes Helper
        this.axesHelper = new THREE.AxesHelper(50);
        this.axesHelper.visible = false;
        this.scene.add(this.axesHelper);

        // 3. Editor Lighting (Flat, bright enough to see everything)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.ambientLight.visible = false;
        this.scene.add(this.ambientLight);

        this.light = new THREE.DirectionalLight(0xffffff, 0.8);
        this.light.position.set(50, 100, 50);
        this.light.visible = false;
        this.scene.add(this.light);
    }

    public enable(): void {
        this.gridHelper.visible = true;
        this.axesHelper.visible = true;
        this.ambientLight.visible = true;
        this.light.visible = true;

        // Hide game specific stuff? 
        // For now, we assume we might be in an empty world or we clear it.
    }

    public disable(): void {
        this.gridHelper.visible = false;
        this.axesHelper.visible = false;
        this.ambientLight.visible = false;
        this.light.visible = false;
    }

    public getGrid(): THREE.GridHelper {
        return this.gridHelper;
    }
}
