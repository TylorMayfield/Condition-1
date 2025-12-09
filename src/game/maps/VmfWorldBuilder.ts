

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { VmfMap, VmfSolid } from './VmfParser';
import { VmfGeometryBuilder } from './VmfGeometryBuilder';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

    public build(mapData: VmfMap) {
        console.log(`VmfWorldBuilder: Building map version ${mapData.version}`);

        // CRITICAL PERFORMANCE FIX: Merge all geometry into ONE mesh
        const geometries: THREE.BufferGeometry[] = [];

        // 1. Collect World Solids
        if (mapData.world && mapData.world.solids) {
            console.log(`Processing ${mapData.world.solids.length} world solids.`);
            for (const solid of mapData.world.solids) {
                this.createPhysicsForSolid(solid);
                const geo = this.getVisualGeometry(solid);
                if (geo) geometries.push(geo);
            }
        }

        // 2. Collect Entity Solids
        for (const entity of mapData.entities) {
            if (entity.solids && entity.solids.length > 0) {
                const isIllusionary = entity.classname === 'func_illusionary';
                const isNonSolidBrush = entity.classname === 'func_brush' && entity.properties['solidity'] === '1';
                const shouldCreatePhysics = !isIllusionary && !isNonSolidBrush;

                for (const solid of entity.solids) {
                    if (shouldCreatePhysics) {
                        this.createPhysicsForSolid(solid);
                    }
                    const geo = this.getVisualGeometry(solid);
                    if (geo) geometries.push(geo);
                }
            }
        }

        // 3. Spatially partition and merge geometries into CHUNKS for better frustum culling
        if (geometries.length > 0) {
            console.log(`Processing ${geometries.length} geometries for spatial chunking...`);

            // Define chunk size (in meters after scale)
            const CHUNK_SIZE = 20; // 20 meter chunks

            // Group geometries by spatial location
            const chunks = new Map<string, THREE.BufferGeometry[]>();

            for (const geo of geometries) {
                // Compute bounding box
                geo.computeBoundingBox();
                if (!geo.boundingBox) continue;

                // Get center of geometry
                const center = new THREE.Vector3();
                geo.boundingBox.getCenter(center);

                // Determine chunk coordinates
                const chunkX = Math.floor(center.x / CHUNK_SIZE);
                const chunkY = Math.floor(center.y / CHUNK_SIZE);
                const chunkZ = Math.floor(center.z / CHUNK_SIZE);
                const chunkKey = `${chunkX},${chunkY},${chunkZ}`;

                // Add to chunk
                if (!chunks.has(chunkKey)) {
                    chunks.set(chunkKey, []);
                }
                chunks.get(chunkKey)!.push(geo);
            }

            console.log(`Created ${chunks.size} spatial chunks from ${geometries.length} geometries`);

            // Merge each chunk into a single mesh
            let chunkCount = 0;
            for (const [chunkKey, chunkGeometries] of chunks) {
                if (chunkGeometries.length === 0) continue;

                const mergedGeometry = BufferGeometryUtils.mergeGeometries(chunkGeometries, false);
                if (mergedGeometry) {
                    mergedGeometry.computeVertexNormals();

                    const chunkMesh = new THREE.Mesh(mergedGeometry, this.material);
                    chunkMesh.frustumCulled = true; // Critical for culling entire chunks
                    chunkMesh.castShadow = false;
                    chunkMesh.receiveShadow = false;
                    chunkMesh.matrixAutoUpdate = false;
                    chunkMesh.updateMatrix();
                    chunkMesh.name = `MapChunk_${chunkKey}`;

                    this.scene.add(chunkMesh);
                    chunkCount++;
                }
            }

            console.log(`Created ${chunkCount} merged chunk meshes for optimal culling`);
        }
    }

    private getVisualGeometry(solid: VmfSolid): THREE.BufferGeometry | null {
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
            'TOOLS/TOOLSSKYBOX',
            // Add common skybox texture names
            'SKY',
            'SKYBOX'
        ];

        const visualGeo = VmfGeometryBuilder.buildSolidGeometry(solid, true, VISUAL_IGNORED);
        if (visualGeo.attributes.position && visualGeo.attributes.position.count > 0) {
            visualGeo.scale(0.02, 0.02, 0.02);
            visualGeo.computeVertexNormals();
            return visualGeo;
        }
        return null;
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

        const physicsGeo = VmfGeometryBuilder.buildSolidGeometry(solid, true, PHYSICS_IGNORED);

        if (physicsGeo.attributes.position && physicsGeo.attributes.position.count > 0) {
            physicsGeo.scale(0.02, 0.02, 0.02);
            const posAttr = physicsGeo.attributes.position;

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

    private createDevTexture(): THREE.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#444';
        ctx.fillRect(0, 0, 64, 64);

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
