import { MapBuilder, BLOCK_PALETTE, SPAWN_PALETTE } from './MapBuilder';

/**
 * MapBuilderUI - Visual interface for the map editor.
 * Creates a DOM-based grid editor with palette, layer controls, and export.
 */
export class MapBuilderUI {
    private builder: MapBuilder;
    private container: HTMLElement;
    private gridContainer: HTMLElement | null = null;
    private isMouseDown: boolean = false;

    // UI state
    private cellSize: number = 24;
    private showGrid: boolean = true;

    constructor(builder: MapBuilder) {
        this.builder = builder;
        this.container = this.createContainer();
        this.render();
        this.setupKeyboardShortcuts();
    }

    /**
     * Create the main container element.
     */
    private createContainer(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'map-builder';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #1a1a2e;
            color: #eee;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: none;
            flex-direction: column;
            z-index: 2000;
        `;
        document.body.appendChild(container);
        return container;
    }

    /**
     * Render the complete UI.
     */
    private render(): void {
        this.container.innerHTML = '';

        // Header
        this.container.appendChild(this.createHeader());

        // Main content area
        const main = document.createElement('div');
        main.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
        `;

        // Left sidebar - tools and palette
        main.appendChild(this.createLeftSidebar());

        // Center - grid editor
        main.appendChild(this.createGridEditor());

        // Right sidebar - layers and properties
        main.appendChild(this.createRightSidebar());

        this.container.appendChild(main);

        // Footer - status bar
        this.container.appendChild(this.createFooter());
    }

    /**
     * Create the header bar.
     */
    private createHeader(): HTMLElement {
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 20px;
            background: #16213e;
            border-bottom: 2px solid #0f3460;
        `;

        // Title and map name
        const titleArea = document.createElement('div');
        titleArea.style.cssText = 'display: flex; align-items: center; gap: 15px;';

        const title = document.createElement('h1');
        title.textContent = '🗺️ Map Builder';
        title.style.cssText = 'margin: 0; font-size: 20px; color: #e94560;';
        titleArea.appendChild(title);

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = this.builder.getMapName();
        nameInput.placeholder = 'Map Name';
        nameInput.style.cssText = `
            padding: 8px 12px;
            font-size: 14px;
            border: 1px solid #0f3460;
            border-radius: 4px;
            background: #1a1a2e;
            color: #eee;
            width: 200px;
        `;
        nameInput.addEventListener('change', () => {
            this.builder.setMapName(nameInput.value);
        });
        titleArea.appendChild(nameInput);

        header.appendChild(titleArea);

        // Action buttons
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 10px;';

        const exportBtn = this.createButton('📥 Export', '#27ae60', () => this.exportMap());
        const importBtn = this.createButton('📤 Import', '#3498db', () => this.importMap());
        const clearBtn = this.createButton('🗑️ Clear', '#e74c3c', () => this.clearMap());
        const closeBtn = this.createButton('✖ Close', '#95a5a6', () => this.hide());

        actions.appendChild(exportBtn);
        actions.appendChild(importBtn);
        actions.appendChild(clearBtn);
        actions.appendChild(closeBtn);

        header.appendChild(actions);

        return header;
    }

    /**
     * Create the left sidebar with tools and block palette.
     */
    private createLeftSidebar(): HTMLElement {
        const sidebar = document.createElement('div');
        sidebar.style.cssText = `
            width: 200px;
            background: #16213e;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            overflow-y: auto;
        `;

        // Tools section
        const toolsSection = document.createElement('div');
        const toolsTitle = document.createElement('h3');
        toolsTitle.textContent = '🛠️ Tools';
        toolsTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 14px; color: #e94560;';
        toolsSection.appendChild(toolsTitle);

        const tools = [
            { id: 'block', label: '🧱 Block', key: 'B' },
            { id: 'fill', label: '🪣 Fill', key: 'F' },
            { id: 'spawn', label: '📍 Spawn', key: 'S' },
            { id: 'erase', label: '🧹 Erase', key: 'E' },
        ];

        tools.forEach(tool => {
            const btn = document.createElement('button');
            btn.textContent = `${tool.label} (${tool.key})`;
            btn.style.cssText = `
                width: 100%;
                padding: 10px;
                margin-bottom: 5px;
                border: 2px solid ${this.builder.getTool() === tool.id ? '#e94560' : '#0f3460'};
                border-radius: 4px;
                background: ${this.builder.getTool() === tool.id ? '#e94560' : '#1a1a2e'};
                color: #eee;
                cursor: pointer;
                font-size: 13px;
            `;
            btn.addEventListener('click', () => {
                this.builder.setTool(tool.id as 'block' | 'spawn' | 'erase' | 'fill');
                this.render();
            });
            toolsSection.appendChild(btn);
        });

        sidebar.appendChild(toolsSection);

        // Block palette section
        const blockSection = document.createElement('div');
        const blockTitle = document.createElement('h3');
        blockTitle.textContent = '🧱 Blocks';
        blockTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 14px; color: #e94560;';
        blockSection.appendChild(blockTitle);

        BLOCK_PALETTE.forEach(block => {
            const btn = document.createElement('button');
            btn.innerHTML = `<span style="display:inline-block;width:16px;height:16px;background:${block.color};border:1px solid #444;vertical-align:middle;margin-right:8px;"></span>${block.name}`;
            btn.style.cssText = `
                width: 100%;
                padding: 8px;
                margin-bottom: 3px;
                border: 2px solid ${this.builder.getCurrentBlock() === block.char ? '#e94560' : '#0f3460'};
                border-radius: 4px;
                background: ${this.builder.getCurrentBlock() === block.char ? '#2a2a4e' : '#1a1a2e'};
                color: #eee;
                cursor: pointer;
                font-size: 12px;
                text-align: left;
            `;
            btn.addEventListener('click', () => {
                this.builder.setCurrentBlock(block.char);
                this.builder.setTool('block');
                this.render();
            });
            blockSection.appendChild(btn);
        });

        sidebar.appendChild(blockSection);

        // Spawn palette section
        const spawnSection = document.createElement('div');
        const spawnTitle = document.createElement('h3');
        spawnTitle.textContent = '📍 Spawns';
        spawnTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 14px; color: #e94560;';
        spawnSection.appendChild(spawnTitle);

        SPAWN_PALETTE.forEach(spawn => {
            const btn = document.createElement('button');
            btn.innerHTML = `<span style="display:inline-block;width:16px;height:16px;background:${spawn.color};border:1px solid #444;vertical-align:middle;margin-right:8px;"></span>${spawn.name}`;
            btn.style.cssText = `
                width: 100%;
                padding: 8px;
                margin-bottom: 3px;
                border: 2px solid ${this.builder.getCurrentSpawn() === spawn.type ? '#e94560' : '#0f3460'};
                border-radius: 4px;
                background: ${this.builder.getCurrentSpawn() === spawn.type ? '#2a2a4e' : '#1a1a2e'};
                color: #eee;
                cursor: pointer;
                font-size: 12px;
                text-align: left;
            `;
            btn.addEventListener('click', () => {
                this.builder.setCurrentSpawn(spawn.type);
                this.builder.setTool('spawn');
                this.render();
            });
            spawnSection.appendChild(btn);
        });

        sidebar.appendChild(spawnSection);

        return sidebar;
    }

    /**
     * Create the main grid editor area.
     */
    private createGridEditor(): HTMLElement {
        const editorArea = document.createElement('div');
        editorArea.style.cssText = `
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: auto;
            background: #0d0d1a;
            padding: 20px;
        `;

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${this.builder.getWidth()}, ${this.cellSize}px);
            gap: 1px;
            background: ${this.showGrid ? '#333' : 'transparent'};
            border: 2px solid #e94560;
        `;

        const layer = this.builder.getCurrentLayer();

        for (let z = 0; z < this.builder.getHeight(); z++) {
            for (let x = 0; x < this.builder.getWidth(); x++) {
                const cell = document.createElement('div');
                const char = layer.grid[z]?.[x] || '.';
                const color = this.getColorForChar(char);

                cell.style.cssText = `
                    width: ${this.cellSize}px;
                    height: ${this.cellSize}px;
                    background: ${color};
                    cursor: crosshair;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: rgba(255,255,255,0.5);
                `;

                // Show character for spawns
                if (char === 'P' || char === 'E' || char === 'Q') {
                    cell.textContent = char;
                    cell.style.fontWeight = 'bold';
                    cell.style.color = '#fff';
                }

                cell.dataset.x = x.toString();
                cell.dataset.z = z.toString();

                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.isMouseDown = true;
                    this.handleCellClick(x, z, e.button === 2);
                });

                cell.addEventListener('mouseenter', () => {
                    if (this.isMouseDown) {
                        this.handleCellClick(x, z, false);
                    }
                });

                cell.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                });

                grid.appendChild(cell);
            }
        }

        document.addEventListener('mouseup', () => {
            this.isMouseDown = false;
        });

        this.gridContainer = grid;
        editorArea.appendChild(grid);

        return editorArea;
    }

    /**
     * Handle cell click/paint.
     */
    private handleCellClick(x: number, z: number, isRightClick: boolean): void {
        if (isRightClick) {
            // Right click always erases
            const prevTool = this.builder.getTool();
            this.builder.setTool('erase');
            this.builder.paintCell(x, z);
            this.builder.setTool(prevTool as 'block' | 'spawn' | 'erase' | 'fill');
        } else if (this.builder.getTool() === 'fill') {
            // Fill tool - flood fill from clicked cell
            this.builder.fill(x, z);
        } else {
            this.builder.paintCell(x, z);
        }
        this.updateGrid();
    }

    /**
     * Update just the grid cells (faster than full re-render).
     */
    private updateGrid(): void {
        if (!this.gridContainer) return;

        const layer = this.builder.getCurrentLayer();
        const cells = this.gridContainer.children;
        let i = 0;

        for (let z = 0; z < this.builder.getHeight(); z++) {
            for (let x = 0; x < this.builder.getWidth(); x++) {
                const cell = cells[i] as HTMLElement;
                if (cell) {
                    const char = layer.grid[z]?.[x] || '.';
                    const color = this.getColorForChar(char);
                    cell.style.background = color;

                    if (char === 'P' || char === 'E' || char === 'Q') {
                        cell.textContent = char;
                        cell.style.fontWeight = 'bold';
                        cell.style.color = '#fff';
                    } else {
                        cell.textContent = '';
                    }
                }
                i++;
            }
        }
    }

    /**
     * Get color for a character.
     */
    private getColorForChar(char: string): string {
        const block = BLOCK_PALETTE.find(b => b.char === char);
        if (block) return block.color;

        const spawn = SPAWN_PALETTE.find(s => s.char === char);
        if (spawn) return spawn.color;

        return '#1a1a2e';
    }

    /**
     * Create the right sidebar with layers and properties.
     */
    private createRightSidebar(): HTMLElement {
        const sidebar = document.createElement('div');
        sidebar.style.cssText = `
            width: 200px;
            background: #16213e;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            overflow-y: auto;
        `;

        // Layers section
        const layersSection = document.createElement('div');
        const layersTitle = document.createElement('h3');
        layersTitle.textContent = '📚 Layers';
        layersTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 14px; color: #e94560;';
        layersSection.appendChild(layersTitle);

        this.builder.getLayers().forEach((layer, index) => {
            const layerBtn = document.createElement('button');
            layerBtn.textContent = `Y=${layer.y}: ${layer.label}`;
            layerBtn.style.cssText = `
                width: 100%;
                padding: 10px;
                margin-bottom: 5px;
                border: 2px solid ${index === this.builder.getCurrentLayerIndex() ? '#e94560' : '#0f3460'};
                border-radius: 4px;
                background: ${index === this.builder.getCurrentLayerIndex() ? '#e94560' : '#1a1a2e'};
                color: #eee;
                cursor: pointer;
                font-size: 12px;
            `;
            layerBtn.addEventListener('click', () => {
                this.builder.setCurrentLayer(index);
                this.render();
            });
            layersSection.appendChild(layerBtn);
        });

        // Add layer button
        const addLayerBtn = this.createButton('+ Add Layer', '#27ae60', () => {
            const y = this.builder.getLayers().length;
            this.builder.addLayer(y, `Layer ${y}`);
            this.render();
        });
        addLayerBtn.style.marginTop = '10px';
        layersSection.appendChild(addLayerBtn);

        sidebar.appendChild(layersSection);

        // Undo/Redo section
        const historySection = document.createElement('div');
        const historyTitle = document.createElement('h3');
        historyTitle.textContent = '⏪ History';
        historyTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 14px; color: #e94560;';
        historySection.appendChild(historyTitle);

        const undoBtn = this.createButton('↩ Undo (Ctrl+Z)', '#3498db', () => {
            this.builder.undo();
            this.render();
        });
        const redoBtn = this.createButton('↪ Redo (Ctrl+Y)', '#3498db', () => {
            this.builder.redo();
            this.render();
        });

        historySection.appendChild(undoBtn);
        historySection.appendChild(redoBtn);

        sidebar.appendChild(historySection);

        // Map size section
        const sizeSection = document.createElement('div');
        const sizeTitle = document.createElement('h3');
        sizeTitle.textContent = '📐 Size';
        sizeTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 14px; color: #e94560;';
        sizeSection.appendChild(sizeTitle);

        const sizeInfo = document.createElement('div');
        sizeInfo.textContent = `${this.builder.getWidth()} x ${this.builder.getHeight()}`;
        sizeInfo.style.cssText = 'padding: 8px; background: #1a1a2e; border-radius: 4px; text-align: center;';
        sizeSection.appendChild(sizeInfo);

        sidebar.appendChild(sizeSection);

        return sidebar;
    }

    /**
     * Create the footer status bar.
     */
    private createFooter(): HTMLElement {
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 8px 20px;
            background: #16213e;
            border-top: 2px solid #0f3460;
            font-size: 12px;
            color: #888;
            display: flex;
            justify-content: space-between;
        `;

        const left = document.createElement('span');
        left.textContent = `Tool: ${this.builder.getTool().toUpperCase()} | Layer: ${this.builder.getCurrentLayer().label}`;

        const right = document.createElement('span');
        right.textContent = 'Left-click: Paint | Right-click: Erase | Ctrl+Z: Undo | Ctrl+Y: Redo';

        footer.appendChild(left);
        footer.appendChild(right);

        return footer;
    }

    /**
     * Create a styled button.
     */
    private createButton(text: string, color: string, onClick: () => void): HTMLElement {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding: 10px 16px;
            border: none;
            border-radius: 4px;
            background: ${color};
            color: white;
            cursor: pointer;
            font-size: 13px;
            transition: opacity 0.2s;
        `;
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.8'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
        btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * Set up keyboard shortcuts.
     */
    private setupKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            if (this.container.style.display === 'none') return;

            // Tool shortcuts
            if (e.key.toLowerCase() === 'b') {
                this.builder.setTool('block');
                this.render();
            } else if (e.key.toLowerCase() === 'f') {
                this.builder.setTool('fill');
                this.render();
            } else if (e.key.toLowerCase() === 's') {
                this.builder.setTool('spawn');
                this.render();
            } else if (e.key.toLowerCase() === 'e') {
                this.builder.setTool('erase');
                this.render();
            }

            // Undo/Redo
            if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                this.builder.undo();
                this.render();
            } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.builder.redo();
                this.render();
            }

            // Layer switching with number keys
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key) - 1;
                if (index < this.builder.getLayers().length) {
                    this.builder.setCurrentLayer(index);
                    this.render();
                }
            }

            // Escape to close
            if (e.key === 'Escape') {
                this.hide();
            }
        });
    }

    /**
     * Export map to clipboard and show download.
     */
    private exportMap(): void {
        const content = this.builder.exportToTextMap();

        // Copy to clipboard
        navigator.clipboard.writeText(content).then(() => {
            alert('Map copied to clipboard! You can paste it into a .textmap file.');
        }).catch(() => {
            // Fallback: show in a textarea
            this.showExportDialog(content);
        });

        // Also trigger download
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.builder.getMapName().replace(/\s+/g, '_').toLowerCase()}.textmap`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Show export dialog with the map content.
     */
    private showExportDialog(content: string): void {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #16213e;
            padding: 20px;
            border-radius: 8px;
            z-index: 3000;
            max-width: 80%;
            max-height: 80%;
        `;

        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.cssText = `
            width: 600px;
            height: 400px;
            font-family: monospace;
            font-size: 12px;
            background: #1a1a2e;
            color: #eee;
            border: 1px solid #0f3460;
            padding: 10px;
        `;

        const closeBtn = this.createButton('Close', '#e74c3c', () => dialog.remove());

        dialog.appendChild(textarea);
        dialog.appendChild(document.createElement('br'));
        dialog.appendChild(closeBtn);
        document.body.appendChild(dialog);
    }

    /**
     * Import map from file or clipboard.
     */
    private importMap(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.textmap,.txt';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (file) {
                const content = await file.text();
                this.builder.importFromTextMap(content);
                this.render();
            }
        });
        input.click();
    }

    /**
     * Clear the map with confirmation.
     */
    private clearMap(): void {
        if (confirm('Clear entire map? This cannot be undone.')) {
            this.builder.clearAll();
            this.render();
        }
    }

    /**
     * Show the map builder.
     */
    public show(): void {
        this.container.style.display = 'flex';
        this.render();
    }

    /**
     * Hide the map builder.
     */
    public hide(): void {
        this.container.style.display = 'none';
    }

    /**
     * Check if visible.
     */
    public isVisible(): boolean {
        return this.container.style.display !== 'none';
    }

    /**
     * Get the container element.
     */
    public getContainer(): HTMLElement {
        return this.container;
    }
}
