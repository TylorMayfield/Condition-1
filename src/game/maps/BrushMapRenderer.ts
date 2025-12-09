import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { BrushMap } from './BrushMap';
import type { Brush, BrushMaterialType, BrushSurface } from './BrushMap';
import { DestructibleWall } from '../components/DestructibleWall';
import { DevTextureGenerator } from '../utils/DevTextureGenerator';

/**
 * Material colors for rendering.
 */
const MATERIAL_COLORS: Record<BrushMaterialType, number> = {
    concrete: 0x888888,
    brick: 0xa05040,
    wood: 0x8b5a2b,
    metal: 0xaaaaaa,
    grass: 0x44aa44,
    dirt: 0x6b4423,
    stone: 0x555555,
    crate: 0xcda434,
    glass: 0x88ccff,
    carpet: 0x800020, // Burgundy
};



/**
 * Renderer for BrushMap format.
 * Creates Three.js meshes and Cannon.js physics bodies from brushes.
 */
export class BrushMapRenderer {
    private game: Game;
    private map: BrushMap;
    private materials: Map<string, THREE.Material> = new Map();

    constructor(game: Game, map: BrushMap) {
        this.game = game;
        this.map = map;
        this.initMaterials();
    }

    /**
     * Initialize materials for each brush material type.
     */
    private initMaterials(): void {
        for (const [name, color] of Object.entries(MATERIAL_COLORS)) {
            // Generate dev texture
            const texture = DevTextureGenerator.getTexture(name, {
                color: color,
                text: name.toUpperCase(),
                width: 512,
                height: 512,
                gridSize: 64
            });

            // Adjust texture scale
            // We want roughly 1 unit = 1 grid cell?
            // Texture is 512x512, grid is 64. So 8x8 cells.
            // If we map this to a 1x1x1 cube, we get 8 cells per unit. That's dense.
            // We likely want to scale the texture repeat in renderBrush.

            const mat = new THREE.MeshStandardMaterial({
                map: texture,
                color: 0xffffff, // Tint white so texture color shows
                roughness: 0.7,
                metalness: name === 'metal' ? 0.8 : 0.1,
            });
            this.materials.set(name, mat);
        }

        // Glass material (transparent) - improved appearance
        // Glass usually doesn't need a dev grid unless requested, but let's keep it clean
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xaaddff,
            transparent: true,
            opacity: 0.4,
            roughness: 0.05,
            metalness: 0.0,
            transmission: 0.9,        // Glass-like light transmission
            thickness: 0.5,           // Simulated glass thickness
            envMapIntensity: 1.0,
            clearcoat: 1.0,           // Glossy coating for reflection
            clearcoatRoughness: 0.1,
        });
        this.materials.set('glass', glassMat);
    }

    /**
     * Render the entire map.
     */
    public render(): void {
        const brushes = this.map.getBrushes();
        const scale = this.map.scale;

        for (const brush of brushes) {
            this.renderBrush(brush, scale);
        }
    }

    /**
     * Render a single brush.
     */
    private renderBrush(brush: Brush, scale: number): void {
        // Skip non-renderable brush types
        if (brush.type === 'trigger' || brush.type === 'clip') {
            // Triggers and clips are invisible but may have physics
            if (brush.type === 'clip') {
                this.addPhysicsBody(brush, scale);
            }
            return;
        }

        // Calculate world dimensions
        const worldWidth = brush.width * scale;
        const worldHeight = brush.height * scale;
        const worldDepth = brush.depth * scale;

        // Calculate world position (center of brush)
        const worldPos = new THREE.Vector3(
            brush.x * scale + worldWidth / 2,
            brush.y * scale + worldHeight / 2,
            brush.z * scale + worldDepth / 2
        );

        // Handle destructible brushes
        if (brush.destructible) {
            new DestructibleWall(this.game, worldPos, worldWidth, worldHeight);
            return;
        }

        const go = new GameObject(this.game);

        // Create geometry
        const geo = new THREE.BoxGeometry(worldWidth, worldHeight, worldDepth);

        // Calculate UVs to tile the texture based on world size
        const uvScale = 0.25; // 1 repeat per 4 units.

        // Get or create material
        let mat = this.getMaterial(brush);

        // Clone for tiling if it has a map
        if ((mat as THREE.MeshStandardMaterial).map) {
            mat = mat.clone();

            // Right (x+) -> Left Face in BoxGeometry terms? 
            // 0: +x, 1: -x, 2: +y, 3: -y, 4: +z, 5: -z
            this.scaleUVs(geo, 0, worldDepth, worldHeight, uvScale); // Right
            this.scaleUVs(geo, 1, worldDepth, worldHeight, uvScale); // Left
            this.scaleUVs(geo, 2, worldWidth, worldDepth, uvScale);  // Top
            this.scaleUVs(geo, 3, worldWidth, worldDepth, uvScale);  // Bottom
            this.scaleUVs(geo, 4, worldWidth, worldHeight, uvScale); // Front
            this.scaleUVs(geo, 5, worldWidth, worldHeight, uvScale); // Back
        }

        // Create mesh
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(worldPos);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        // Physics body
        const shape = new CANNON.Box(new CANNON.Vec3(
            worldWidth / 2,
            worldHeight / 2,
            worldDepth / 2
        ));
        go.body = new CANNON.Body({
            mass: 0, // Static
            position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
            shape: shape,
        });

        this.game.addGameObject(go);
    }

    /**
     * Get or create material for a brush.
     */
    private getMaterial(brush: Brush): THREE.Material {
        // If brush has custom color, create unique material
        if (brush.color !== undefined) {
            const isTransparent = brush.surface?.transparent ?? false;
            const opacity = brush.surface?.opacity ?? 1.0;

            const mat = new THREE.MeshStandardMaterial({
                color: brush.color,
                roughness: brush.surface?.roughness ?? 0.7,
                metalness: brush.surface?.metalness ?? 0.1,
                transparent: isTransparent,
                opacity: isTransparent ? opacity : 1.0,
            });
            return mat;
        }

        // If brush has surface properties, create custom material
        if (brush.surface) {
            return this.createSurfaceMaterial(brush.material, brush.surface);
        }

        // Use cached material
        return this.materials.get(brush.material) || this.materials.get('concrete')!;
    }

    /**
     * Create a material with surface properties applied.
     */
    private createSurfaceMaterial(materialType: BrushMaterialType, surface: BrushSurface): THREE.Material {
        const baseColor = MATERIAL_COLORS[materialType] || MATERIAL_COLORS.concrete;
        const isTransparent = surface.transparent ?? (materialType === 'glass');
        const opacity = surface.opacity ?? (materialType === 'glass' ? 0.4 : 1.0);

        // Generate Basic Dev Texture
        // We reuse the cached texture for base, but we might want custom for surface?
        // Since surface properties don't change texture CONTENT usually, just physics/render params.
        const texture = DevTextureGenerator.getTexture(materialType, {
            color: baseColor,
            text: materialType.toUpperCase(),
            width: 512,
            height: 512,
            gridSize: 64
        });

        // Use MeshPhysicalMaterial for transparent/glass materials for better appearance
        if (isTransparent || materialType === 'glass') {
            const mat = new THREE.MeshPhysicalMaterial({
                map: texture,
                color: 0xffffff,
                roughness: surface.roughness,
                metalness: surface.metalness ?? 0.0,
                transparent: true,
                opacity: opacity,
                transmission: materialType === 'glass' ? 0.9 : 0.5,
                thickness: 0.5,
                envMapIntensity: 1.0,
                clearcoat: materialType === 'glass' ? 1.0 : 0.0,
                clearcoatRoughness: 0.1,
            });
            return mat;
        }

        // Standard material for opaque surfaces
        const mat = new THREE.MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            roughness: surface.roughness,
            metalness: surface.metalness ?? 0.1,
        });

        return mat;
    }

    /**
     * Add physics body only (for invisible brushes like clips).
     */
    private addPhysicsBody(brush: Brush, scale: number): void {
        const worldWidth = brush.width * scale;
        const worldHeight = brush.height * scale;
        const worldDepth = brush.depth * scale;

        const worldPos = new THREE.Vector3(
            brush.x * scale + worldWidth / 2,
            brush.y * scale + worldHeight / 2,
            brush.z * scale + worldDepth / 2
        );

        const shape = new CANNON.Box(new CANNON.Vec3(
            worldWidth / 2,
            worldHeight / 2,
            worldDepth / 2
        ));

        const body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
            shape: shape,
        });

        this.game.world.addBody(body);
    }

    /**
     * Render edge blending between adjacent brushes with different materials.
     * This creates smooth transitions at brush boundaries.
     */
    public renderBlendZones(): void {
        const brushes = this.map.getBrushes();
        const scale = this.map.scale;

        // Find adjacent brushes with blending enabled
        for (const brush of brushes) {
            if (!brush.surface?.blend) continue;

            const blendWidth = (brush.surface.blendWidth ?? 0.5) * scale;

            // Find adjacent brushes
            const neighbors = this.findAdjacentBrushes(brush, brushes);

            for (const neighbor of neighbors) {
                if (neighbor.material === brush.surface.blend) {
                    // Create blend geometry at the boundary
                    this.createBlendBoundary(brush, neighbor, blendWidth, scale);
                }
            }
        }
    }

    /**
     * Find brushes adjacent to a given brush.
     */
    private findAdjacentBrushes(brush: Brush, allBrushes: Brush[]): Brush[] {
        const adjacent: Brush[] = [];
        const epsilon = 0.001; // Small tolerance for floating point

        for (const other of allBrushes) {
            if (other.id === brush.id) continue;

            // Check if brushes share a face
            const sharesFace = (
                // X-axis adjacency
                (Math.abs((brush.x + brush.width) - other.x) < epsilon ||
                    Math.abs((other.x + other.width) - brush.x) < epsilon) &&
                this.rangesOverlap(brush.y, brush.y + brush.height, other.y, other.y + other.height) &&
                this.rangesOverlap(brush.z, brush.z + brush.depth, other.z, other.z + other.depth)
            ) || (
                    // Y-axis adjacency
                    (Math.abs((brush.y + brush.height) - other.y) < epsilon ||
                        Math.abs((other.y + other.height) - brush.y) < epsilon) &&
                    this.rangesOverlap(brush.x, brush.x + brush.width, other.x, other.x + other.width) &&
                    this.rangesOverlap(brush.z, brush.z + brush.depth, other.z, other.z + other.depth)
                ) || (
                    // Z-axis adjacency
                    (Math.abs((brush.z + brush.depth) - other.z) < epsilon ||
                        Math.abs((other.z + other.depth) - brush.z) < epsilon) &&
                    this.rangesOverlap(brush.x, brush.x + brush.width, other.x, other.x + other.width) &&
                    this.rangesOverlap(brush.y, brush.y + brush.height, other.y, other.y + other.height)
                );

            if (sharesFace) {
                adjacent.push(other);
            }
        }

        return adjacent;
    }

    /**
     * Check if two ranges overlap.
     */
    private rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
        return aMin < bMax && aMax > bMin;
    }

    /**
     * Create visual blend at brush boundary.
     * Creates a thin strip mesh with gradient shader between two adjacent brushes.
     */
    private createBlendBoundary(brush: Brush, neighbor: Brush, blendWidth: number, scale: number): void {
        const brushColor = new THREE.Color(MATERIAL_COLORS[brush.material] || 0x888888);
        const neighborColor = new THREE.Color(MATERIAL_COLORS[neighbor.material] || 0x888888);

        // Determine which axis the brushes are adjacent on
        const epsilon = 0.001;
        let axis: 'x' | 'y' | 'z' | null = null;
        let brushIsFirst = true;

        // Check X adjacency
        if (Math.abs((brush.x + brush.width) - neighbor.x) < epsilon) {
            axis = 'x';
            brushIsFirst = true;
        } else if (Math.abs((neighbor.x + neighbor.width) - brush.x) < epsilon) {
            axis = 'x';
            brushIsFirst = false;
        }
        // Check Y adjacency
        else if (Math.abs((brush.y + brush.height) - neighbor.y) < epsilon) {
            axis = 'y';
            brushIsFirst = true;
        } else if (Math.abs((neighbor.y + neighbor.height) - brush.y) < epsilon) {
            axis = 'y';
            brushIsFirst = false;
        }
        // Check Z adjacency
        else if (Math.abs((brush.z + brush.depth) - neighbor.z) < epsilon) {
            axis = 'z';
            brushIsFirst = true;
        } else if (Math.abs((neighbor.z + neighbor.depth) - brush.z) < epsilon) {
            axis = 'z';
            brushIsFirst = false;
        }

        if (!axis) return;

        // Calculate overlap region
        const overlapX = {
            min: Math.max(brush.x, neighbor.x),
            max: Math.min(brush.x + brush.width, neighbor.x + neighbor.width)
        };
        const overlapY = {
            min: Math.max(brush.y, neighbor.y),
            max: Math.min(brush.y + brush.height, neighbor.y + neighbor.height)
        };
        const overlapZ = {
            min: Math.max(brush.z, neighbor.z),
            max: Math.min(brush.z + brush.depth, neighbor.z + neighbor.depth)
        };

        // Skip if no overlap
        if (overlapX.max <= overlapX.min || overlapY.max <= overlapY.min || overlapZ.max <= overlapZ.min) {
            return;
        }

        // Create blend geometry based on axis
        let geometry: THREE.BufferGeometry;

        if (axis === 'x') {
            // Vertical blend strip on X boundary
            const boundaryX = brushIsFirst ? (brush.x + brush.width) * scale : brush.x * scale;
            const width = blendWidth;
            const height = (overlapY.max - overlapY.min) * scale;
            const depth = (overlapZ.max - overlapZ.min) * scale;

            geometry = new THREE.BoxGeometry(width, height, depth);
            geometry.translate(
                boundaryX,
                (overlapY.min + overlapY.max) / 2 * scale,
                (overlapZ.min + overlapZ.max) / 2 * scale
            );
        } else if (axis === 'y') {
            // Horizontal blend strip on Y boundary
            const boundaryY = brushIsFirst ? (brush.y + brush.height) * scale : brush.y * scale;
            const width = (overlapX.max - overlapX.min) * scale;
            const height = blendWidth;
            const depth = (overlapZ.max - overlapZ.min) * scale;

            geometry = new THREE.BoxGeometry(width, height, depth);
            geometry.translate(
                (overlapX.min + overlapX.max) / 2 * scale,
                boundaryY,
                (overlapZ.min + overlapZ.max) / 2 * scale
            );
        } else {
            // Blend strip on Z boundary
            const boundaryZ = brushIsFirst ? (brush.z + brush.depth) * scale : brush.z * scale;
            const width = (overlapX.max - overlapX.min) * scale;
            const height = (overlapY.max - overlapY.min) * scale;
            const depth = blendWidth;

            geometry = new THREE.BoxGeometry(width, height, depth);
            geometry.translate(
                (overlapX.min + overlapX.max) / 2 * scale,
                (overlapY.min + overlapY.max) / 2 * scale,
                boundaryZ
            );
        }

        // Create gradient material using vertex colors
        const blendColor = new THREE.Color().lerpColors(brushColor, neighborColor, 0.5);
        const blendMat = new THREE.MeshStandardMaterial({
            color: blendColor,
            roughness: (brush.surface?.roughness ?? 0.7 + (neighbor.surface?.roughness ?? 0.7)) / 2,
            metalness: 0.1,
        });

        const blendMesh = new THREE.Mesh(geometry, blendMat);
        blendMesh.castShadow = true;
        blendMesh.receiveShadow = true;

        this.game.scene.add(blendMesh);
    }

    /**
     * Get all brush intersection points for collision detection.
     */
    public getBrushIntersections(): Array<{
        brushA: Brush;
        brushB: Brush;
        axis: 'x' | 'y' | 'z';
        position: THREE.Vector3;
        overlapArea: number;
    }> {
        const intersections: Array<{
            brushA: Brush;
            brushB: Brush;
            axis: 'x' | 'y' | 'z';
            position: THREE.Vector3;
            overlapArea: number;
        }> = [];

        const brushes = this.map.getBrushes();
        const scale = this.map.scale;
        const epsilon = 0.001;

        for (let i = 0; i < brushes.length; i++) {
            for (let j = i + 1; j < brushes.length; j++) {
                const a = brushes[i];
                const b = brushes[j];

                // Check each axis for adjacency
                const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];

                for (const axis of axes) {
                    let isAdjacent = false;
                    let boundaryPos = 0;

                    if (axis === 'x') {
                        if (Math.abs((a.x + a.width) - b.x) < epsilon) {
                            isAdjacent = true;
                            boundaryPos = (a.x + a.width) * scale;
                        } else if (Math.abs((b.x + b.width) - a.x) < epsilon) {
                            isAdjacent = true;
                            boundaryPos = a.x * scale;
                        }
                    } else if (axis === 'y') {
                        if (Math.abs((a.y + a.height) - b.y) < epsilon) {
                            isAdjacent = true;
                            boundaryPos = (a.y + a.height) * scale;
                        } else if (Math.abs((b.y + b.height) - a.y) < epsilon) {
                            isAdjacent = true;
                            boundaryPos = a.y * scale;
                        }
                    } else {
                        if (Math.abs((a.z + a.depth) - b.z) < epsilon) {
                            isAdjacent = true;
                            boundaryPos = (a.z + a.depth) * scale;
                        } else if (Math.abs((b.z + b.depth) - a.z) < epsilon) {
                            isAdjacent = true;
                            boundaryPos = a.z * scale;
                        }
                    }

                    if (isAdjacent) {
                        // Calculate overlap area on the shared face
                        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                        const overlapZ = Math.min(a.z + a.depth, b.z + b.depth) - Math.max(a.z, b.z);

                        let overlapArea = 0;
                        let centerPos = new THREE.Vector3();

                        if (axis === 'x' && overlapY > 0 && overlapZ > 0) {
                            overlapArea = overlapY * overlapZ * scale * scale;
                            centerPos.set(
                                boundaryPos,
                                (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2 * scale,
                                (Math.max(a.z, b.z) + Math.min(a.z + a.depth, b.z + b.depth)) / 2 * scale
                            );
                        } else if (axis === 'y' && overlapX > 0 && overlapZ > 0) {
                            overlapArea = overlapX * overlapZ * scale * scale;
                            centerPos.set(
                                (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2 * scale,
                                boundaryPos,
                                (Math.max(a.z, b.z) + Math.min(a.z + a.depth, b.z + b.depth)) / 2 * scale
                            );
                        } else if (axis === 'z' && overlapX > 0 && overlapY > 0) {
                            overlapArea = overlapX * overlapY * scale * scale;
                            centerPos.set(
                                (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2 * scale,
                                (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2 * scale,
                                boundaryPos
                            );
                        }

                        if (overlapArea > 0) {
                            intersections.push({
                                brushA: a,
                                brushB: b,
                                axis,
                                position: centerPos,
                                overlapArea,
                            });
                        }
                    }
                }
            }
        }

        return intersections;
    }
    /**
     * Helper to scale UVs for a specific face index of a BoxGeometry.
     * Assumes 6 faces, 4 vertices per face (24 verts total).
     */
    private scaleUVs(geo: THREE.BoxGeometry, faceIndex: number, width: number, height: number, scale: number) {
        const uv = geo.attributes.uv;
        const offset = faceIndex * 4; // 4 verts per face

        for (let i = 0; i < 4; i++) {
            const u = uv.getX(offset + i);
            const v = uv.getY(offset + i);

            // Scale UVs
            // Default is 0..1. We mult by dimension * scale
            // e.g. 10m wall * 0.25 = 2.5 repeats
            uv.setXY(offset + i, u * width * scale, v * height * scale);
        }

        uv.needsUpdate = true;
    }
}

