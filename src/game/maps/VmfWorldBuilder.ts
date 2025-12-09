
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { VmfMap, VmfEntity, VmfSolid } from './VmfParser';
import { VmfGeometryBuilder } from './VmfGeometryBuilder';

export class VmfWorldBuilder {
    private scene: THREE.Scene;
    private world: CANNON.World;
    private material: THREE.Material;

    constructor(scene: THREE.Scene, world: CANNON.World) {
        this.scene = scene;
        this.world = world;

        // Default material for map geometry
        this.material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.8,
            map: this.createDevTexture(),
            side: THREE.DoubleSide
        });
    }

    public build(mapData: VmfMap) {
        console.log(`VmfWorldBuilder: Building map version ${mapData.version}`);

        // 1. World Solids
        if (mapData.world && mapData.world.solids) {
            console.log(`Processing ${mapData.world.solids.length} world solids.`);
            for (const solid of mapData.world.solids) {
                this.processSolid(solid, true);
            }
        }

        // 2. Entities
        for (const entity of mapData.entities) {
            this.processEntity(entity);
        }
    }

    private processEntity(entity: VmfEntity) {
        // Handle Brush Entities (func_detail, func_wall, etc)
        if (entity.solids && entity.solids.length > 0) {
            // Filter non-solid entities
            const isIllusionary = entity.classname === 'func_illusionary';
            const isNonSolidBrush = entity.classname === 'func_brush' && entity.properties['solidity'] === '1'; // 1 = Never Solid
            const shouldCreatePhysics = !isIllusionary && !isNonSolidBrush;

            for (const solid of entity.solids) {
                this.processSolid(solid, shouldCreatePhysics);
            }
        }
    }

    private processSolid(solid: VmfSolid, enablePhysics: boolean) {
        // --- 1. Physics ---
        if (enablePhysics) {
            const PHYSICS_IGNORED = [
                'TOOLS/TOOLSTRIGGER',
                'TOOLS/TOOLSSKIP',
                'TOOLS/TOOLSHINT',
                'TOOLS/TOOLSORIGIN', // Origin brushes are just points
                'TOOLS/TOOLSFOG',
                'TOOLS/TOOLSLIGHT',
                'TOOLS/TOOLSAREAPORTAL', // Open portals shouldn't block, usually.
                'TOOLS/TOOLSOCCLUDER'
            ];

            const physicsGeo = VmfGeometryBuilder.buildSolidGeometry(solid, true, PHYSICS_IGNORED);

            if (physicsGeo.attributes.position && physicsGeo.attributes.position.count > 0) {
                // Apply Scale
                physicsGeo.scale(0.02, 0.02, 0.02); // 1 HU = 0.02m (approx)

                // Create Trimesh for accurate collision (Static World/Entity preferred)
                // ConvexPolyhedron can be finicky with winding/topology from raw triangles.
                const posAttr = physicsGeo.attributes.position;

                // Trimesh expects flat vertices array and flat indices array
                const vertices: number[] = [];
                const indices: number[] = [];

                // We map unique vertices to indices to optimize the Trimesh
                const vertsMap = new Map<string, number>();

                for (let i = 0; i < posAttr.count; i++) {
                    const x = posAttr.getX(i);
                    const y = posAttr.getY(i);
                    const z = posAttr.getZ(i);
                    // Use fixed precision key to merge close vertices
                    const key = `${x.toFixed(4)}_${y.toFixed(4)}_${z.toFixed(4)}`;

                    let index = vertsMap.get(key);
                    if (index === undefined) {
                        index = vertices.length / 3;
                        vertsMap.set(key, index);
                        vertices.push(x, y, z);
                    }
                    indices.push(index);
                }

                if (indices.length >= 3) {
                    const shape = new CANNON.Trimesh(vertices, indices);
                    const body = new CANNON.Body({
                        mass: 0, // static
                        position: new CANNON.Vec3(0, 0, 0), // Vertices are already world-space
                        shape: shape
                    });
                    this.world.addBody(body);
                }
            }
        }

        // --- 2. Visuals ---
        const VISUAL_IGNORED = [
            'TOOLS/TOOLSCLIP',
            'TOOLS/TOOLSTRIGGER',
            'TOOLS/TOOLSSKIP',
            'TOOLS/TOOLSHINT',
            'TOOLS/TOOLSORIGIN',
            'TOOLS/TOOLSFOG',
            'TOOLS/TOOLSLIGHT',
            'TOOLS/TOOLSAREAPORTAL',
            'TOOLS/TOOLSOCCLUDER',
            'TOOLS/TOOLSNODRAW',
            'TOOLS/TOOLSSKYBOX'
        ];

        const visualGeo = VmfGeometryBuilder.buildSolidGeometry(solid, true, VISUAL_IGNORED);
        if (visualGeo.attributes.position && visualGeo.attributes.position.count > 0) {
            visualGeo.scale(0.02, 0.02, 0.02);
            visualGeo.computeVertexNormals(); // Ensure lighting works
            const mesh = new THREE.Mesh(visualGeo, this.material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        }
    }

    private createDevTexture(): THREE.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;

        // Background
        ctx.fillStyle = '#444';
        ctx.fillRect(0, 0, 64, 64);

        // Grid
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 64, 64);

        ctx.fillStyle = '#555';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DEV', 32, 24);
        ctx.fillText('TEX', 32, 40);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }
}
