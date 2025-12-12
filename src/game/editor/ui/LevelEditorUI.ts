import { LevelEditor } from '../LevelEditor';
import { VmfExporter } from '../VmfExporter';

export class LevelEditorUI {
    private editor: LevelEditor;
    private container: HTMLDivElement;

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
        container.style.pointerEvents = 'none'; // Passthrough
        container.style.display = 'none';
        container.id = 'level-editor-ui';

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.style.position = 'absolute';
        toolbar.style.top = '10px';
        toolbar.style.left = '10px';
        toolbar.style.display = 'flex';
        toolbar.style.pointerEvents = 'auto'; // Catch clicks
        toolbar.style.background = 'rgba(0, 0, 0, 0.7)';
        toolbar.style.padding = '5px';
        container.appendChild(toolbar);

        // Tool Buttons
        const tools = ['Select', 'Block', 'Texture', 'Entity'];
        tools.forEach(t => {
            const btn = document.createElement('button');
            btn.textContent = t;
            btn.style.marginRight = '8px';
            btn.style.padding = '6px 12px';
            btn.style.background = '#333';
            btn.style.border = '1px solid #555';
            btn.style.color = 'white';
            btn.style.cursor = 'pointer';

            btn.onclick = () => {
                this.editor.selectTool(t);
                // Visual feedback (reset others)
                Array.from(toolbar.children).forEach(c => {
                    if (c instanceof HTMLButtonElement && tools.includes(c.textContent || '')) {
                        c.style.background = '#333';
                    }
                });
                btn.style.background = '#007acc'; // Active color
            };

            toolbar.appendChild(btn);
        });

        // Export Button
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export VMF';
        exportBtn.style.marginLeft = 'auto'; // Right align
        exportBtn.style.padding = '6px 12px';
        exportBtn.style.background = '#007acc';
        exportBtn.style.border = '1px solid #555';
        exportBtn.style.color = 'white';
        exportBtn.style.cursor = 'pointer';

        exportBtn.onclick = () => {
            console.log('Exporting VMF...');
            const exporter = new VmfExporter(this.editor);
            const content = exporter.export();

            // Download as file
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'map.vmf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(content); // Debug
        };
        toolbar.appendChild(exportBtn);

        // Exit button
        const exitBtn = document.createElement('button');
        exitBtn.textContent = 'Exit Editor';
        exitBtn.style.marginLeft = '10px';
        exitBtn.style.padding = '6px 12px';
        exitBtn.style.background = '#cc0000';
        exitBtn.style.border = '1px solid #555';
        exitBtn.style.color = 'white';
        exitBtn.style.cursor = 'pointer';
        exitBtn.onclick = () => this.editor.exit();
        toolbar.appendChild(exitBtn);

        document.body.appendChild(container);
        return container;
    }

    public show(): void {
        this.container.style.display = 'block';
    }

    public hide(): void {
        this.container.style.display = 'none';
    }
}
