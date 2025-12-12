import * as THREE from 'three';
import type { EditorTool } from './EditorTool';
import { LevelEditor } from '../LevelEditor';
import { EditorEntity } from '../EditorEntity';

export class EntityTool implements EditorTool {
    public name: string = 'Entity';
    private editor: LevelEditor;
    private previewMesh: THREE.Mesh;

    constructor(editor: LevelEditor) {
        this.editor = editor;

        // Preview mesh (green sphere for spawn point)
        const geometry = new THREE.SphereGeometry(0.5, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
        this.previewMesh = new THREE.Mesh(geometry, material);
        this.previewMesh.visible = false;
        // don't add to scene yet, add on activate
    }

    public activate(): void {
        console.log('Entity Tool Activated');
        this.editor.getGame().scene.add(this.previewMesh);
        this.previewMesh.visible = true;
    }

    public deactivate(): void {
        this.editor.getGame().scene.remove(this.previewMesh);
        this.previewMesh.visible = false;
    }

    public update(_dt: number): void {
    }

    public onMouseDown(event: MouseEvent, camera: THREE.Camera, ndc: THREE.Vector2): void {
        if (event.button !== 0) return;

        const intersection = this.getGridIntersection(camera, ndc);
        if (intersection) {
            // Place entity
            // Offset Y to sit on ground? VMF center is usually midpoint.
            // If we click on ground (y=0), center will be y=0.5 if height is 1.
            const pos = intersection.clone().add(new THREE.Vector3(0, 0, 0));

            const entity = new EditorEntity('info_player_start', pos);
            this.editor.addEntity(entity);
            console.log('Placed Entity at', pos);
        }
    }

    public onMouseMove(event: MouseEvent, camera: THREE.Camera, ndc: THREE.Vector2): void {
        const intersection = this.getGridIntersection(camera, ndc);
        if (intersection) {
            this.previewMesh.position.copy(intersection).add(new THREE.Vector3(0, 0.5, 0));
        }
    }

    public onMouseUp(_event: MouseEvent, _camera: THREE.Camera, _ndc: THREE.Vector2): void {
    }

    public onKeyDown(_event: KeyboardEvent): void {
    }

    private getGridIntersection(camera: THREE.Camera, ndc: THREE.Vector2): THREE.Vector3 | null {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, target) ? target.round() : null;
    }
}
