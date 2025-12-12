import * as THREE from 'three';
import { EditorTool } from './EditorTool';
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

    public update(dt: number): void {
        // No-op
    }

    public onMouseDown(event: MouseEvent): void {
        if (event.button !== 0) return; // Left click only

        const intersection = this.getGridIntersection(event);
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

    public onMouseMove(event: MouseEvent): void {
        if (!this.isDragging || !this.currentBrush) return;

        const intersection = this.getGridIntersection(event);
        if (intersection) {
            const endPoint = intersection.clone().round();

            // Calculate min/max coords
            const minX = Math.min(this.startPoint.x, endPoint.x);
            const maxX = Math.max(this.startPoint.x, endPoint.x);
            const minZ = Math.min(this.startPoint.z, endPoint.z);
            const maxZ = Math.max(this.startPoint.z, endPoint.z);

            // Size must be at least 1 unit
            // If dragging from 0 to 0, size is 1 (block [0,1])
            // If dragging from 0 to 2, size is 2 (blocks [0,1], [1,2])? 
            // Wait, round() goes to nearest integer. 0.1 -> 0. 
            // If dragging, we usually target grid corners integers.
            // If I click at 0.5, I get 1 (round). Or 0.
            // Let's assume grid cells.

            // Determine dimensions
            // If start=0, end=0.  Length = |0-0| = 0? We want 1.
            // If start=0, end=1.  Length = 1.

            // We want brush to cover from min to max.
            // If points are inclusive? 
            // Typically "drag to" means the endpoint is included. 
            // If both are same, size is 1 block.
            // If different, size is diff + direction?

            // Simple logic:
            // Width = (maxX - minX) if != 0, else 1
            // But this assumes we are strictly on grid lines.

            // Let's assume start and end are identifying CELLS.
            // start=0 -> Cell 0. end=1 -> Cell 1.
            // Range [0, 2] (size 2).
            // So width = abs(end - start) + 1 ?
            // If start=0, end=1. Width = 2 ? 
            // Usually dragging from 0 to 1 implies 0->1.

            // Let's stick to simple abs diff for now, min 1.
            const sX = Math.abs(endPoint.x - this.startPoint.x) || 1;
            const sZ = Math.abs(endPoint.z - this.startPoint.z) || 1;
            const height = 4;

            // Re-position
            // Center = min + size/2
            // BUT: If I dragged "Backwards", min is the new point.
            // However, we calculated minX/maxX independently.

            // If start=0, end=3. min=0. Size=3? 
            // If start=0, end=3 (3 blocks: 0, 1, 2) -> 3.

            // Correct logic for grid selection:
            // The brush should effectively bound the selected grid points.
            // If I selected point 0 and point 3.
            // I probably want to span from 0 to 3.

            // Let's just use the calculated size.

            this.currentBrush.resize(new THREE.Vector3(sX, height, sZ));
            this.currentBrush.mesh.position.set(
                minX + sX / 2,
                height / 2,
                minZ + sZ / 2
            );
        }
    }

    public onMouseUp(event: MouseEvent): void {
        if (!this.isDragging) return;
        this.isDragging = false;

        // Finalize
        if (this.currentBrush) {
            console.log('Created Brush', this.currentBrush.getId());
            this.currentBrush = null;
        }
    }

    public onKeyDown(event: KeyboardEvent): void {
        // No-op
    }

    private getGridIntersection(event: MouseEvent): THREE.Vector3 | null {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );

        raycaster.setFromCamera(mouse, this.editor.getGame().camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();

        return raycaster.ray.intersectPlane(plane, target);
    }
}
