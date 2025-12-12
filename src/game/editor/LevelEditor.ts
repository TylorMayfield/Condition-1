import * as THREE from 'three';
import { Game } from '../engine/Game';
import { EditorCamera } from './EditorCamera';
import { EditorScene } from './EditorScene';
import { LevelEditorUI } from './ui/LevelEditorUI';
import { EditorBrush } from './EditorBrush';
import { EditorEntity } from './EditorEntity';
import { EditorTool } from './tools/EditorTool';
import { BlockTool } from './tools/BlockTool';
import { SelectTool } from './tools/SelectTool';
import { TextureTool } from './tools/TextureTool';
import { EntityTool } from './tools/EntityTool';

/**
 * LevelEditor - Main controller for the 3D map editor.
 */
export class LevelEditor {
    private game: Game;
    private active: boolean = false;

    // Components
    private cameraControl: EditorCamera;
    private editorScene: EditorScene;
    private ui: LevelEditorUI;

    // Data
    public brushes: EditorBrush[] = [];
    public entities: EditorEntity[] = [];
    private tools: Map<string, EditorTool> = new Map();
    private currentTool: EditorTool | null = null;

    // ...

    public addEntity(entity: EditorEntity): void {
        this.entities.push(entity);
        this.game.scene.add(entity.getMesh());
    }

    public removeEntity(entity: EditorEntity): void {
        const index = this.entities.indexOf(entity);
        if (index > -1) {
            this.entities.splice(index, 1);
            this.game.scene.remove(entity.getMesh());
        }
    }

    // Bindings
    private boundMouseDown: (e: MouseEvent) => void;
    private boundMouseUp: (e: MouseEvent) => void;
    private boundMouseMove: (e: MouseEvent) => void;

    constructor(game: Game) {
        this.game = game;
        this.cameraControl = new EditorCamera(this.game.camera, this.game.renderer.domElement);
        this.editorScene = new EditorScene(this.game.scene);
        this.ui = new LevelEditorUI(this);

        this.boundMouseDown = this.onMouseDown.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        this.boundMouseMove = this.onMouseMove.bind(this);

        this.initTools();
    }

    private initTools(): void {
        this.tools.set('Select', new SelectTool(this));
        this.tools.set('Block', new BlockTool(this));
        this.tools.set('Texture', new TextureTool(this));
        this.tools.set('Entity', new EntityTool(this));

        // Default Tool
        this.selectTool('Select');
    }

    public selectTool(name: string): void {
        if (this.currentTool) {
            this.currentTool.deactivate();
        }
        this.currentTool = this.tools.get(name) || null;
        if (this.currentTool) {
            this.currentTool.activate();
            console.log(`Tool selected: ${name}`);
        }
    }

    public addBrush(brush: EditorBrush): void {
        this.brushes.push(brush);
        this.game.scene.add(brush.getMesh());
    }

    public removeBrush(brush: EditorBrush): void {
        const index = this.brushes.indexOf(brush);
        if (index > -1) {
            this.brushes.splice(index, 1);
            this.game.scene.remove(brush.getMesh());
        }
    }

    public toggle(): void {
        if (this.active) {
            this.exit();
        } else {
            this.enter();
        }
    }

    public enter(): void {
        if (this.active) return;
        this.active = true;
        console.log('Entering Level Editor...');

        // Enable Components
        this.cameraControl.enable();
        this.editorScene.enable();
        this.ui.show();

        // Reset Camera
        this.game.camera.position.set(0, 50, 50);
        this.game.camera.lookAt(0, 0, 0);

        // Bind Events
        document.addEventListener('mousedown', this.boundMouseDown);
        document.addEventListener('mouseup', this.boundMouseUp);
        document.addEventListener('mousemove', this.boundMouseMove);
    }

    public exit(): void {
        if (!this.active) return;
        this.active = false;
        console.log('Exiting Level Editor...');

        this.cameraControl.disable();
        this.editorScene.disable();
        this.ui.hide();

        // Unbind Events
        document.removeEventListener('mousedown', this.boundMouseDown);
        document.removeEventListener('mouseup', this.boundMouseUp);
        document.removeEventListener('mousemove', this.boundMouseMove);
    }

    public update(dt: number): void {
        if (!this.active) return;

        this.cameraControl.update(dt);
        if (this.currentTool) {
            this.currentTool.update(dt);
        }
    }

    private onMouseDown(e: MouseEvent): void {
        if (!this.active) return;
        if (this.currentTool) this.currentTool.onMouseDown(e);
    }

    private onMouseUp(e: MouseEvent): void {
        if (!this.active) return;
        if (this.currentTool) this.currentTool.onMouseUp(e);
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.active) return;
        if (this.currentTool) this.currentTool.onMouseMove(e);
    }

    public isActive(): boolean {
        return this.active;
    }

    public getGame(): Game {
        return this.game;
    }
}
