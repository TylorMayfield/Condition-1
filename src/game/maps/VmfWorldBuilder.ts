

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
            map: this.createDevTexture(),
            side: THREE.DoubleSide // Need DoubleSide for VMF geometry with mixed normals
        });
        this.material.needsUpdate = false; // Static material
    }

    private materialsCache: Map<string, THREE.Material> = new Map();

    public build(mapData: VmfMap) {
        console.log(`VmfWorldBuilder: Building map version ${mapData.version}`);

        // Store geometries by Chunk -> Material -> Geometries[]
        // Map<ChunkKey, Map<MaterialName, BufferGeometry[]>>
        const chunkMap = new Map<string, Map<string, THREE.BufferGeometry[]>>();
        const CHUNK_SIZE = 20;

        const processVisuals = (geos: Array<{ material: string, geometry: THREE.BufferGeometry }>) => {
            for (const { material, geometry } of geos) {
                // Scale first
                geometry.scale(0.02, 0.02, 0.02);

                geometry.computeBoundingBox();
                if (!geometry.boundingBox) continue;

                // Determine chunk
                const center = new THREE.Vector3();
                geometry.boundingBox.getCenter(center);
                const chunkX = Math.floor(center.x / CHUNK_SIZE);
                const chunkY = Math.floor(center.y / CHUNK_SIZE);
                const chunkZ = Math.floor(center.z / CHUNK_SIZE);
                const chunkKey = `${chunkX},${chunkY},${chunkZ}`;

                // Add to structure
                if (!chunkMap.has(chunkKey)) {
                    chunkMap.set(chunkKey, new Map());
                }
                const matMap = chunkMap.get(chunkKey)!;
                if (!matMap.has(material)) {
                    matMap.set(material, []);
                }
                matMap.get(material)!.push(geometry);
            }
        };

        // 1. World Solids
        if (mapData.world && mapData.world.solids) {
            for (const solid of mapData.world.solids) {
                this.createPhysicsForSolid(solid);
                const geos = VmfGeometryBuilder.buildSolidGeometry(solid, true);
                processVisuals(geos);
            }
        }

        // 2. Entity Solids
        for (const entity of mapData.entities) {
            if (entity.solids && entity.solids.length > 0) {
                const isIllusionary = entity.classname === 'func_illusionary';
                const isNonSolidBrush = entity.classname === 'func_brush' && entity.properties['solidity'] === '1';
                const shouldCreatePhysics = !isIllusionary && !isNonSolidBrush;

                for (const solid of entity.solids) {
                    if (shouldCreatePhysics) this.createPhysicsForSolid(solid);
                    const geos = VmfGeometryBuilder.buildSolidGeometry(solid, true);
                    processVisuals(geos);
                }
            }
        }

        // 3. Merge and Create Meshes
        let totalMeshes = 0;
        for (const [chunkKey, matMap] of chunkMap) {
            for (const [matName, geometries] of matMap) {
                if (geometries.length === 0) continue;

                const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
                if (merged) {
                    merged.computeVertexNormals();

                    const material = this.getMaterialForTexture(matName);
                    const mesh = new THREE.Mesh(merged, material);

                    mesh.name = `Map_${chunkKey}_${matName}`;
                    mesh.frustumCulled = true;
                    // Optimization: Only update matrix once
                    mesh.matrixAutoUpdate = false;
                    mesh.updateMatrix();

                    // Shadows
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    this.scene.add(mesh);
                    totalMeshes++;
                }
            }
        }

        console.log(`VmfWorldBuilder: Created ${totalMeshes} merged meshes.`);
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
            'cement': 'concrete',
            'floor': 'concrete',
            'wood': 'wood',
            'crate': 'crate',
            'brick': 'brick',
            'metal': 'metal',
            'steel': 'metal',
            'wall': 'wall', // generic, map to concrete/wall? Let's use concrete or a new WALL type.
            'stone': 'stone',
            'rock': 'stone',
            'glass': 'glass',
            'window': 'glass',
            'grass': 'grass',
            'dirt': 'dirt',
            'ground': 'dirt',
            'carpet': 'carpet',
            'rug': 'carpet'
        };

        for (const [key, type] of Object.entries(keywords)) {
            if (lowerName.includes(key)) {
                matchedType = type;
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
            mat = new THREE.MeshPhysicalMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.4,
                roughness: 0.1,
                metalness: 0.1,
                transmission: 0.9,
                thickness: 0.1
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
                roughness: 0.8
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
            carpet: 0x800020
        };
        return colors[type] || 0x888888;
    }

    private createPhysicsForSolid(solid: VmfSolid) {
        const PHYSICS_IGNORED = [
            'TOOLS/TOOLSTRIGGER',
            'TOOLS/TOOLSSKIP',
            'TOOLS/TOOLSHINT',
            'TOOLS/TOOLSORIGIN',
            'TOOLS/TOOLSFOG',
            'TOOLS/TOOLSLIGHT',
            'TOOLS/TOOLSAREAPORTAL',
            'TOOLS/TOOLSOCCLUDER'
        ];

        // Physics uses old single-geo return
        // We need to support the new array return format
        const geos = VmfGeometryBuilder.buildSolidGeometry(solid, true, PHYSICS_IGNORED);

        for (const { geometry } of geos) {
            if (geometry.attributes.position && geometry.attributes.position.count > 0) {
                geometry.scale(0.02, 0.02, 0.02);
                const posAttr = geometry.attributes.position;

                const vertices: number[] = [];
                const indices: number[] = [];
                const vertsMap = new Map<string, number>();

                for (let i = 0; i < posAttr.count; i++) {
                    const x = posAttr.getX(i);
                    const y = posAttr.getY(i);
                    const z = posAttr.getZ(i);
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
                        mass: 0,
                        position: new CANNON.Vec3(0, 0, 0),
                        shape: shape
                    });
                    this.world.addBody(body);
                }
            }
        }
    }

    // Removed createDevTexture method as it is replaced by DevTextureGenerator usage

}
