import * as THREE from 'three';
import { EditorTool } from './EditorTool';
import { LevelEditor } from '../LevelEditor';
import { EditorBrush } from '../EditorBrush';

export class TextureTool implements EditorTool {
    public name: string = 'Texture';
    private editor: LevelEditor;
    private currentTexture: string = 'brick'; // Default

    constructor(editor: LevelEditor) {
        this.editor = editor;
    }

    public activate(): void {
        console.log('Texture Tool Activated');
    }

    public deactivate(): void {
    }

    public update(dt: number): void {
    }

    public onMouseDown(event: MouseEvent): void {
        if (event.button !== 0) return;

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );

        raycaster.setFromCamera(mouse, this.editor.getGame().camera);
        const intersects = raycaster.intersectObjects(this.editor.getGame().scene.children, true);

        for (const hit of intersects) {
            let obj: THREE.Object3D | null = hit.object;
            // Traverse up to find brush
            while (obj) {
                if (obj.userData && obj.userData.editorBrush) {
                    const brush = obj.userData.editorBrush as EditorBrush;

                    // Determine face index
                    // BoxGeometry faces are usually 0-5. 
                    // hit.faceIndex references triangles. 2 triangles per face.
                    // Math.floor(hit.faceIndex / 2) should give box face index (0-5).
                    if (hit.faceIndex !== undefined) {
                        const faceIndex = Math.floor(hit.faceIndex / 2);
                        brush.setMaterial(faceIndex, this.currentTexture);
                        console.log(`Applied ${this.currentTexture} to face ${faceIndex}`);
                        return;
                    }
                }
                obj = obj.parent;
            }
        }
    }

    public onMouseUp(event: MouseEvent): void {
    }
    public onMouseMove(event: MouseEvent): void {
    }
    public onKeyDown(event: KeyboardEvent): void {
    }
}
