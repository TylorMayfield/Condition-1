import * as THREE from 'three';


/**
 * Manages the Three.js scene for the editor.
 * Handles Grid, Helpers, and basic scene setup.
 */
export class EditorScene {
    private scene: THREE.Scene;
    private gridHelper: THREE.GridHelper;
    private axesHelper: THREE.AxesHelper;
    private light?: THREE.DirectionalLight;
    private ambientLight?: THREE.AmbientLight;

    constructor() {
        this.scene = new THREE.Scene();

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
        // Note: Lights in a separate scene won't affect the main scene unless we compose them?
        // Actually, for Editor View, we often WANT these lights to light up the main scene content.
        // But if they are in 'this.scene' (local), they only light objects in 'this.scene'.
        // The objects (Brushes) are in Game.Scene.
        // So we should KEEP Lights in the Game Scene, OR duplicate them?
        // Or LevelEditor renders Main Scene, then Editor Scene.
        // If Main Scene has no lights, Brushes are black.
        // So EditorScene should probably manage lights injections into Game Scene, or LevelEditor does it.
        // Let's Keep lights management separate or keep them in Game Scene?
        // If we want to solve the CRASH, the crash is caused by Geometry (GridHelper).
        // Lights are fine.
        // So let's put Grids in Local Scene, but Lights in Game Scene?
        // Or just put Lights in Local Scene and assume level has lights?
        // Usually Editor needs its own "Fullbright" light.
        // Let's attach lights to Game Scene for now, but Grid to Local.
    }
    
    // We need access to Game Scene for lights
    public attachLights(gameScene: THREE.Scene) {
         this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
         this.ambientLight.visible = false;
         gameScene.add(this.ambientLight);
         
         this.light = new THREE.DirectionalLight(0xffffff, 0.8);
         this.light.position.set(50, 100, 50);
         this.light.visible = false;
         gameScene.add(this.light);
    }
    
    public getScene(): THREE.Scene {
        return this.scene;
    }

    public enable(): void {
        this.gridHelper.visible = true;
        this.axesHelper.visible = true;
        if (this.ambientLight) this.ambientLight.visible = true;
        if (this.light) this.light.visible = true;
    }

    public disable(): void {
        this.gridHelper.visible = false;
        this.axesHelper.visible = false;
        if (this.ambientLight) this.ambientLight.visible = false;
        if (this.light) this.light.visible = false;
    }

    public getGrid(): THREE.GridHelper {
        return this.gridHelper;
    }
}
