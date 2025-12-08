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

export class Game {
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public world: CANNON.World;
    public time: Time;
    public isRunning: boolean = false;

    public input: Input;
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

    constructor() {
        // Init Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Init Scene
        this.scene = new THREE.Scene();

        // Init Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 2, 5);
        this.scene.add(this.camera);

        // Env Lighting
        this.setupLighting();

        // Init Physics
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);

        // Init Time & Input
        this.time = new Time();
        this.input = new Input();
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

        // Resize Listener
        window.addEventListener('resize', () => this.onResize());
    }

    private setupLighting() {
        // Sky Color (Hemisphere)
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        // Sun (Directional)
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(-3, 10, -10);
        dirLight.castShadow = true;

        // Shadow High Res
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        const d = 20;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;

        this.scene.add(dirLight);

        // Basic Scene Background
        this.scene.background = new THREE.Color(0x87CEEB); // Sky Blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 0, 50);
    }

    private onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
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
        if (!this.input.getKey('Enter')) return; // Check actual key state if called from input? No, called from loop or UI.

        // Use a simple cooldown or verify logic.
        // Actually, better implementation: 
        // We'll handle the key check closer to "Just Pressed" in loop.

        this.isPaused = !this.isPaused;

        const menu = document.getElementById('pause-menu');

        if (this.isPaused) {
            this.input.unlockCursor();
            if (menu) menu.style.display = 'flex';
        } else {
            this.input.lockCursor();
            if (menu) menu.style.display = 'none';
        }

        // Cooldown hack
        (this.input as any).keys.set('Enter', false); // Force consume key
    }

    private loop() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.loop());

        // Input Update to catch keys
        this.input.update();

        // Pause Toggle
        if (this.input.getKey('Enter')) {
            this.togglePause();
        }

        if (this.isPaused) {
            this.render();
            return;
        }

        this.time.update();
        this.update(this.time.deltaTime);
        this.render();

        // Reset mouse delta after frame
        this.input.mouseDelta.x = 0;
        this.input.mouseDelta.y = 0;
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

        // Update Ballistics
        this.ballisticsManager?.update(dt);

        // Update Extraction
        this.extractionZone?.update(dt);

        // Update HUD
        this.hudManager?.update(dt);

        // Squad Orders Input (Temp)
        if (this.input.getKey('Digit1')) this.squadManager.issueOrder(0); // Follow
        if (this.input.keys.get('Digit2') || this.input.getKey('Digit2')) this.squadManager.issueOrder(1); // Hold
        if (this.input.getKey('Digit3')) this.squadManager.issueOrder(2); // Attack

        this.skyboxManager?.update(dt);
    }

    private render() {
        this.renderer.render(this.scene, this.camera);
    }

    public onEnemyDeath() {
        this.roundManager?.onEnemyDeath();
    }
}
