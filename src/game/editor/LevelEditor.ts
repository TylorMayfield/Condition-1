// Imports
import * as THREE from 'three';
import { Game } from '../../engine/Game';
import { EditorCamera } from './EditorCamera';
import { EditorScene } from './EditorScene';
import { LevelEditorUI } from './ui/LevelEditorUI';
import { EditorBrush } from './EditorBrush';
import { EditorEntity } from './EditorEntity';
import type { EditorTool } from './tools/EditorTool';
import { BlockTool } from './tools/BlockTool';
import { SelectTool } from './tools/SelectTool';
import { TextureTool } from './tools/TextureTool';
import { EntityTool } from './tools/EntityTool';
import { OrthoCameraControls } from './OrthoCameraControls';

/**
 * LevelEditor - Main controller for the 3D map editor.
 */
export class LevelEditor {
    private game: Game;
    private active: boolean = false;

    // Components
    private cameraControl: EditorCamera;
    private editorScene: EditorScene;
    public ui: LevelEditorUI;

    // 2D Views
    private cameraTop: THREE.OrthographicCamera;
    private cameraFront: THREE.OrthographicCamera;
    private cameraSide: THREE.OrthographicCamera;
    private controlsTop: OrthoCameraControls;
    private controlsFront: OrthoCameraControls;
    private controlsSide: OrthoCameraControls;

    // Data
    public brushes: EditorBrush[] = [];
    public entities: EditorEntity[] = [];
    private tools: Map<string, EditorTool> = new Map();
    private currentTool: EditorTool | null = null;

    // Wireframe Material override
    private wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        depthTest: false
    });

    // Helpers
    private helperScene: THREE.Scene;
    private gridXZ: THREE.GridHelper;
    private gridXY: THREE.GridHelper;
    private gridZY: THREE.GridHelper;

    constructor(game: Game) {
        this.game = game;
        this.ui = new LevelEditorUI(this);
        this.editorScene = new EditorScene(this.game.scene);

        // 3D Camera (Attach to specific viewport)
        // Note: EditorCamera might need updating if it expects to bind to document.body
        // We will pass the specific element in enter()
        this.cameraControl = new EditorCamera(this.game.camera, this.ui.view3d);

        // Initialize Ortho Cameras
        const frustumSize = 100;
        const aspect = 1; // Will update on render
        this.cameraTop = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000);
        this.cameraTop.position.set(0, 100, 0);
        this.cameraTop.lookAt(0, 0, 0);
        this.cameraTop.zoom = 1;

        this.cameraFront = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000);
        this.cameraFront.position.set(0, 0, 100);
        this.cameraFront.lookAt(0, 0, 0);
        this.cameraFront.zoom = 1;

        this.cameraSide = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000);
        this.cameraSide.position.set(100, 0, 0);
        this.cameraSide.lookAt(0, 0, 0);
        this.cameraSide.zoom = 1;

        // Initialize Controls
        this.controlsTop = new OrthoCameraControls(this.cameraTop, this.ui.viewTop);
        this.controlsFront = new OrthoCameraControls(this.cameraFront, this.ui.viewFront);
        this.controlsSide = new OrthoCameraControls(this.cameraSide, this.ui.viewSide);

        // Initialize Helpers
        this.helperScene = new THREE.Scene();

        // Top View Grid (XZ plane - Default)
        this.gridXZ = new THREE.GridHelper(200, 200, 0x555555, 0x333333);
        this.helperScene.add(this.gridXZ);

        // Front View Grid (XY plane)
        this.gridXY = new THREE.GridHelper(200, 200, 0x555555, 0x333333);
        this.gridXY.rotation.x = Math.PI / 2;
        this.helperScene.add(this.gridXY);

        // Side View Grid (ZY plane)
        this.gridZY = new THREE.GridHelper(200, 200, 0x555555, 0x333333);
        this.gridZY.rotation.z = Math.PI / 2;
        this.helperScene.add(this.gridZY);

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

        this.game.input.isEditorActive = true;

        // Enable Components
        this.ui.show();
        this.game.input.unlockCursor(); // Force unlock

        const hud = document.getElementById('game-hud');
        if (hud) hud.style.display = 'none';

        // Ensure EditorCamera is bound to the correct element (re-init might be safer if element wasn't ready)
        // But we passed ui.view3d in constructor. It should be fine as long as UI is in DOM.

        this.cameraControl.enable();
        this.controlsTop.enable();
        this.controlsFront.enable();
        this.controlsSide.enable();

        this.editorScene.enable();

        // Bind Events to Viewports
        // We bind to ALL viewports to allow tools to work in any view
        const viewports = [this.ui.view3d, this.ui.viewTop, this.ui.viewFront, this.ui.viewSide];
        viewports.forEach(vp => {
            vp.addEventListener('mousedown', this.boundMouseDown);
        });

        // Mouse Move/Up are global (document) to handle dragging outside
        document.addEventListener('mouseup', this.boundMouseUp);
        document.addEventListener('mousemove', this.boundMouseMove);
    }

    public exit(): void {
        if (!this.active) return;
        this.active = false;
        this.game.input.isEditorActive = false;
        console.log('Exiting Level Editor...');

        this.cameraControl.disable();
        this.controlsTop.disable();
        this.controlsFront.disable();
        this.controlsSide.disable();

        this.editorScene.disable();
        this.ui.hide();

        const hud = document.getElementById('game-hud');
        if (hud) hud.style.display = 'block';

        // Unbind Events
        // Unbind Events
        const viewports = [this.ui.view3d, this.ui.viewTop, this.ui.viewFront, this.ui.viewSide];
        viewports.forEach(vp => {
            vp.removeEventListener('mousedown', this.boundMouseDown);
        });
        document.removeEventListener('mouseup', this.boundMouseUp);
        document.removeEventListener('mousemove', this.boundMouseMove);

        // Restore Renderer State
        this.game.renderer.setScissorTest(false);
        this.game.renderer.setClearColor(0x87CEEB); // Restore Sky Blue (or whatever default)
    }

    public update(dt: number): void {
        if (!this.active) return;

        this.cameraControl.update(dt);
        if (this.currentTool) {
            this.currentTool.update(dt);
        }
    }

    public render(): void {
        if (!this.active) return;

        const renderer = this.game.renderer;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Enable Scissor Test
        renderer.setScissorTest(true);
        // Clear Color Buffer once (background)
        renderer.setScissor(0, 0, width, height);
        renderer.setViewport(0, 0, width, height);
        // Set Editor Background Color (Dark Grey)
        renderer.setClearColor(0x1a1a1a, 1);
        renderer.clear(); // Clear color and depth with new color

        // Render Views
        // 1. Top View (XZ)
        this.renderView(this.ui.viewTop, this.cameraTop, true, this.gridXZ);
        // 2. 3D View (Perspective) - Show XZ Grid
        this.renderView(this.ui.view3d, this.game.camera, false, this.gridXZ);
        // 3. Front View (XY)
        this.renderView(this.ui.viewFront, this.cameraFront, true, this.gridXY);
        // 4. Side View (ZY)
        this.renderView(this.ui.viewSide, this.cameraSide, true, this.gridZY);


        // renderer.setScissorTest(false); // Done in exit() or handled by next frame init? 
        // Game loop might expect it off if it renders UI overlay, but we are inside Game Loop.
    }

    private renderView(container: HTMLDivElement, camera: THREE.Camera, wireframe: boolean, grid: THREE.GridHelper | null) {
        const renderer = this.game.renderer;
        renderer.autoClear = false; // Important for overlay

        // Get Screen Coordinates of the view
        const rect = container.getBoundingClientRect();

        // Convert to WebGL coordinates (Y-up)
        // windowY is top-down. glY is bottom-up.
        const width = rect.width;
        const height = rect.height;
        const left = rect.left;
        const bottom = window.innerHeight - rect.bottom;

        if (width <= 0 || height <= 0) return;

        renderer.setViewport(left, bottom, width, height);
        renderer.setScissor(left, bottom, width, height);

        // Update Ortho Camera Aspect
        if (camera instanceof THREE.OrthographicCamera) {
            const aspect = width / height;
            // frustumSize is controlled by zoom in Controls

            // Recalculate based on current zoom and aspect
            /*
            camera.left = -frustumSize * aspect / 2;
            camera.right = frustumSize * aspect / 2;
            camera.top = frustumSize / 2;
            camera.bottom = -frustumSize / 2;
            camera.updateProjectionMatrix();
            */
            // Actually OrthoCameraControls modifies .zoom, so we just need to set aspect ratio relative bounds

            const viewSize = 100; // Base size
            camera.left = -viewSize * aspect / 2;
            camera.right = viewSize * aspect / 2;
            camera.top = viewSize / 2;
            camera.bottom = -viewSize / 2;
            camera.updateProjectionMatrix();
        } else if (camera instanceof THREE.PerspectiveCamera) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }

        // Render
        if (wireframe) {
            this.game.scene.overrideMaterial = this.wireframeMaterial;
            renderer.render(this.game.scene, camera);
            this.game.scene.overrideMaterial = null;
        } else {
            renderer.render(this.game.scene, camera);
        }

        // Render Grid
        if (grid) {
            // Hide others
            this.gridXZ.visible = false;
            this.gridXY.visible = false;
            this.gridZY.visible = false;

            grid.visible = true;
            renderer.clearDepth(); // Ensure grid draws on top
            renderer.render(this.helperScene, camera);
        }
    }

    public getNDC(container: HTMLElement, event: MouseEvent): THREE.Vector2 {
        const rect = container.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        return new THREE.Vector2(x, y);
    }


    // Bindings
    private boundMouseDown: (e: MouseEvent) => void;
    private boundMouseUp: (e: MouseEvent) => void;
    private boundMouseMove: (e: MouseEvent) => void;

    // Helper to get Context from Event
    private getEventContext(e: MouseEvent): { camera: THREE.Camera, ndc: THREE.Vector2, viewport: HTMLElement } {
        // Default to 3D view if unknown (e.g. mouseup/move outside)
        // But for MouseDown, we know the target.
        // For MouseMove, if dragging, we want to continue using the STARTED viewport context if possible?
        // Or if we move mouse over another view, do we switch context?
        // Standard behavior: Drag operation (Select Box, Brush creation) is tied to the INITIAL viewport.
        // So we should store `activeViewport` on MouseDown.

        let target = e.target as HTMLElement;

        // If target is child (label), go up
        while (target && target !== this.ui.view3d && target !== this.ui.viewTop && target !== this.ui.viewFront && target !== this.ui.viewSide && target !== document.body) {
            target = target.parentElement as HTMLElement;
        }

        // Identify Camera
        let camera: THREE.Camera = this.game.camera; // Default
        let viewport = this.ui.view3d;

        if (target === this.ui.viewTop) {
            camera = this.cameraTop;
            viewport = this.ui.viewTop;
        } else if (target === this.ui.viewFront) {
            camera = this.cameraFront;
            viewport = this.ui.viewFront;
        } else if (target === this.ui.viewSide) {
            camera = this.cameraSide;
            viewport = this.ui.viewSide;
        } else {
            // Fallback: If event happened on document (mousemove), use 3D view or last active?
            // For now default to 3D view
            camera = this.game.camera;
            viewport = this.ui.view3d;
        }

        // Calculate NDC
        const ndc = this.ui.getNDC(viewport, e);
        return { camera, ndc, viewport };
    }

    // State to track dragging context
    private activeViewport: HTMLElement | null = null;
    private activeCamera: THREE.Camera | null = null;

    private onMouseDown(e: MouseEvent): void {
        if (!this.active) return;

        const ctx = this.getEventContext(e);
        this.activeViewport = ctx.viewport;
        this.activeCamera = ctx.camera;

        if (this.currentTool) this.currentTool.onMouseDown(e, ctx.camera, ctx.ndc);
    }

    private onMouseUp(e: MouseEvent): void {
        if (!this.active) return;

        // Use active viewport if dragging
        let camera = this.activeCamera || this.game.camera;
        let viewport = this.activeViewport || this.ui.view3d;

        // Or check where mouse is NOW? 
        // Tools usually care about where drag ENDS relative to START?
        // Let's use current mouse position relative to START viewport for consistency
        const ndc = this.ui.getNDC(viewport, e);

        if (this.currentTool) this.currentTool.onMouseUp(e, camera, ndc);

        this.activeViewport = null;
        this.activeCamera = null;
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.active) return;

        // If dragging, use strict context
        let camera = this.activeCamera;
        let viewport = this.activeViewport;

        // If NOT dragging (hover), find context under mouse
        if (!camera) {
            const ctx = this.getEventContext(e);
            camera = ctx.camera;
            viewport = ctx.viewport;
        }

        const ndc = this.ui.getNDC(viewport!, e); // bang ok because fallback exists
        if (this.currentTool) this.currentTool.onMouseMove(e, camera!, ndc);
    }

    public isActive(): boolean {
        return this.active;
    }

    public getGame(): Game {
        return this.game;
    }
}
