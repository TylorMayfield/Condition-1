import { Game } from '../../engine/Game';
import { SettingsManager } from '../SettingsManager';
import { TeamDeathmatchGameMode } from '../gamemodes/TeamDeathmatchGameMode';
import { FreeForAllGameMode } from '../gamemodes/FreeForAllGameMode';
import { RLTrainingGameMode } from '../gamemodes/RLTrainingGameMode';
// @ts-ignore
import menuHtml from './main_menu.html?raw';
// @ts-ignore
import css from './menu_styles.css?inline';

export class MenuSystem {
    private game: Game;
    private settingsManager: SettingsManager;
    private container: HTMLElement;
    private overlay: HTMLElement | null = null;

    // State
    private isVisible: boolean = false;
    private isGameStarted: boolean = false;
    private preloadedModelFile: File | null = null;

    private availableMaps = [
        'killhouse',
        'de_dust2_d',
        'de_train_d',
        'de_chateau_d',
        'cs_office_d',
        'window_test'
    ];

    constructor(game: Game, settingsManager: SettingsManager) {
        this.game = game;
        this.settingsManager = settingsManager;

        // Create container
        this.container = document.createElement('div');
        this.container.innerHTML = menuHtml;

        // Inject styles
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        document.body.appendChild(this.container);
        this.overlay = document.getElementById('menu-overlay');

        this.initEvents();
        this.initSettingsUI();
        this.initMapList();

        // Start visible
        this.show();
    }

    private initEvents() {
        // Navigation Buttons
        this.bindBtn('btn-resume', () => this.hide());
        this.bindBtn('btn-new-game', () => this.showPanel('panel-maps'));
        this.bindBtn('btn-settings', () => this.showPanel('panel-settings'));
        this.bindBtn('btn-credits', () => this.showPanel('panel-credits'));
        this.bindBtn('btn-quit', () => window.close());

        // Settings Tabs
        (window as any).showSettingsTab = (tabName: string) => {
            document.querySelectorAll('.settings-tab').forEach(el => (el as HTMLElement).style.display = 'none');
            document.getElementById(`settings-${tabName}`)!.style.display = 'block';
        }

        document.getElementById('btn-save-settings')?.addEventListener('click', () => {
            // Video
            const fov = parseFloat((document.getElementById('setting-fov') as HTMLInputElement).value);
            const sens = parseFloat((document.getElementById('setting-sens') as HTMLInputElement).value);
            this.settingsManager.setVideo('fov', fov);
            this.settingsManager.setVideo('sensitivity', sens);

            // Apply to game
            this.game.camera.fov = fov;
            this.game.camera.updateProjectionMatrix();
            if (this.game.player) {
                this.game.player.setSensitivity(sens);
            }

            alert('Settings Saved');
        });

        // Input Listeners
        document.getElementById('setting-fov')?.addEventListener('input', (e) => {
            document.getElementById('value-fov')!.textContent = (e.target as HTMLInputElement).value;
        });
        document.getElementById('setting-sens')?.addEventListener('input', (e) => {
            document.getElementById('value-sens')!.textContent = (e.target as HTMLInputElement).value;
        });

        // Game Mode Toggle - Show/hide RL training options
        const modeSelect = document.getElementById('gamemode-select') as HTMLSelectElement;
        modeSelect?.addEventListener('change', () => {
            this.updateModeOptions(modeSelect.value);
        });

        // RL Training - Load Model button
        const loadModelBtn = document.getElementById('rl-load-model-btn');
        const modelFileInput = document.getElementById('rl-model-file-input') as HTMLInputElement;

        loadModelBtn?.addEventListener('click', () => {
            modelFileInput?.click();
        });

        modelFileInput?.addEventListener('change', () => {
            if (modelFileInput.files && modelFileInput.files[0]) {
                this.preloadedModelFile = modelFileInput.files[0];
                const statusEl = document.getElementById('rl-model-status');
                if (statusEl) {
                    statusEl.textContent = `✅ Model loaded: ${this.preloadedModelFile.name}`;
                    statusEl.style.color = '#4ade80';
                }
            }
        });
    }

    private updateModeOptions(mode: string) {
        const spectatorOptions = document.getElementById('spectator-options');
        const rlTrainingOptions = document.getElementById('rl-training-options');

        if (mode === 'rl-training') {
            // Hide spectator, show RL training options
            if (spectatorOptions) spectatorOptions.style.display = 'none';
            if (rlTrainingOptions) rlTrainingOptions.style.display = 'block';
        } else {
            // Show spectator, hide RL training options
            if (spectatorOptions) spectatorOptions.style.display = 'flex';
            if (rlTrainingOptions) rlTrainingOptions.style.display = 'none';
        }
    }

    private bindBtn(id: string, callback: () => void) {
        document.getElementById(id)?.addEventListener('click', callback);
    }

    private showPanel(id: string) {
        document.querySelectorAll('.menu-panel').forEach(el => el.classList.remove('visible'));
        document.getElementById(id)?.classList.add('visible');
    }

    public show() {
        if (this.overlay) {
            this.overlay.style.display = 'block';
            this.isVisible = true;
            this.game.isPaused = true;
            this.game.input.unlockCursor();

            // Update Resume button visibility
            const resumeBtn = document.getElementById('btn-resume');
            if (resumeBtn) resumeBtn.style.display = this.isGameStarted ? 'block' : 'none';
        }
    }

    public hide() {
        if (this.overlay) {
            this.overlay.style.display = 'none';
            this.isVisible = false;
            this.game.isPaused = false;
            this.game.input.lockCursor();
            this.isGameStarted = true;
        }
    }

    public toggle() {
        if (this.isVisible) this.hide();
        else this.show();
    }

    private initSettingsUI() {
        const s = this.settingsManager.getSettings();

        // Init Inputs
        (document.getElementById('setting-fov') as HTMLInputElement).value = s.video.fov.toString();
        document.getElementById('value-fov')!.textContent = s.video.fov.toString();

        (document.getElementById('setting-sens') as HTMLInputElement).value = s.video.sensitivity.toString();
        document.getElementById('value-sens')!.textContent = s.video.sensitivity.toString();

        // Keybindings
        const list = document.getElementById('keybind-list');
        if (list) {
            list.innerHTML = '';
            for (const [action, code] of Object.entries(s.controls)) {
                const row = document.createElement('div');
                row.className = 'keybind-row';
                row.innerHTML = `
                    <span>${action}</span>
                    <button class="keybind-btn" data-action="${action}">${code}</button>
                `;
                list.appendChild(row);

                // Binding Logic
                const btn = row.querySelector('button');
                btn?.addEventListener('click', () => {
                    btn.textContent = 'Press Key...';
                    btn.classList.add('listening');

                    const listenHandler = (e: KeyboardEvent) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const newCode = e.code;
                        this.settingsManager.setControl(action, newCode);
                        btn.textContent = newCode;
                        btn.classList.remove('listening');

                        window.removeEventListener('keydown', listenHandler);
                    };

                    window.addEventListener('keydown', listenHandler, { once: true });
                });
            }
        }
    }

    private initMapList() {
        const grid = document.getElementById('map-grid-container');
        if (!grid) return;

        grid.innerHTML = '';
        this.availableMaps.forEach(map => {
            const card = document.createElement('div');
            card.className = 'map-card';
            card.innerHTML = `
                <div class="map-preview">
                    <span>${map}</span>
                </div>
                <div class="map-info">
                    <div class="map-name">${this.formatMapName(map)}</div>
                </div>
            `;

            card.onclick = (e) => {
                e.stopPropagation(); // Prevent bubbling issues
                console.log(`Map Clicked: ${map}`);
                this.loadMap(map);
            };

            grid.appendChild(card);
        });

        // Add Map Builder Card
        const mbCard = document.createElement('div');
        mbCard.className = 'map-card';
        mbCard.style.border = '1px dashed #4ade80';
        mbCard.innerHTML = `
            <div class="map-preview" style="background: rgba(74, 222, 128, 0.1); color: #4ade80;">
                <span style="font-size: 24px;">🛠️</span>
            </div>
            <div class="map-info">
                <div class="map-name" style="color: #4ade80;">Map Builder</div>
            </div>
        `;
        mbCard.addEventListener('click', () => {
            import('../maps/MapBuilder').then(({ MapBuilder }) => {
                import('../maps/MapBuilderUI').then(({ MapBuilderUI }) => {
                    const mb = new MapBuilder(30, 30);
                    const mbui = new MapBuilderUI(mb);
                    this.hide();
                    mbui.show();
                });
            });
        });
        grid.appendChild(mbCard);
    }

    private formatMapName(name: string) {
        return name.replace(/_/g, ' ').toUpperCase();
    }

    private async loadMap(mapName: string) {
        console.log(`Loading map: ${mapName}`);

        if ((this.game as any).levelGenerator) {
            // Determine Game Mode
            const modeSelect = document.getElementById('gamemode-select') as HTMLSelectElement;
            const modeValue = modeSelect ? modeSelect.value : 'tdm';

            console.log(`Selected Game Mode: ${modeValue}`);

            // Switch Game Mode
            if (modeValue === 'rl-training') {
                // RL Training Mode
                const botsPerTeam = parseInt((document.getElementById('rl-bots-per-team') as HTMLInputElement)?.value || '3');
                const roundDuration = parseInt((document.getElementById('rl-round-duration') as HTMLInputElement)?.value || '30');

                const rlMode = new RLTrainingGameMode(this.game, {
                    botsPerTeam,
                    roundDurationSeconds: roundDuration
                });

                this.game.gameMode = rlMode;

                // Load pre-selected model if any
                if (this.preloadedModelFile) {
                    rlMode.loadModelFromFile(this.preloadedModelFile).then(success => {
                        if (success) {
                            console.log('[Menu] Pre-loaded model applied to training mode');
                        }
                    });
                }
            } else if (modeValue === 'ffa') {
                this.game.gameMode = new FreeForAllGameMode(this.game);
            } else {
                // Default to TDM
                this.game.gameMode = new TeamDeathmatchGameMode(this.game);

                // Check Spectator Option
                const spectateCheckbox = document.getElementById('checkbox-spectator') as HTMLInputElement;
                if (spectateCheckbox && spectateCheckbox.checked) {
                    (this.game.gameMode as TeamDeathmatchGameMode).isSpectatorOnly = true;
                }
            }

            // Show loading
            this.showLoading();

            const lg = (this.game as any).levelGenerator;
            await lg.loadMap(mapName);

            // Initialize the new game mode (reset rounds, spawn logic, etc)
            this.game.gameMode.init();

            // Show Ready State (Click to Start)
            this.showReadyToStart();
        } else {
            console.error("LevelGenerator not found on game instance");
        }
    }

    private showLoading() {
        const loadingScreen = document.createElement('div');
        loadingScreen.id = 'loading-screen';
        Object.assign(loadingScreen.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontSize: '32px',
            zIndex: '2000'
        });
        loadingScreen.textContent = 'LOADING...';
        this.container.appendChild(loadingScreen);
    }

    private showReadyToStart() {
        // Find or create loading screen
        let loadingScreen = document.getElementById('loading-screen');
        if (!loadingScreen) {
            this.showLoading();
            loadingScreen = document.getElementById('loading-screen')!;
        }

        loadingScreen.innerHTML = '';

        const btn = document.createElement('button');
        btn.textContent = 'CLICK TO DEPLOY';
        Object.assign(btn.style, {
            padding: '20px 40px',
            fontSize: '24px',
            background: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            boxShadow: '0 0 20px rgba(34, 197, 94, 0.5)'
        });

        btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.05)');
        btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
        btn.style.transition = 'transform 0.2s';

        btn.addEventListener('click', () => {
            // Remove loading screen
            loadingScreen?.remove();

            // Hide Menu and Lock Cursor
            // Must be called directly in click handler for pointer lock to work
            this.hide();
        });

        loadingScreen.appendChild(btn);
    }

    // Set level generator reference
    public setLevelGenerator(lg: any) {
        (this.game as any).levelGenerator = lg;
    }
}
