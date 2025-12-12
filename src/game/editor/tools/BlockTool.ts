import * as THREE from 'three';
import type { EditorTool } from './EditorTool';
import { LevelEditor } from '../LevelEditor';
import { EditorBrush } from '../EditorBrush';

/**
 * BlockTool - Creates new brushes by dragging on the grid.
 */
export class BlockTool implements EditorTool {
    public name: string = 'Block';
    private editor: LevelEditor;

    // State
    private isDragging: boolean = false;
    private startPoint: THREE.Vector3 = new THREE.Vector3();
    private currentBrush: EditorBrush | null = null;

    constructor(editor: LevelEditor) {
        this.editor = editor;
    }

    public activate(): void {
        console.log('Block Tool Activated');
    }

    public deactivate(): void {
        if (this.currentBrush) {
            this.editor.removeBrush(this.currentBrush);
            this.currentBrush = null;
        }
        this.isDragging = false;
    }

    public update(_dt: number): void {
        // No-op
    }

    public onMouseDown(event: MouseEvent, camera: THREE.Camera, ndc: THREE.Vector2): void {
        if (event.button !== 0) return; // Left click only

        const intersection = this.getGridIntersection(camera, ndc);
        if (intersection) {
            this.isDragging = true;
            this.startPoint.copy(intersection).round();

            // Create preview brush (1x1x1) at start point
            // Center is start + 0.5
            this.currentBrush = new EditorBrush(
                new THREE.Vector3(
                    this.startPoint.x + 0.5,
                    this.startPoint.y + 0.5,
                    this.startPoint.z + 0.5
                ),
                new THREE.Vector3(1, 1, 1)
            );
            this.editor.addBrush(this.currentBrush);
        }
    }

    public onMouseMove(event: MouseEvent, camera: THREE.Camera, ndc: THREE.Vector2): void {
        if (!this.isDragging || !this.currentBrush) return;

        const intersection = this.getGridIntersection(camera, ndc);
        if (intersection) {
            const endPoint = intersection.clone().round();

            // Calculate min/max coords
            const minX = Math.min(this.startPoint.x, endPoint.x);
            // const maxX = Math.max(this.startPoint.x, endPoint.x);
            const minZ = Math.min(this.startPoint.z, endPoint.z);
            // const maxZ = Math.max(this.startPoint.z, endPoint.z);

            const sX = Math.abs(endPoint.x - this.startPoint.x) || 1;
            const sZ = Math.abs(endPoint.z - this.startPoint.z) || 1;
            const height = 4;

            this.currentBrush.resize(new THREE.Vector3(sX, height, sZ));
            this.currentBrush.mesh.position.set(
                minX + sX / 2,
                height / 2,
                minZ + sZ / 2
            );
        }
    }

    public onMouseUp(_event: MouseEvent, _camera: THREE.Camera, _ndc: THREE.Vector2): void {
        if (!this.isDragging) return;
        this.isDragging = false;

        // Finalize
        if (this.currentBrush) {
            console.log('Created Brush', this.currentBrush.getId());
            this.currentBrush = null;
        }
    }

    public onKeyDown(_event: KeyboardEvent): void {
        // No-op
    }

    private getGridIntersection(camera: THREE.Camera, ndc: THREE.Vector2): THREE.Vector3 | null {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(ndc.x, ndc.y);

        raycaster.setFromCamera(mouse, camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();

        return raycaster.ray.intersectPlane(plane, target);
    }
}
