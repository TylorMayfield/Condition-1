import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { EditorTool } from './EditorTool';
import { LevelEditor } from '../LevelEditor';
import { EditorBrush } from '../EditorBrush';

export class SelectTool implements EditorTool {
    public name: string = 'Select';
    private editor: LevelEditor;
    private controls: TransformControls | null = null;
    private selectedBrush: EditorBrush | null = null;

    constructor(editor: LevelEditor) {
        this.editor = editor;
        // Controls created lazily on first selection to avoid bundler issues
    }

    private ensureControls(): TransformControls {
        if (!this.controls) {
            const game = this.editor.getGame();
            this.controls = new TransformControls(game.camera, game.renderer.domElement);
            this.controls.addEventListener('dragging-changed', (_event: any) => {
                // Disable camera movement when dragging gizmo
            });
            this.controls.addEventListener('change', () => {
                // Update brush logical data when mesh changes
            });
            // Add to scene properly
            const scene = game.scene;
            scene.add(this.controls as unknown as THREE.Object3D);
        }
        return this.controls;
    }

    public activate(): void {
        console.log('Select Tool Activated');
        // Controls are created lazily on first selection
    }

    public deactivate(): void {
        this.deselect();
        // Controls persist for reuse when tool is reactivated
    }

    public update(_dt: number): void {
        // Gizmo updates itself?
    }

    public onMouseDown(event: MouseEvent, camera: THREE.Camera, ndc: THREE.Vector2): void {
        if (event.button !== 0) return;

        // Raycast for brushes
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);

        // Collect all brush meshes
        // We assume we can access editor.brushes (need getter?)
        // Or we raycast against scene children and filter
        const intersects = raycaster.intersectObjects(this.editor.getGame().scene.children, true);

        for (const hit of intersects) {
            // Find parent with userData.editorBrush
            let obj: THREE.Object3D | null = hit.object;
            while (obj) {
                if (obj.userData && obj.userData.editorBrush) {
                    this.select(obj.userData.editorBrush as EditorBrush);
                    return;
                }
                obj = obj.parent;
            }
        }

        // If nothing hit (except maybe grid/helpers), deselect
        this.deselect();
    }

    private select(brush: EditorBrush): void {
        if (this.selectedBrush === brush) return;

        this.deselect();
        this.selectedBrush = brush;
        this.selectedBrush.setSelected(true);
        const controls = this.ensureControls();
        controls.attach(this.selectedBrush.mesh);
    }

    private deselect(): void {
        if (this.selectedBrush) {
            this.selectedBrush.setSelected(false);
            this.selectedBrush = null;
        }
        this.controls?.detach();
    }

    public onMouseUp(_event: MouseEvent, _camera: THREE.Camera, _ndc: THREE.Vector2): void {
    }

    public onMouseMove(_event: MouseEvent, _camera: THREE.Camera, _ndc: THREE.Vector2): void {
    }

    public onKeyDown(event: KeyboardEvent): void {
        if (event.code === 'Delete') {
            if (this.selectedBrush) {
                this.editor.removeBrush(this.selectedBrush);
                this.deselect();
            }
        }
        // Switch modes
        if (event.code === 'KeyT') this.controls?.setMode('translate');
        if (event.code === 'KeyR') this.controls?.setMode('rotate');
        if (event.code === 'KeyY') this.controls?.setMode('scale');
    }
}
