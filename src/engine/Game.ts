import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Time } from './Time';
import { Input } from './Input';
import { GameObject } from './GameObject';
import { SoundManager } from './SoundManager';
import { Player } from '../game/Player'; // Import Player type
import { GameMode } from '../game/gamemodes/GameMode';
import { TeamDeathmatchGameMode } from '../game/gamemodes/TeamDeathmatchGameMode';
import { WeatherManager } from '../game/WeatherManager';
import { WeatherEffects } from '../game/WeatherEffects';
import { BallisticsManager } from '../game/BallisticsManager';

import { HUDManager } from '../game/HUDManager';
import { SquadManager } from '../game/SquadManager';
import { SkyboxManager } from '../game/SkyboxManager';
import { PostProcessingManager } from './PostProcessingManager';
import { Profiler } from './Profiler';


import { RecastNavigation } from '../game/ai/RecastNavigation';
import { LevelEditor } from '../game/editor/LevelEditor';
import { SettingsManager } from '../game/SettingsManager';

export class Game {
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public sceneHUD: THREE.Scene; // Overlay scene for weapon
    public cameraHUD: THREE.PerspectiveCamera; // Overlay camera
    public world: CANNON.World;
    public time: Time;
    public isRunning: boolean = false;

    public input: Input;
    public settingsManager: SettingsManager;
    public soundManager: SoundManager;
    private gameObjects: GameObject[] = [];
    private tickCallbacks: ((dt: number) => void)[] = [];
    public player!: Player; // Public reference for AI
    public isPaused: boolean = false;

    // Optimization / Time control
    public timeScale: number = 1.0;
    public renderingEnabled: boolean = true;

    public gameMode: GameMode;
    public weatherManager: WeatherManager;
    public weatherEffects: WeatherEffects;
    public ballisticsManager: BallisticsManager;

    public hudManager: HUDManager;
    public squadManager: SquadManager;
    public skyboxManager: SkyboxManager;
    public postProcessingManager?: PostProcessingManager;
    public profiler: Profiler;
    public availableSpawns: { T: THREE.Vector3[], CT: THREE.Vector3[] } = { T: [], CT: [] };

    public recastNav: RecastNavigation;
    public levelEditor: LevelEditor;
    // @ts-ignore
    public levelGenerator: any; // Type as any to avoid circular import with LevelGenerator

    constructor() {
        // Init Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: false, // We'll use FXAA instead
            powerPreference: "high-performance",
            logarithmicDepthBuffer: true // Better depth precision for large scenes
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Optimization: Force 1x pixel ratio to prevent retina lag. (High DPI = 4x GPU load)
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap; // Optimized
        this.renderer.info.autoReset = false; // We will manually reset to aggregate stats across passes

        // Performance optimizations
        this.renderer.sortObjects = true; // Enable object sorting for better culling

        // Post-processing / Tone Mapping
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        document.body.appendChild(this.renderer.domElement);

        // Expose for HUD buttons
        (window as any).game = this;

        // Init Scene
        this.scene = new THREE.Scene();

        // Init Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 4000);
        this.camera.position.set(0, 2, 5);
        this.scene.add(this.camera);

        // Env Lighting
        this.setupLighting();

        // Init Physics
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);

        // PERFORMANCE: Use SAPBroadphase instead of NaiveBroadphase (O(n log n) vs O(n²))
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);

        // PERFORMANCE: Reduce solver iterations (default 10)
        (this.world.solver as CANNON.GSSolver).iterations = 5;

        // PERFORMANCE: Allow sleeping bodies (static bodies won't be checked every frame)
        this.world.allowSleep = true;

        // Zero friction default (PlayerController handles movement)
        this.world.defaultContactMaterial.friction = 0;
        this.world.defaultContactMaterial.restitution = 0;

        // Init Time & Input
        this.time = new Time();
        this.settingsManager = new SettingsManager();
        this.input = new Input(this.settingsManager);
        this.soundManager = new SoundManager();
        this.soundManager.init(this.camera); // Initialize 3D positional audio

        // Init Game Mode (Default to TDM)
        this.gameMode = new TeamDeathmatchGameMode(this);

        this.weatherManager = new WeatherManager(this);
        this.weatherEffects = new WeatherEffects(this);
        this.ballisticsManager = new BallisticsManager(this);



        this.hudManager = new HUDManager(this);
        this.squadManager = new SquadManager(this);
        this.squadManager.init();

        this.skyboxManager = new SkyboxManager(this);



        // Initialize Post-Processing
        this.postProcessingManager = new PostProcessingManager(
            this.renderer,
            this.scene,
            this.camera
        );


        this.recastNav = new RecastNavigation(this);
        this.profiler = new Profiler();

        // Init HUD Scene for Weapon Overlay
        this.sceneHUD = new THREE.Scene();
        this.cameraHUD = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        this.cameraHUD.position.set(0, 0, 0); // HUD camera stays at origin
        // Light for gun
        const gunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        gunLight.position.set(-1, 2, 3);
        this.sceneHUD.add(gunLight);
        this.sceneHUD.add(new THREE.AmbientLight(0xffffff, 0.3));

        // Initialize Level Editor
        this.levelEditor = new LevelEditor(this);

        // Resize Listener
        window.addEventListener('resize', () => this.onResize());
    }

    private setupLighting() {
        // Sky Color (Hemisphere) - provides ambient lighting from sky and ground
        // Increased intensity for better visibility
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        // Sun (Directional) - main light source
        // Increased intensity
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(-3, 10, -10);
        dirLight.castShadow = true;

        // Shadow configuration - High Res
        dirLight.shadow.mapSize.width = 1024; // Optimization: Reduced from 2048
        dirLight.shadow.mapSize.height = 1024;

        // Shadow camera bounds
        const d = 20;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 100;

        // Shadow bias to prevent shadow acne (Spackly walls)
        dirLight.shadow.bias = -0.0005; // Was -0.0001
        dirLight.shadow.normalBias = 0.05; // Was 0.02

        this.scene.add(dirLight);

        // Store reference for SkyboxManager
        (this as any).mainDirectionalLight = dirLight;

        // Basic Scene Background
        this.scene.background = new THREE.Color(0x87CEEB); // Sky Blue
        // Fog for depth (slight)
        // 0.02 scale means 50 units ~ 80 feet. 
        // Let's extend it: Start at 20 (30ft), End at 150 (200ft+).
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 150);
    }

    private onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.cameraHUD.aspect = window.innerWidth / window.innerHeight;
        this.cameraHUD.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.postProcessingManager?.setSize(window.innerWidth, window.innerHeight);
    }

    public addGameObject(go: GameObject) {
        this.gameObjects.push(go);
        // Only add if they are not null
        if (go.mesh) this.scene.add(go.mesh);
        // Cast body to any to avoid type mismatch if cannon types differ slightly in resolution
        if (go.body) this.world.addBody(go.body);
    }

    public removeGameObject(go: GameObject) {
        const index = this.gameObjects.indexOf(go);
        if (index > -1) {
            this.gameObjects.splice(index, 1);
        }
    }



    public getGameObjects(): ReadonlyArray<GameObject> {
        return this.gameObjects;
    }

    public addTickCallback(callback: (dt: number) => void) {
        this.tickCallbacks.push(callback);
    }

    public removeTickCallback(callback: (dt: number) => void) {
        const index = this.tickCallbacks.indexOf(callback);
        if (index > -1) {
            this.tickCallbacks.splice(index, 1);
        }
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.input.lockCursor(); // Start locked

        // Resume audio context (browser autoplay policy)
        this.soundManager.resume();

        // Start Game Mode
        this.gameMode.init();

        // Build Navigation Graph is now handled by LevelGenerator.loadMap()

        this.loop();
    }

    public togglePause() {
        // Toggle state
        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            this.input.unlockCursor();
        } else {
            this.input.lockCursor();
        }
    }

    public setMenuMode(enabled: boolean) {
        if (enabled) {
            // Optimize for Menu: Disable heavy effects
            if (this.postProcessingManager) {
                this.postProcessingManager.setQuality('low');
            }
            this.renderer.shadowMap.enabled = false; // Disable shadows
        } else {
            // Restore Game Mode
            // Do NOT force High Quality (Motion Blur/SSR) as it might be disliked
            // Just re-enable shadows
            this.renderer.shadowMap.enabled = true;

            // Optionally, restore 'high' ONLY if it was previously set? 
            // For now, let's keep PostFX at 'low' (Basic AA only) to be safe, 
            // OR let SettingsManager handle it.
            // Let's set it to 'low' to disable the "Huge Motion Blur" complained about.
            if (this.postProcessingManager) {
                this.postProcessingManager.setQuality('low');
            }
        }
        // Force material update for shadows if needed
        this.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.needsUpdate = true);
                    } else {
                        obj.material.needsUpdate = true;
                    }
                }
            }
        });
    }

    private loop() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.loop());



        // Toggle Editor with F1
        if (this.input.getKeyDown('F1')) {
            this.levelEditor.toggle();
        }

        if (this.levelEditor.isActive()) {
            this.levelEditor.update(this.time.deltaTime);
            this.levelEditor.render(); // Delegate rendering to editor manager
            this.input.update(); // Still need input
            return; // Skip game update/render
        }

        if (this.isPaused) {
            this.render();
            // Even if paused, we need to update input to prevent sticky keys if we toggle back? 
            // Actually if we return here, `input.update()` at bottom won't run.
            // We should probably run input.update() even if paused, or just not return early?
            this.input.update();
            return;
        }

        this.time.update();

        // Time Accumulator for stable physics time scaling
        // Cap real frame time to avoid spiral of death (max 0.1s real time catchup)
        const realDt = Math.min(this.time.deltaTime, 0.1);

        // Add scaled time to accumulator
        this.timeAccumulator += realDt * this.timeScale;

        // Run simulation steps
        const fixedStep = 1 / 60;
        const maxSteps = 2; // Prevent death spiral - game slows instead of framerate crash
        let steps = 0;

        const t0 = performance.now();
        this.renderer.info.reset(); // Reset stats at start of frame
        this.profiler.start('Full Frame');

        // Physics / Game Logic Loop
        this.profiler.start('Update Loop');
        while (this.timeAccumulator >= fixedStep && steps < maxSteps) {
            this.update(fixedStep);
            this.timeAccumulator -= fixedStep;
            steps++;
        }
        this.profiler.end('Update Loop');

        const t1 = performance.now();

        // Update Camera Look (Variable Step) for smoothness
        if (this.player && !this.levelEditor.isActive() && !this.isPaused) {
            this.player.updateLook(realDt);
        }

        // Debug: Step timing removed for performance

        // If we fell too far behind (e.g. at 100x speed on slow PC), discard remainder
        if (this.timeAccumulator > fixedStep * 5) {
            this.timeAccumulator = 0;
        }

        // Render if enabled
        if (this.renderingEnabled) {
            this.render();
        }

        // Reset mouse delta after frame
        this.input.mouseDelta.x = 0;
        this.input.mouseDelta.y = 0;

        // Update Input state (must be last)
        this.input.update();

        this.profiler.end('Full Frame');
        this.profiler.update(this.renderer);
    }

    private timeAccumulator: number = 0;

    private update(dt: number) {
        // Step physics
        this.profiler.start('Physics');
        this.world.step(1 / 60, dt, 3);
        this.profiler.end('Physics');

        // Update entities
        this.profiler.start('Entities');
        this.gameObjects.forEach(go => go.update(dt));
        this.profiler.end('Entities');

        // Update Game Mode
        this.profiler.start('GameMode');
        this.gameMode?.update(dt);
        this.profiler.end('GameMode');

        // Update Weather
        this.profiler.start('Weather');
        this.weatherManager?.update(dt);
        this.weatherEffects?.update(dt);
        this.profiler.end('Weather');



        // Update Ballistics
        this.profiler.start('Ballistics');
        this.ballisticsManager?.update(dt);
        this.profiler.end('Ballistics');



        // Update HUD
        this.profiler.start('HUD');
        this.hudManager?.update(dt);
        this.profiler.end('HUD');

        this.profiler.start('Skybox');
        this.skyboxManager?.update(dt);
        this.profiler.end('Skybox');

        // Update Recast Navigation crowd simulation
        this.profiler.start('AI/Nav');
        this.recastNav?.update(dt);
        this.profiler.end('AI/Nav');

        // Update Callbacks
        this.profiler.start('TickCallbacks');
        for (let i = this.tickCallbacks.length - 1; i >= 0; i--) {
            this.tickCallbacks[i](dt);
        }
        this.profiler.end('TickCallbacks');

    }

    private render() {
        this.profiler.start('Render');
        // 1. Render Main Scene
        this.renderer.autoClear = true; // Clear everything for first pass
        if (this.postProcessingManager) {
            this.postProcessingManager.render(this.time.deltaTime);
        } else {
            this.renderer.render(this.scene, this.camera);
        }

        // 2. Render Weapon Overlay (HUD Scene)
        this.renderer.autoClear = false; // Don't clear color, just depth
        this.renderer.clearDepth();
        this.renderer.render(this.sceneHUD, this.cameraHUD);

        // 3. Render HUD UI (FPS, etc.)
        this.hudManager?.render(this.time.deltaTime);

        this.renderer.autoClear = true; // Reset
        this.profiler.end('Render');
    }

    public onEnemyDeath(victim: GameObject, killer?: GameObject) {
        this.gameMode?.onEntityDeath(victim, killer);
    }
}
