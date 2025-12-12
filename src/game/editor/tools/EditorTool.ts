import * as THREE from 'three';

/**
 * Base interface for editor tools.
 */
export interface EditorTool {
    name: string;

    activate(): void;
    deactivate(): void;

    update(dt: number): void;

    onMouseDown(event: MouseEvent, camera: THREE.Camera, ndc: THREE.Vector2): void;
    onMouseUp(event: MouseEvent, camera: THREE.Camera, ndc: THREE.Vector2): void;
    onMouseMove(event: MouseEvent, camera: THREE.Camera, ndc: THREE.Vector2): void;
    onKeyDown(event: KeyboardEvent): void;
}
