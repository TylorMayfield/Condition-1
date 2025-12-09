import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Time } from './Time';
import { Input } from './Input';
import { GameObject } from './GameObject';
import { SoundManager } from './SoundManager';
import { Player } from '../game/Player'; // Import Player type
import { RoundManager } from '../game/RoundManager';
import { WeatherManager } from '../game/WeatherManager';
import { WeatherEffects } from '../game/WeatherEffects';
import { BallisticsManager } from '../game/BallisticsManager';
import { ExtractionZone } from '../game/ExtractionZone';
import { HUDManager } from '../game/HUDManager';
import { SquadManager } from '../game/SquadManager';
import { SkyboxManager } from '../game/SkyboxManager';
import { PostProcessingManager } from './PostProcessingManager';
import { BoidSystem } from '../game/BoidSystem';

import { SettingsManager } from '../game/SettingsManager';

export class Game {
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public world: CANNON.World;
    public time: Time;
    public isRunning: boolean = false;

    public input: Input;
    public settingsManager: SettingsManager;
    public soundManager: SoundManager;
    private gameObjects: GameObject[] = [];
    public player!: Player; // Public reference for AI
    public isPaused: boolean = false;
    public roundManager: RoundManager;
    public weatherManager: WeatherManager;
    public weatherEffects: WeatherEffects;
    public ballisticsManager: BallisticsManager;
    public extractionZone!: ExtractionZone;
    public hudManager: HUDManager;
    public squadManager: SquadManager;
    public skyboxManager: SkyboxManager;
    public postProcessingManager?: PostProcessingManager;
    public boidSystem?: BoidSystem;

    constructor() {
        // Init Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: false, // We'll use FXAA instead
            powerPreference: "high-performance",
            logarithmicDepthBuffer: true // Better depth precision for large scenes
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Performance optimizations
        this.renderer.sortObjects = true; // Enable object sorting for better culling

        // Post-processing / Tone Mapping
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        document.body.appendChild(this.renderer.domElement);

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
        // Zero friction default (PlayerController handles movement)
        this.world.defaultContactMaterial.friction = 0;
        this.world.defaultContactMaterial.restitution = 0;

        // Init Time & Input
        this.time = new Time();
        this.settingsManager = new SettingsManager();
        this.input = new Input(this.settingsManager);
        this.soundManager = new SoundManager();
        this.roundManager = new RoundManager(this);
        this.weatherManager = new WeatherManager(this);
        this.weatherEffects = new WeatherEffects(this);
        this.ballisticsManager = new BallisticsManager(this);

        // Spawn Extraction Zone (Fixed pos for test, or random)
        this.extractionZone = new ExtractionZone(this, new THREE.Vector3(40, 0, 40));

        this.hudManager = new HUDManager(this);
        this.squadManager = new SquadManager(this);
        this.squadManager.init();

        this.skyboxManager = new SkyboxManager(this);

        // Initialize Ambient Birds
        this.boidSystem = new BoidSystem(this, new THREE.Vector3(0, 20, 0), 60);

        // Initialize Post-Processing
        this.postProcessingManager = new PostProcessingManager(
            this.renderer,
            this.scene,
            this.camera
        );

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
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;

        // Shadow camera bounds
        const d = 20;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 100;

        // Shadow bias to prevent shadow acne
        dirLight.shadow.bias = -0.0001;
        dirLight.shadow.normalBias = 0.02;

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

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.input.lockCursor(); // Start locked
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

        // Cooldown/Input consumption handled by Input system usually, 
        // or the caller (MenuSystem) handles the toggle logic.
    }

    private loop() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.loop());



        if (this.isPaused) {
            this.render();
            // Even if paused, we need to update input to prevent sticky keys if we toggle back? 
            // Actually if we return here, `input.update()` at bottom won't run.
            // We should probably run input.update() even if paused, or just not return early?
            this.input.update();
            return;
        }

        this.time.update();
        this.update(this.time.deltaTime);
        this.render();

        // Reset mouse delta after frame
        this.input.mouseDelta.x = 0;
        this.input.mouseDelta.y = 0;

        // Update Input state (must be last)
        this.input.update();
    }

    private update(dt: number) {
        // Step physics
        this.world.step(1 / 60, dt, 3);

        // Update entities
        this.gameObjects.forEach(go => go.update(dt));

        // Update Round Manager
        this.roundManager?.update(dt);

        // Update Weather
        this.weatherManager?.update(dt);
        this.weatherEffects?.update(dt);

        // Update Birds
        this.boidSystem?.update(dt);

        // Update Ballistics
        this.ballisticsManager?.update(dt);

        // Update Extraction
        this.extractionZone?.update(dt);

        // Update HUD
        this.hudManager?.update(dt);

        // Squad Orders Input (Temp)
        // Squad Orders Input (Temp)
        if (this.input.getKeyDown('Digit1')) this.squadManager.issueOrder(0); // Follow
        if (this.input.getKeyDown('Digit2')) this.squadManager.issueOrder(1); // Hold
        if (this.input.getKeyDown('Digit3')) this.squadManager.issueOrder(2); // Attack

        this.skyboxManager?.update(dt);
    }

    private render() {
        if (this.postProcessingManager) {
            this.postProcessingManager.render(this.time.deltaTime);
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    public onEnemyDeath() {
        this.roundManager?.onEnemyDeath();
    }
}
