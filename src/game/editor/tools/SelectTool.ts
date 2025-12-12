import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { EditorTool } from './EditorTool';
import { LevelEditor } from '../LevelEditor';
import { EditorBrush } from '../EditorBrush';

export class SelectTool implements EditorTool {
    public name: string = 'Select';
    private editor: LevelEditor;
    private controls: TransformControls;
    private selectedBrush: EditorBrush | null = null;

    constructor(editor: LevelEditor) {
        this.editor = editor;

        // Initialize Gizmo
        this.controls = new TransformControls(this.editor.getGame().camera, this.editor.getGame().renderer.domElement);
        this.controls.addEventListener('dragging-changed', (_event: any) => {
            // Disable camera movement when dragging gizmo
            // We can hack this by checking if we are using the gizmo
            // EditorCamera consumes RightClick only, Gizmo is LeftClick. Safe.
        });

        this.controls.addEventListener('change', () => {
            // Update brush logical data when mesh changes
            if (this.selectedBrush) {
                // Determine if it was scaled or moved
                // Update size logic if scaled? 
                // EditorBrush.resize updates scale.
                // If gizmo scales mesh, we should sync back.
            }
        });
    }

    public activate(): void {
        console.log('Select Tool Activated');
        this.editor.getGame().scene.add(this.controls as unknown as THREE.Object3D);
    }

    public deactivate(): void {
        this.deselect();
        this.controls.detach();
        this.editor.getGame().scene.remove(this.controls as unknown as THREE.Object3D);
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
        this.controls.attach(this.selectedBrush.mesh);
    }

    private deselect(): void {
        if (this.selectedBrush) {
            this.selectedBrush.setSelected(false);
            this.selectedBrush = null;
        }
        this.controls.detach();
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
        if (event.code === 'KeyT') this.controls.setMode('translate');
        if (event.code === 'KeyR') this.controls.setMode('rotate');
        if (event.code === 'KeyY') this.controls.setMode('scale');
    }
}
