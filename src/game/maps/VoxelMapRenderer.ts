import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { VoxelMap, BlockType } from './VoxelMap';

export class VoxelMapRenderer {
    private game: Game;
    private map: VoxelMap;
    private materials: Map<BlockType, THREE.Material>;

    // Reusable geometry
    private boxGeo: THREE.BoxGeometry;

    constructor(game: Game, map: VoxelMap) {
        this.game = game;
        this.map = map;
        this.materials = new Map();

        const scale = this.map.scale;
        this.boxGeo = new THREE.BoxGeometry(scale, scale, scale);

        this.initMaterials();
    }

    private initMaterials() {
        const loadTex = (color: number) => new THREE.MeshStandardMaterial({ color });

        this.materials.set(BlockType.CONCRETE, loadTex(0x888888));
        this.materials.set(BlockType.BRICK, loadTex(0xa05040));
        this.materials.set(BlockType.WOOD_PLANKS, loadTex(0x8b5a2b));
        this.materials.set(BlockType.GRASS, loadTex(0x44aa44));
        this.materials.set(BlockType.DIRT, loadTex(0x6b4423));
        this.materials.set(BlockType.STONE, loadTex(0x555555));
        this.materials.set(BlockType.METAL, loadTex(0xaaaaaa));
        this.materials.set(BlockType.CRATE, loadTex(0xcda434));
    }

    public render() {
        // Naive rendering: One mesh per block (InstancedMesh would be better for performance, but keeping it simple for now)
        // Optimization: Simple face culling (don't create mesh if surrounded? No, we need physics)
        // Actually, for physics we definitely want to merge or use individual bodies? 
        // Individual bodies for everything is too heavy.
        // Let's do individual meshes + individual static bodies for now. It's easiest to implement.
        // Optimization Step 1: Only render visible blocks? 
        // Optimization Step 2: Merge adjacent blocks?

        // Let's implement primitive "hidden face culling" logic strictly for visuals if we were building custom geometry.
        // But since we are using separate BoxGeometries, we can't easily hide faces without custom BufferGeometry generation.
        // For this POC, let's just spawn boxes.

        const blocks = this.map.getAllBlocks();
        const scale = this.map.scale;
        const halfScale = scale / 2;

        for (const block of blocks) {
            if (block.type === BlockType.AIR || block.type === BlockType.SPAWN_POINT) continue;

            // Check if hidden (surrounded on all 6 sides)
            if (this.isOccluded(block.x, block.y, block.z)) {
                // Still need physics though? 
                // If it's completely surrounded by solid blocks, you can't touch it, so no physics needed.
                continue;
            }

            const worldPos = this.map.getWorldPosition(block.x, block.y, block.z);

            // Visuals
            const mat = this.materials.get(block.type) || this.materials.get(BlockType.CONCRETE)!;
            const mesh = new THREE.Mesh(this.boxGeo, mat);
            mesh.position.copy(worldPos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.game.scene.add(mesh);

            // Physics
            // Note: Heavy for large maps. Should use Trimesh or compound body later.
            const shape = new CANNON.Box(new CANNON.Vec3(halfScale, halfScale, halfScale));
            const body = new CANNON.Body({
                mass: 0, // Static
                position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
                shape: shape
            });
            this.game.world.addBody(body);
        }
    }

    private isOccluded(x: number, y: number, z: number): boolean {
        // Check 6 neighbors
        return (
            this.isSolid(x + 1, y, z) &&
            this.isSolid(x - 1, y, z) &&
            this.isSolid(x, y + 1, z) &&
            this.isSolid(x, y - 1, z) &&
            this.isSolid(x, y, z + 1) &&
            this.isSolid(x, y, z - 1)
        );
    }

    private isSolid(x: number, y: number, z: number): boolean {
        const block = this.map.getBlock(x, y, z);
        return block !== undefined && block.type !== BlockType.AIR && block.type !== BlockType.SPAWN_POINT;
    }
}
