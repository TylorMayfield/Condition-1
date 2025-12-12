

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { VmfMap, VmfSolid } from './VmfParser';
import { VmfGeometryBuilder } from './VmfGeometryBuilder';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DevTextureGenerator } from '../utils/DevTextureGenerator';

export class VmfWorldBuilder {
    private scene: THREE.Scene;
    private world: CANNON.World;
    private material: THREE.Material;

    constructor(scene: THREE.Scene, world: CANNON.World) {
        this.scene = scene;
        this.world = world;

        // Default material for map geometry - OPTIMIZED
        this.material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.8,
            map: DevTextureGenerator.getTexture('concrete', {
                color: 0x888888,
                text: 'DEV',
                width: 512,
                height: 512,
                gridSize: 64
            }),
            side: THREE.DoubleSide // Need DoubleSide for VMF geometry with mixed normals
        });
        this.material.needsUpdate = false; // Static material
    }

    private materialsCache: Map<string, THREE.Material> = new Map();

    /**
     * Build options for VmfWorldBuilder
     */
    public build(mapData: VmfMap, options?: { forNavmesh?: boolean }) {
        const forNavmesh = options?.forNavmesh ?? false;
        console.log(`VmfWorldBuilder: Building map version ${mapData.version}${forNavmesh ? ' (for navmesh)' : ''}`);

        // Chunking
        const CHUNK_SIZE = 20;

        // Visuals: Chunk -> Material -> Geometries[]
        const visualChunkMap = new Map<string, Map<string, THREE.BufferGeometry[]>>();

        // Physics: Chunk -> Geometries[]
        const physicsChunkMap = new Map<string, THREE.BufferGeometry[]>();

        const ALWAYS_IGNORED = [
            'TOOLS/TOOLSTRIGGER',
            'TOOLS/TOOLSFOG',
            'TOOLS/TOOLSLIGHT',
            'TOOLS/TOOLSAREAPORTAL',
            'TOOLS/TOOLSOCCLUDER',
            'TOOLS/TOOLSSKIP',
            'TOOLS/TOOLSHINT'
        ];

        // When building for navmesh, include CLIP and NODRAW as they represent collision geometry
        const VISUAL_IGNORED = forNavmesh ? [
            'TOOLS/TOOLSSKIP',
            'TOOLS/TOOLSHINT',
            'TOOLS/TOOLSSKYBOX',
            'TOOLS/TOOLSORIGIN'
        ] : [
            'TOOLS/TOOLSNODRAW',
            'TOOLS/TOOLSCLIP',
            'TOOLS/TOOLSSKIP',
            'TOOLS/TOOLSHINT',
            'TOOLS/TOOLSSKYBOX',
            'TOOLS/TOOLSORIGIN'
        ];

        const PHYSICS_IGNORED = [
            'TOOLS/TOOLSSKYBOX', // Don't collide with sky
            // NODRAW and CLIP are VALID for physics, so don't ignore them here
            'TOOLS/TOOLSORIGIN'
        ];

        const processGeometry = (geos: Array<{ material: string, geometry: THREE.BufferGeometry, isDisplacement: boolean }>, enablePhysicsForThisSolid: boolean) => {
            for (const { material, geometry, isDisplacement } of geos) {
                // Scale first
                geometry.scale(0.02, 0.02, 0.02);
                geometry.computeBoundingBox();
                if (!geometry.boundingBox) continue;

                const center = new THREE.Vector3();
                geometry.boundingBox.getCenter(center);
                const chunkX = Math.floor(center.x / CHUNK_SIZE);
                const chunkY = Math.floor(center.y / CHUNK_SIZE);
                const chunkZ = Math.floor(center.z / CHUNK_SIZE);
                const chunkKey = `${chunkX},${chunkY},${chunkZ}`;

                const matUpper = material.toUpperCase();

                // 1. Visuals
                const isVisual = !VISUAL_IGNORED.some(ign => matUpper.includes(ign));
                if (isVisual) {
                    if (!visualChunkMap.has(chunkKey)) {
                        visualChunkMap.set(chunkKey, new Map());
                    }
                    const matMap = visualChunkMap.get(chunkKey)!;

                    // OPTIMIZATION: Group by Material Type instead of raw name
                    // Resolve the type now to use as the batching key
                    const type = this.resolveTextureType(material);
                    const key = isDisplacement ? `${type}_DISP` : type;

                    if (!matMap.has(key)) matMap.set(key, []);
                    matMap.get(key)!.push(geometry);
                }

                // 2. Physics (Merged by chunk, ignore material)
                const isPhysicsMaterial = !PHYSICS_IGNORED.some(ign => matUpper.includes(ign));

                if (enablePhysicsForThisSolid && isPhysicsMaterial) {
                    if (!physicsChunkMap.has(chunkKey)) {
                        physicsChunkMap.set(chunkKey, []);
                    }
                    physicsChunkMap.get(chunkKey)!.push(geometry);
                }
            }
        };

        // 1. World Solids
        console.log('VmfWorldBuilder: Processing World Solids...');
        if (mapData.world && mapData.world.solids) {
            for (const solid of mapData.world.solids) {
                // Pass "ALWAYS_IGNORED" so we get NODRAW faces back
                const geos = VmfGeometryBuilder.buildSolidGeometry(solid, true, ALWAYS_IGNORED);
                processGeometry(geos, true); // World solids always contribute to physics
            }
        }

        // 2. Entity Solids
        console.log('VmfWorldBuilder: Processing Entity Solids...');
        for (const entity of mapData.entities) {
            if (entity.solids && entity.solids.length > 0) {
                const isIllusionary = entity.classname === 'func_illusionary';
                const isNonSolidBrush = entity.classname === 'func_brush' && entity.properties['solidity'] === '1';

                const isTrigger = entity.classname.startsWith('trigger_') ||
                    entity.classname === 'func_buyzone' ||
                    entity.classname === 'func_bomb_target' ||
                    entity.classname === 'func_hostage_rescue' ||
                    entity.classname === 'func_water';

                const enablePhysicsForThisEntity = !isIllusionary && !isNonSolidBrush && !isTrigger;

                for (const solid of entity.solids) {
                    const geos = VmfGeometryBuilder.buildSolidGeometry(solid, true, ALWAYS_IGNORED);
                    processGeometry(geos, enablePhysicsForThisEntity);
                }
            }
        }

        // 3. Create Visual Meshes
        let totalMeshes = 0;
        for (const [chunkKey, matMap] of visualChunkMap) {
            for (const [matKey, geometries] of matMap) {
                if (geometries.length === 0) continue;

                // matKey is now the TYPE (e.g. 'concrete' or 'concrete_DISP')
                const isDisplacement = matKey.endsWith('_DISP');
                const matType = isDisplacement ? matKey.replace('_DISP', '') : matKey;

                const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
                if (merged) {
                    merged.computeVertexNormals();
                    merged.computeBoundingSphere(); // Critical for frustum culling

                    // Get material for the TYPE directly
                    let material = this.getMaterialForType(matType);

                    // If displacement, clone material to apply polygon offset
                    if (isDisplacement) {
                        material = material.clone();
                        material.polygonOffset = true;
                        material.polygonOffsetFactor = -1; // Draw closer
                        material.polygonOffsetUnits = -1;
                    }

                    const mesh = new THREE.Mesh(merged, material);

                    mesh.name = `Map_${chunkKey}_${matKey}`;
                    mesh.frustumCulled = true;
                    // Optimization: Only update matrix once
                    mesh.matrixAutoUpdate = false;
                    mesh.updateMatrix();

                    // Shadows
                    mesh.castShadow = true;
                    // Displacements might not want to self-shadow as much if flat, but general rule is OK
                    mesh.receiveShadow = true;

                    this.scene.add(mesh);
                    totalMeshes++;
                }
            }
        }
        console.log(`VmfWorldBuilder: Created ${totalMeshes} merged visual meshes.`);

        // 4. Create Physics Bodies (Merged)
        let totalPhysicsBodies = 0;
        for (const [chunkKey, geometries] of physicsChunkMap) {
            if (geometries.length === 0) continue;

            const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
            if (!merged) continue;

            const position = merged.attributes.position;
            const vertices: number[] = [];
            const indices: number[] = [];

            // Convert to Cannon Trimesh (Indexed)
            // Naive approach: Just dump all triangles (unindexed if merged is unindexed, or use index)
            if (merged.index) {
                // Indexed geometry
                for (let i = 0; i < position.count; i++) {
                    vertices.push(position.getX(i), position.getY(i), position.getZ(i));
                }
                for (let i = 0; i < merged.index.count; i++) {
                    indices.push(merged.index.getX(i));
                }
            } else {
                // Non-indexed (triangle soup)
                for (let i = 0; i < position.count; i++) {
                    vertices.push(position.getX(i), position.getY(i), position.getZ(i));
                    indices.push(i);
                }
            }

            if (indices.length >= 3) {
                const shape = new CANNON.Trimesh(vertices, indices);
                const body = new CANNON.Body({
                    mass: 0,
                    shape: shape,
                    collisionFilterGroup: 1, // World Group
                    collisionFilterMask: -1 // Collide with everything
                });
                this.world.addBody(body);
                totalPhysicsBodies++;
            }
        }
        console.log(`VmfWorldBuilder: Created ${totalPhysicsBodies} merged physics bodies.`);

    }

    private resolveTextureType(textureName: string): string {
        // FUZZY MATCHING LOGIC
        const lowerName = textureName.toLowerCase();

        // Define keywords mapping to Dev Texture Types
        const keywords: Record<string, string> = {
            'concrete': 'concrete',
            'crete': 'concrete',
            'cement': 'concrete',
            'floor': 'concrete',
            'wood': 'wood',
            'crate': 'crate',
            'crt': 'crate',
            'box': 'crate',
            'brick': 'brick',
            'metal': 'metal',
            'steel': 'metal',
            'iron': 'metal',
            'wall': 'wall',
            'stone': 'stone',
            'rock': 'stone',
            'aaatrigger': 'glass',
            'glass': 'glass',
            'window': 'glass',
            'grass': 'grass',
            'dirt': 'dirt',
            'ground': 'dirt',
            'sand': 'sand',
            'desert': 'sand',
            'dust': 'sand',
            'carpet': 'carpet',
            'rug': 'carpet',
            'tile': 'tile'
        };

        for (const [key, type] of Object.entries(keywords)) {
            if (lowerName.includes(key)) {
                return type;
            }
        }

        return 'concrete'; // Default
    }

    private getMaterialForType(type: string): THREE.Material {
        if (this.materialsCache.has(type)) {
            return this.materialsCache.get(type)!;
        }

        // Material Creation
        let mat: THREE.Material;

        if (type === 'glass') {
            // Simplified Glass (Standard Material)
            mat = new THREE.MeshStandardMaterial({
                color: 0x66aaff, // Blue-ish tint
                transparent: true,
                opacity: 0.3,
                roughness: 0.2,
                metalness: 0.8, // Reflective
                side: THREE.DoubleSide // Important for glass panes
            });
        } else {
            // Generate texture
            const tex = DevTextureGenerator.getTexture(type, {
                text: type.toUpperCase(),
                width: 512,
                height: 512,
                gridSize: 64,
                color: this.getColorForType(type)
            });

            mat = new THREE.MeshStandardMaterial({
                map: tex,
                color: 0xffffff,
                roughness: 0.8,
                side: THREE.FrontSide // Standard for solids
            });
        }

        this.materialsCache.set(type, mat);
        return mat;
    }

    private getColorForType(type: string): number {
        const colors: Record<string, number> = {
            concrete: 0x888888,
            brick: 0xa05040,
            wood: 0x8b5a2b,
            metal: 0xaaaaaa,
            grass: 0x44aa44,
            dirt: 0x6b4423,
            stone: 0x555555,
            crate: 0xcda434,
            glass: 0x88ccff,
            carpet: 0x800020,
            sand: 0xE6CFA1, // Desert Sand
            wall: 0xAAAAAA, // Light Grey
            tile: 0xCCCCCC  // Off-white
        };
        return colors[type] || 0x888888;
    }

}
