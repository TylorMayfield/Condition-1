
/**
 * Base interface for editor tools.
 */
export interface EditorTool {
    name: string;

    activate(): void;
    deactivate(): void;

    update(dt: number): void;

    onMouseDown(event: MouseEvent): void;
    onMouseUp(event: MouseEvent): void;
    onMouseMove(event: MouseEvent): void;
    onKeyDown(event: KeyboardEvent): void;
}
