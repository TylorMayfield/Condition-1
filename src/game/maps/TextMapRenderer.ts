import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { TextMap, TextBlockType } from './TextMap';
import type { TextMapBrush } from './TextMap';
import { DestructibleWall } from '../components/DestructibleWall';

/**
 * Renderer for TextMap format.
 * Creates Three.js meshes and Cannon.js physics bodies from a TextMap.
 */
export class TextMapRenderer {
    private game: Game;
    private map: TextMap;
    private materials: Map<TextBlockType, THREE.Material>;

    // Reusable geometry
    private boxGeo: THREE.BoxGeometry;

    constructor(game: Game, map: TextMap) {
        this.game = game;
        this.map = map;
        this.materials = new Map();

        const scale = this.map.scale;
        this.boxGeo = new THREE.BoxGeometry(scale, scale, scale);

        this.initMaterials();
    }

    /**
     * Initialize materials for each block type.
     */
    private initMaterials(): void {
        const loadTex = (color: number) => new THREE.MeshStandardMaterial({ color });

        this.materials.set(TextBlockType.CONCRETE, loadTex(0x888888));
        this.materials.set(TextBlockType.BRICK, loadTex(0xa05040));
        this.materials.set(TextBlockType.WOOD_PLANKS, loadTex(0x8b5a2b));
        this.materials.set(TextBlockType.GRASS, loadTex(0x44aa44));
        this.materials.set(TextBlockType.DIRT, loadTex(0x6b4423));
        this.materials.set(TextBlockType.STONE, loadTex(0x555555));
        this.materials.set(TextBlockType.METAL, loadTex(0xaaaaaa));
        this.materials.set(TextBlockType.CRATE, loadTex(0xcda434));
    }

    /**
     * Render the entire map.
     */
    public render(): void {
        // Render all blocks from layers
        this.renderBlocks();

        // Render brushes (stairs, ramps, etc.)
        this.renderBrushes();
    }

    /**
     * Render all blocks from the map layers.
     */
    private renderBlocks(): void {
        const blocks = this.map.getAllBlocks();
        const scale = this.map.scale;
        const halfScale = scale / 2;

        for (const block of blocks) {
            if (block.type === TextBlockType.AIR) continue;

            // Check if hidden (surrounded on all 6 sides) for occlusion culling
            if (this.isOccluded(block.x, block.y, block.z)) {
                continue;
            }

            const worldPos = this.map.getWorldPosition(block.x, block.y, block.z);

            // Visuals
            const mat = this.materials.get(block.type) || this.materials.get(TextBlockType.CONCRETE)!;
            const mesh = new THREE.Mesh(this.boxGeo, mat);
            mesh.position.copy(worldPos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.game.scene.add(mesh);

            // Physics (static body)
            const shape = new CANNON.Box(new CANNON.Vec3(halfScale, halfScale, halfScale));
            const body = new CANNON.Body({
                mass: 0, // Static
                position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
                shape: shape,
            });
            this.game.world.addBody(body);
        }
    }

    /**
     * Render brush geometry (stairs, ramps, boxes, etc.)
     */
    private renderBrushes(): void {
        const brushes = this.map.getBrushes();
        const scale = this.map.scale;

        for (const brush of brushes) {
            switch (brush.type) {
                case 'box':
                    this.renderBoxBrush(brush, scale);
                    break;
                case 'stairs':
                    this.renderStairsBrush(brush, scale);
                    break;
                case 'ramp':
                    this.renderRampBrush(brush, scale);
                    break;
                case 'cylinder':
                    this.renderCylinderBrush(brush, scale);
                    break;
            }
        }
    }

    /**
     * Render a box brush.
     */
    private renderBoxBrush(brush: TextMapBrush, scale: number): void {
        if (!brush.position || !brush.size) return;

        const worldPos = new THREE.Vector3(
            brush.position.x * scale,
            brush.position.y * scale + (brush.size.y * scale / 2),
            brush.position.z * scale
        );

        const size = new THREE.Vector3(
            brush.size.x * scale,
            brush.size.y * scale,
            brush.size.z * scale
        );

        if (brush.destructible) {
            // Create destructible wall
            new DestructibleWall(this.game, worldPos, size.x, size.y);
            return;
        }

        const go = new GameObject(this.game);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
            shape: shape,
        });

        // Visuals
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const color = brush.color || this.getMaterialColor(brush.material);
        const mat = new THREE.MeshStandardMaterial({ color });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(worldPos);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    /**
     * Render a stairs brush.
     */
    private renderStairsBrush(brush: TextMapBrush, scale: number): void {
        if (!brush.from || !brush.to) return;

        const from = new THREE.Vector3(
            brush.from.x * scale,
            brush.from.y * scale,
            brush.from.z * scale
        );

        const to = new THREE.Vector3(
            brush.to.x * scale,
            brush.to.y * scale,
            brush.to.z * scale
        );

        const heightDiff = to.y - from.y;
        const horizontalDist = Math.sqrt(
            Math.pow(to.x - from.x, 2) + Math.pow(to.z - from.z, 2)
        );

        const stepCount = Math.ceil(heightDiff / 0.3) || 5; // 0.3 units per step
        const stepHeight = heightDiff / stepCount;
        const stepDepth = horizontalDist / stepCount;
        const stepWidth = scale * 2; // Default step width

        const direction = new THREE.Vector3().subVectors(to, from).normalize();

        for (let i = 0; i < stepCount; i++) {
            const stepGo = new GameObject(this.game);

            const stepY = from.y + (i + 0.5) * stepHeight;
            const stepPos = from.clone().add(
                direction.clone().multiplyScalar((i + 0.5) * stepDepth)
            );
            stepPos.y = stepY;

            // Physics
            const stepShape = new CANNON.Box(new CANNON.Vec3(stepWidth / 2, stepHeight / 2, stepDepth / 2));
            stepGo.body = new CANNON.Body({
                mass: 0,
                position: new CANNON.Vec3(stepPos.x, stepPos.y, stepPos.z),
                shape: stepShape,
            });

            // Visuals
            const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
            const color = brush.color || this.getMaterialColor(brush.material);
            const stepMat = new THREE.MeshStandardMaterial({ color });
            stepGo.mesh = new THREE.Mesh(stepGeo, stepMat);
            stepGo.mesh.position.copy(stepPos);
            stepGo.mesh.castShadow = true;
            stepGo.mesh.receiveShadow = true;

            this.game.addGameObject(stepGo);
        }
    }

    /**
     * Render a ramp brush.
     */
    private renderRampBrush(brush: TextMapBrush, scale: number): void {
        if (!brush.position || !brush.size) return;

        const go = new GameObject(this.game);

        const worldPos = new THREE.Vector3(
            brush.position.x * scale,
            brush.position.y * scale + (brush.size.y * scale / 2),
            brush.position.z * scale
        );

        const size = new THREE.Vector3(
            brush.size.x * scale,
            brush.size.y * scale,
            brush.size.z * scale
        );

        const direction = brush.direction || 'north';
        let slopeAngle: number;
        let rotationAxis: 'x' | 'z';

        if (direction === 'north' || direction === 'south') {
            slopeAngle = Math.atan2(size.y, size.z);
            rotationAxis = 'x';
            if (direction === 'south') slopeAngle = -slopeAngle;
        } else {
            slopeAngle = Math.atan2(size.y, size.x);
            rotationAxis = 'z';
            if (direction === 'west') slopeAngle = -slopeAngle;
        }

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
            shape: shape,
        });

        if (rotationAxis === 'x') {
            go.body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), slopeAngle);
        } else {
            go.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), slopeAngle);
        }

        // Visuals
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const color = brush.color || this.getMaterialColor(brush.material);
        const mat = new THREE.MeshStandardMaterial({ color });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(worldPos);
        go.mesh.rotation[rotationAxis] = slopeAngle;
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    /**
     * Render a cylinder brush.
     */
    private renderCylinderBrush(brush: TextMapBrush, scale: number): void {
        if (!brush.position || !brush.size) return;

        const go = new GameObject(this.game);

        const worldPos = new THREE.Vector3(
            brush.position.x * scale,
            brush.position.y * scale + (brush.size.y * scale / 2),
            brush.position.z * scale
        );

        const radius = Math.max(brush.size.x, brush.size.z) * scale / 2;
        const height = brush.size.y * scale;

        // Physics
        const shape = new CANNON.Cylinder(radius, radius, height, 8);
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
            shape: shape,
        });

        // Visuals
        const geo = new THREE.CylinderGeometry(radius, radius, height, 16);
        const color = brush.color || this.getMaterialColor(brush.material);
        const mat = new THREE.MeshStandardMaterial({ color });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(worldPos);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    /**
     * Get color for a material name.
     */
    private getMaterialColor(material?: string): number {
        const colorMap: Record<string, number> = {
            'concrete': 0x888888,
            'brick': 0xa05040,
            'wood': 0x8b5a2b,
            'wood_planks': 0x8b5a2b,
            'grass': 0x44aa44,
            'dirt': 0x6b4423,
            'stone': 0x555555,
            'metal': 0xaaaaaa,
            'crate': 0xcda434,
        };

        return material ? (colorMap[material] || 0xcccccc) : 0xcccccc;
    }

    /**
     * Check if a block is fully occluded by neighbors (for culling).
     */
    private isOccluded(x: number, y: number, z: number): boolean {
        return (
            this.isSolid(x + 1, y, z) &&
            this.isSolid(x - 1, y, z) &&
            this.isSolid(x, y + 1, z) &&
            this.isSolid(x, y - 1, z) &&
            this.isSolid(x, y, z + 1) &&
            this.isSolid(x, y, z - 1)
        );
    }

    /**
     * Check if a position has a solid block.
     */
    private isSolid(x: number, y: number, z: number): boolean {
        const block = this.map.getBlock(x, y, z);
        return block !== undefined && block.type !== TextBlockType.AIR;
    }
}
