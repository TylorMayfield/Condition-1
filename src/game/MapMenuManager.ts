import { Game } from '../engine/Game';
import { LevelGenerator } from './LevelGenerator';

export class MapMenuManager {
    private game: Game;
    private levelGen: LevelGenerator;
    private availableMaps: string[] = [];
    private currentMap: string = 'de_dust2';

    constructor(game: Game, levelGen: LevelGenerator) {
        this.game = game;
        this.levelGen = levelGen;
        this.discoverMaps();
    }

    private async discoverMaps() {
        // Known maps - in a real implementation, you'd scan the directory
        // For now, we'll use a static list that can be expanded
        this.availableMaps = [
            'de_dust2',
            'cs_dunder',
            'example_map'
        ];
    }

    public getAvailableMaps(): string[] {
        return this.availableMaps;
    }

    public getCurrentMap(): string {
        return this.currentMap;
    }

    public async loadMap(mapName: string): Promise<boolean> {
        try {
            // Clear existing game objects (except player)
            this.clearMap();
            
            // Load new map
            await this.levelGen.loadMap(mapName);
            this.currentMap = mapName;
            
            return true;
        } catch (error) {
            console.error(`Failed to load map ${mapName}:`, error);
            return false;
        }
    }

    private clearMap() {
        // Remove all game objects except player
        const objectsToRemove = [...this.game.getGameObjects()].filter(obj => obj !== this.game.player);
        objectsToRemove.forEach(obj => {
            // Call dispose if available (handles cleanup)
            if ('dispose' in obj && typeof (obj as any).dispose === 'function') {
                (obj as any).dispose();
            } else {
                // Manual cleanup if no dispose method
                if (obj.mesh) {
                    this.game.scene.remove(obj.mesh);
                }
                if (obj.body) {
                    this.game.world.removeBody(obj.body);
                }
                this.game.removeGameObject(obj);
            }
        });
    }

    public createMapPickerMenu(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'map-picker-menu';
        container.style.display = 'none';
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.background = 'rgba(0, 0, 0, 0.9)';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'center';
        container.style.zIndex = '1001';
        container.style.fontFamily = 'sans-serif';
        container.style.color = 'white';

        const title = document.createElement('h1');
        title.textContent = 'Select Map';
        title.style.marginBottom = '30px';
        title.style.fontSize = '32px';
        container.appendChild(title);

        const mapList = document.createElement('div');
        mapList.style.display = 'flex';
        mapList.style.flexDirection = 'column';
        mapList.style.gap = '15px';
        mapList.style.width = '400px';
        mapList.style.maxHeight = '60vh';
        mapList.style.overflowY = 'auto';
        mapList.style.padding = '20px';
        mapList.style.background = 'rgba(30, 30, 30, 0.8)';
        mapList.style.borderRadius = '10px';

        this.availableMaps.forEach(mapName => {
            const mapButton = document.createElement('button');
            mapButton.textContent = this.formatMapName(mapName);
            mapButton.style.padding = '15px 20px';
            mapButton.style.fontSize = '18px';
            mapButton.style.cursor = 'pointer';
            mapButton.style.background = mapName === this.currentMap ? '#4a90e2' : '#2a2a2a';
            mapButton.style.color = 'white';
            mapButton.style.border = '2px solid ' + (mapName === this.currentMap ? '#6ab0f3' : '#444');
            mapButton.style.borderRadius = '5px';
            mapButton.style.transition = 'all 0.2s';
            
            mapButton.addEventListener('mouseenter', () => {
                if (mapName !== this.currentMap) {
                    mapButton.style.background = '#3a3a3a';
                    mapButton.style.borderColor = '#666';
                }
            });
            
            mapButton.addEventListener('mouseleave', () => {
                if (mapName !== this.currentMap) {
                    mapButton.style.background = '#2a2a2a';
                    mapButton.style.borderColor = '#444';
                }
            });

            mapButton.addEventListener('click', async () => {
                if (mapName === this.currentMap) {
                    this.hide();
                    this.game.togglePause();
                    return;
                }

                // Show loading state
                mapButton.textContent = 'Loading...';
                mapButton.disabled = true;

                const success = await this.loadMap(mapName);
                
                if (success) {
                    // Update button styles
                    mapList.querySelectorAll('button').forEach(btn => {
                        btn.style.background = '#2a2a2a';
                        btn.style.borderColor = '#444';
                    });
                    mapButton.style.background = '#4a90e2';
                    mapButton.style.borderColor = '#6ab0f3';
                    mapButton.textContent = this.formatMapName(mapName);
                    
                    // Close menu and resume
                    setTimeout(() => {
                        this.hide();
                        this.game.togglePause();
                    }, 500);
                } else {
                    mapButton.textContent = 'Failed to load';
                    mapButton.style.background = '#8b0000';
                    setTimeout(() => {
                        mapButton.textContent = this.formatMapName(mapName);
                        mapButton.style.background = '#2a2a2a';
                        mapButton.disabled = false;
                    }, 2000);
                }
            });

            mapList.appendChild(mapButton);
        });

        container.appendChild(mapList);

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.marginTop = '30px';
        cancelButton.style.padding = '12px 30px';
        cancelButton.style.fontSize = '16px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.background = '#444';
        cancelButton.style.color = 'white';
        cancelButton.style.border = '2px solid #666';
        cancelButton.style.borderRadius = '5px';
        cancelButton.style.transition = 'all 0.2s';

        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.background = '#555';
        });

        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.background = '#444';
        });

        cancelButton.addEventListener('click', () => {
            this.hide();
            this.game.togglePause();
        });

        container.appendChild(cancelButton);

        return container;
    }

    private formatMapName(mapName: string): string {
        // Convert map names like "de_dust2" to "DE Dust2"
        return mapName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    public show() {
        const menu = document.getElementById('map-picker-menu');
        if (menu) {
            menu.style.display = 'flex';
        }
    }

    public hide() {
        const menu = document.getElementById('map-picker-menu');
        if (menu) {
            menu.style.display = 'none';
        }
    }
}

