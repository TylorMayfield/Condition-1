import { Game } from '../../engine/Game';
import { SettingsManager } from '../SettingsManager';
import { TeamDeathmatchGameMode } from '../gamemodes/TeamDeathmatchGameMode';
import {
    createGameMode,
    createRLTrainingMode,
} from '../gamemodes/registerBuiltinGameModes';
import { isGameModeId } from '../gamemodes/GameModeRegistry';
import { GameModeId } from '../gamemodes/GameModeId';
import { AVAILABLE_MAPS, PROCEDURAL_MAP_NAMES } from '../../config/maps';
import type { LevelGenerator } from '../LevelGenerator';
import { CampaignService } from '../campaign/CampaignService';
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

    private availableMaps = [...AVAILABLE_MAPS];
    private campaign = new CampaignService();

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
        this.initCampaignUI();

        // Start visible
        this.show();
    }

    private initCampaignUI(): void {
        const profile = this.campaign.load();
        const team = document.getElementById('campaign-team') as HTMLSelectElement;
        const difficulty = document.getElementById('campaign-difficulty') as HTMLSelectElement;
        team.value = profile.selectedTeam; difficulty.value = profile.difficulty;
        this.game.campaignTeam = profile.selectedTeam; this.game.campaignDifficulty = profile.difficulty;
        const save = () => { const next = this.campaign.load(); next.selectedTeam = team.value as typeof next.selectedTeam; next.difficulty = difficulty.value as typeof next.difficulty; this.campaign.save(next); this.game.campaignTeam = next.selectedTeam; this.game.campaignDifficulty = next.difficulty; };
        team.addEventListener('change', save); difficulty.addEventListener('change', save);
        const progress = document.getElementById('campaign-progress'); if (progress) progress.textContent = `${profile.completedMatchIds.length}/4 operations complete`;
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
        
        // Set initial mode state
        if (modeSelect) {
            this.updateModeOptions(modeSelect.value);
        }

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
                    statusEl.textContent = `Model loaded: ${this.preloadedModelFile.name}`;
                    statusEl.style.color = 'var(--c1-glow)';
                }
            }
        });
    }

    private updateModeOptions(mode: string) {
        const spectatorOptions = document.getElementById('spectator-options');
        const rlTrainingOptions = document.getElementById('rl-training-options');
        const mapGrid = document.getElementById('map-grid-container');
        const mapGridParent = mapGrid?.parentElement;
        const campaignOptions = document.getElementById('campaign-options');
        if (campaignOptions) campaignOptions.style.display = mode === GameModeId.DEFUSAL ? 'block' : 'none';

        if (mode === 'rl-training') {
            // Hide spectator, show RL training options
            if (spectatorOptions) spectatorOptions.style.display = 'none';
            if (rlTrainingOptions) rlTrainingOptions.style.display = 'block';
            if (mapGrid) mapGrid.style.display = 'grid';
        } else if (mode === 'moba') {
            // Hide spectator, hide map selection (MOBA uses generated map)
            if (spectatorOptions) spectatorOptions.style.display = 'none';
            if (rlTrainingOptions) rlTrainingOptions.style.display = 'none';
            if (rlTrainingOptions) rlTrainingOptions.style.display = 'none';
            if (mapGrid) mapGrid.style.display = 'none';
        } else if (mode === 'moba') {
            
            // Show MOBA info message with start button
            let mobaInfo = document.getElementById('moba-info');
            if (!mobaInfo && mapGridParent) {
                mobaInfo = document.createElement('div');
                mobaInfo.id = 'moba-info';
                mobaInfo.className = 'mode-card mode-card--moba';
                mobaInfo.innerHTML = `
                    <h3 class="mode-card__title">MOBA Assault</h3>
                    <p class="mode-card__desc">Procedurally generated 3-lane battlefield. Destroy the enemy nexus.</p>
                    <button id="moba-start-btn" class="menu-btn menu-btn--primary">Deploy</button>
                `;
                mapGridParent.insertBefore(mobaInfo, mapGrid);
                
                // Bind start button
                const startBtn = document.getElementById('moba-start-btn');
                startBtn?.addEventListener('click', () => {
                    this.loadMap('moba');
                });
            } else if (mobaInfo) {
                mobaInfo.style.display = 'block';
            }
        } else {
            // Show spectator, hide RL training options, show map selection
            if (spectatorOptions) spectatorOptions.style.display = 'flex';
            if (rlTrainingOptions) rlTrainingOptions.style.display = 'none';
            if (mapGrid) mapGrid.style.display = 'grid';
            
            // Hide MOBA info if it exists
            const mobaInfo = document.getElementById('moba-info');
            if (mobaInfo) mobaInfo.style.display = 'none';
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
            this.game.setMenuMode(true);
            this.game.input.unlockCursor();
            this.game.input.clearInputState();

            // Update Resume button visibility
            const resumeBtn = document.getElementById('btn-resume');
            if (resumeBtn) resumeBtn.style.display = this.isGameStarted ? 'block' : 'none';
        }
    }

    public hide(): Promise<boolean> {
        if (this.overlay) {
            this.overlay.style.display = 'none';
            this.isVisible = false;
            this.game.isPaused = false;
            this.game.setMenuMode(false); // Restore
            this.isGameStarted = true;

            // Keep this request in the same synchronous user-gesture call stack as
            // Resume/Deploy. Browsers reject pointer lock once that activation is
            // lost, so callers that need to observe the result can await it, but
            // the request itself is started here before hide() returns.
            return this.game.input.lockCursor();
        }

        return Promise.resolve(false);
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
                    <span class="map-meta">${map}</span>
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
        mbCard.className = 'map-card map-card--builder';
        mbCard.innerHTML = `
            <div class="map-preview map-preview--builder">
                <span>+</span>
            </div>
            <div class="map-info">
                <div class="map-name map-name--accent">Map Builder</div>
            </div>
        `;
        mbCard.addEventListener('click', () => {
            // Launch new 3D Level Editor
            if (this.game.levelEditor) {
                this.hide();
                this.game.levelEditor.enter();
            } else {
                console.error("Level Editor not found on game instance");
            }
        });
        grid.appendChild(mbCard);
    }

    private formatMapName(name: string) {
        return name.replace(/_/g, ' ').toUpperCase();
    }

    private async loadMap(mapName: string) {
        console.log(`Loading map: ${mapName}`);

        if (this.game.levelGenerator) {
            const modeSelect = document.getElementById('gamemode-select') as HTMLSelectElement;
            const modeValue = modeSelect ? modeSelect.value : GameModeId.TDM;

            console.log(`Selected Game Mode: ${modeValue}`);
            
            if (modeValue === GameModeId.MOBA) {
                mapName = PROCEDURAL_MAP_NAMES.MOBA;
            }

            if (this.game.gameMode) {
                this.game.gameMode.dispose();
            }

            if (modeValue === GameModeId.RL_TRAINING) {
                const botsPerTeam = parseInt((document.getElementById('rl-bots-per-team') as HTMLInputElement)?.value || '3');
                const roundDuration = parseInt((document.getElementById('rl-round-duration') as HTMLInputElement)?.value || '30');

                const rlMode = await createRLTrainingMode(this.game, {
                    botsPerTeam,
                    roundDurationSeconds: roundDuration,
                });

                this.game.gameMode = rlMode;

                if (this.preloadedModelFile) {
                    rlMode.loadModelFromFile(this.preloadedModelFile).then(success => {
                        if (success) {
                            console.log('[Menu] Pre-loaded model applied to training mode');
                        }
                    });
                }
            } else if (isGameModeId(modeValue)) {
                this.game.gameMode = createGameMode(this.game, modeValue);

                if (modeValue === GameModeId.TDM) {
                    const spectateCheckbox = document.getElementById('checkbox-spectator') as HTMLInputElement;
                    if (spectateCheckbox?.checked) {
                        (this.game.gameMode as TeamDeathmatchGameMode).isSpectatorOnly = true;
                    }
                }
            } else {
                this.game.gameMode = createGameMode(this.game, GameModeId.TDM);
            }

            // Show loading
            this.showLoading();

            const lg = this.game.levelGenerator;
            const actualMapName = modeValue === GameModeId.MOBA ? PROCEDURAL_MAP_NAMES.MOBA : mapName;
            await lg.loadMap(actualMapName);

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
        loadingScreen.className = 'c1-loading-screen';
        loadingScreen.innerHTML = '<span class="c1-loading-text">Loading</span>';
        this.container.appendChild(loadingScreen);
    }

    private showReadyToStart() {
        let loadingScreen = document.getElementById('loading-screen');
        if (!loadingScreen) {
            this.showLoading();
            loadingScreen = document.getElementById('loading-screen')!;
        }

        loadingScreen.innerHTML = '';

        const btn = document.createElement('button');
        btn.textContent = 'Deploy';
        btn.className = 'c1-deploy-btn';

        let deployed = false;
        const deploy = () => {
            if (deployed) return;
            deployed = true;

            loadingScreen?.remove();
            void this.hide();
        };

        btn.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            // pointerdown is the earliest reliable activation event for Pointer Lock.
            deploy();
        });
        // Preserve keyboard activation for the Deploy button.
        btn.addEventListener('click', deploy);

        loadingScreen.appendChild(btn);
    }

    // Set level generator reference
    public setLevelGenerator(lg: LevelGenerator) {
        this.game.levelGenerator = lg;
    }
}
