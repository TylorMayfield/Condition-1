

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
                    const key = isDisplacement ? `${material}_DISP` : material;

                    if (!matMap.has(key)) matMap.set(key, []);
                    matMap.get(key)!.push(geometry);
                }

                // 2. Physics (Merged by chunk, ignore material)
                // Note: We need a SEPARATE geometry copy for physics if it was used in visuals?
                // Actually, if we merge them later, cloning is safer or we use the same reference if not modified further.
                // But visuals will be merged into a visual mesh. Physics into a physics mesh.
                // BufferGeometryUtils.mergeGeometries creates a NEW geometry. So sharing the input geometry is fine.
                const isPhysicsMaterial = !PHYSICS_IGNORED.some(ign => matUpper.includes(ign));
                // Also ensure it's not a non-solid brush (handled by caller logic usually, but here filtering by texture)

                if (enablePhysicsForThisSolid && isPhysicsMaterial) {
                    if (!physicsChunkMap.has(chunkKey)) {
                        physicsChunkMap.set(chunkKey, []);
                    }
                    // Clone because we might merge differently? No, mergeGeometries doesn't consume inputs. 
                    // But to be safe against side effects (like disposal).
                    // Actually, if we use the same geometry instance in two merges, it is fine.
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
                // For func_brush, 'solidity' property determines if it's solid.
                // 0 = Solid, 1 = Nonsolid, 2 = Trigger.
                // We want physics if solidity is 0 (Solid) or undefined (default solid).
                const isNonSolidBrush = entity.classname === 'func_brush' && entity.properties['solidity'] === '1';

                // Triggers and Zones MUST be non-solid for physics
                const isTrigger = entity.classname.startsWith('trigger_') ||
                    entity.classname === 'func_buyzone' ||
                    entity.classname === 'func_bomb_target' ||
                    entity.classname === 'func_hostage_rescue' ||
                    entity.classname === 'func_water'; // Water is non-solid for standard RigidBody collision (handled differently)

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

                const isDisplacement = matKey.endsWith('_DISP');
                const matName = isDisplacement ? matKey.replace('_DISP', '') : matKey;

                const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
                if (merged) {
                    merged.computeVertexNormals();
                    merged.computeBoundingSphere(); // Critical for frustum culling

                    let material = this.getMaterialForTexture(matName);

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
                const body = new CANNON.Body({ mass: 0, shape: shape });
                this.world.addBody(body);
                totalPhysicsBodies++;
            }
        }
        console.log(`VmfWorldBuilder: Created ${totalPhysicsBodies} merged physics bodies.`);

    }

    private getMaterialForTexture(textureName: string): THREE.Material {
        if (this.materialsCache.has(textureName)) {
            return this.materialsCache.get(textureName)!;
        }

        // FUZZY MATCHING LOGIC
        const lowerName = textureName.toLowerCase();
        let matchedType = 'concrete'; // default

        // Define keywords mapping to Dev Texture Types
        const keywords: Record<string, string> = {
            'concrete': 'concrete',
            'crete': 'concrete', // "ducrt" matches "crt" so be careful. "DUSANDCRETE"
            'cement': 'concrete',
            'floor': 'concrete',
            'wood': 'wood',
            'crate': 'crate',
            'crt': 'crate', // e.g. DUCRTLRG
            'box': 'crate',
            'brick': 'brick',
            'metal': 'metal',
            'steel': 'metal',
            'iron': 'metal',
            'wall': 'wall',
            'stone': 'stone',
            'rock': 'stone',
            'aaatrigger': 'glass', // triggers often semi-transparent in dev
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
                matchedType = type;
                // Don't break immediately, let's see if we can prioritise?
                // Actually first match is fine for now if list is ordered roughly by specificity.
                // But 'concrete' is very generic.
                // 'DUSANDCRETE' contains 'sand' and 'crete'.
                // If 'crete' is first, it becomes concrete. If 'sand' is first, it becomes sand.
                // Let's rely on the order in the object above.
                break;
            }
        }

        // Use DevTextureGenerator
        // We can import it dynamically or assume it's available via global/import
        // Since we are in the same project structure, let's import it at top of file
        // (We need to add the import statement separately or inline the texture generation if simple)
        // Ideally we use the Generator. 

        // Use the existing one from BrushMapRenderer?
        // Let's create a new util import in the file imports section.

        // Placeholder for now: assuming default material with color
        // Actually, we should use the DevTextureGenerator.
        // Since I can't easily add the import in this REPLACEMENT block without changing the top of the file,
        // I will use a simple color fallback HERE, and then recommend adding the import.
        // WAIT, I can modify the whole file or just use the existing static method if I added the import.

        // Let's use the DevTextureGenerator
        // I will assume the import is added in a separate step or I will add it now if possible.
        // It's better to update the IMPORTS in a separate call or replace the whole file content if needed.
        // For this block, I will assume `DevTextureGenerator` is imported.

        // See 'BrushMapRenderer.ts' for usage
        // const texture = DevTextureGenerator.getTexture(matchedType, ...);

        // Note: usage of DevTextureGenerator requires import.
        // I will proceed assuming I will add the import next.

        // Material Creation
        let mat: THREE.Material;

        if (matchedType === 'glass') {
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
            const tex = DevTextureGenerator.getTexture(matchedType, {
                text: matchedType.toUpperCase(),
                width: 512,
                height: 512,
                gridSize: 64,
                color: this.getColorForType(matchedType)
            });

            mat = new THREE.MeshStandardMaterial({
                map: tex,
                color: 0xffffff,
                roughness: 0.8,
                side: THREE.FrontSide // Standard for solids
            });
        }

        this.materialsCache.set(textureName, mat);
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
