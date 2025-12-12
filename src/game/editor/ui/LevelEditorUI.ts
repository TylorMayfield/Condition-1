import { LevelEditor } from '../LevelEditor';
import { VmfExporter } from '../VmfExporter';

export class LevelEditorUI {
    private editor: LevelEditor;
    private container: HTMLDivElement;

    // Exposed viewport containers
    public view3d!: HTMLDivElement;
    public viewTop!: HTMLDivElement;
    public viewFront!: HTMLDivElement;
    public viewSide!: HTMLDivElement;

    constructor(editor: LevelEditor) {
        this.editor = editor;
        this.container = this.createUI();
    }

    private createUI(): HTMLDivElement {
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.display = 'none';
        container.style.backgroundColor = '#222';
        container.style.fontFamily = 'Segoe UI, sans-serif';
        container.id = 'level-editor-ui';

        // Main Layout: Sidebar + Viewport Grid
        container.style.display = 'none'; // Hidden by default, toggled via show/hide
        container.style.flexDirection = 'row';

        // 1. Sidebar
        const sidebar = document.createElement('div');
        sidebar.style.width = '250px';
        sidebar.style.backgroundColor = '#333';
        sidebar.style.borderRight = '1px solid #444';
        sidebar.style.display = 'flex';
        sidebar.style.flexDirection = 'column';
        sidebar.style.padding = '10px';
        container.appendChild(sidebar);

        // Sidebar Content (Tools)
        this.createSidebarContent(sidebar);

        // 2. Viewport Grid (2x2)
        const grid = document.createElement('div');
        grid.style.flex = '1';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gridTemplateRows = '1fr 1fr';
        grid.style.gap = '2px';
        grid.style.backgroundColor = '#444'; // Gap color
        container.appendChild(grid);

        // Create Viewports
        this.viewTop = this.createViewport(grid, 'Top (X/Z)');
        this.view3d = this.createViewport(grid, 'Perspective');
        this.viewFront = this.createViewport(grid, 'Front (X/Y)');
        this.viewSide = this.createViewport(grid, 'Side (Z/Y)');

        document.body.appendChild(container);

        // Set initial display style for flex layout
        // The container starts hidden, so we need to set flex when showing
        return container;
    }

    private createViewport(parent: HTMLElement, label: string): HTMLDivElement {
        const vp = document.createElement('div');
        vp.style.position = 'relative';
        vp.style.backgroundColor = '#111';
        vp.style.overflow = 'hidden';

        // Label
        const labelEl = document.createElement('div');
        labelEl.textContent = label;
        labelEl.style.position = 'absolute';
        labelEl.style.top = '5px';
        labelEl.style.left = '5px';
        labelEl.style.color = '#888';
        labelEl.style.fontSize = '12px';
        labelEl.style.pointerEvents = 'none';
        vp.appendChild(labelEl);

        parent.appendChild(vp);
        return vp;
    }

    private createSidebarContent(sidebar: HTMLElement) {
        // Title
        const title = document.createElement('div');
        title.textContent = 'Wrenchworks';
        title.style.color = '#ddd';
        title.style.marginBottom = '20px';
        title.style.fontWeight = 'bold';
        sidebar.appendChild(title);

        // Tools Section
        const toolsLabel = document.createElement('div');
        toolsLabel.textContent = 'Tools';
        toolsLabel.style.color = '#aaa';
        toolsLabel.style.fontSize = '12px';
        toolsLabel.style.marginBottom = '5px';
        sidebar.appendChild(toolsLabel);

        const tools = ['Select', 'Block', 'Texture', 'Entity'];
        const toolBtns: HTMLButtonElement[] = [];

        tools.forEach(t => {
            const btn = document.createElement('button');
            btn.textContent = t;
            btn.style.width = '100%';
            btn.style.padding = '8px';
            btn.style.marginBottom = '5px';
            btn.style.backgroundColor = '#444';
            btn.style.border = '1px solid #555';
            btn.style.color = 'white';
            btn.style.cursor = 'pointer';
            btn.style.textAlign = 'left';

            btn.onclick = () => {
                this.editor.selectTool(t);
                toolBtns.forEach(b => b.style.backgroundColor = '#444');
                btn.style.backgroundColor = '#007acc';
            };

            sidebar.appendChild(btn);
            toolBtns.push(btn);
        });

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        sidebar.appendChild(spacer);

        // Export Actions
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export VMF';
        exportBtn.style.width = '100%';
        exportBtn.style.padding = '10px';
        exportBtn.style.marginBottom = '10px';
        exportBtn.style.backgroundColor = '#007acc';
        exportBtn.style.border = 'none';
        exportBtn.style.color = 'white';
        exportBtn.style.cursor = 'pointer';
        exportBtn.onclick = () => this.handleExport();
        sidebar.appendChild(exportBtn);

        const exitBtn = document.createElement('button');
        exitBtn.textContent = 'Exit Editor';
        exitBtn.style.width = '100%';
        exitBtn.style.padding = '10px';
        exitBtn.style.backgroundColor = '#cc0000';
        exitBtn.style.border = 'none';
        exitBtn.style.color = 'white';
        exitBtn.style.cursor = 'pointer';
        exitBtn.onclick = () => this.editor.exit();
        sidebar.appendChild(exitBtn);
    }

    private handleExport() {
        console.log('Exporting VMF...');
        const exporter = new VmfExporter(this.editor);
        const content = exporter.export();
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'map.vmf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    public show(): void {
        this.container.style.display = 'flex'; // Use Flex for sidebar layout
    }

    public hide(): void {
        this.container.style.display = 'none';
    }
}
