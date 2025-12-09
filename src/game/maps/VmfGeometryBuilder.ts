
import * as THREE from 'three';
import type { VmfSolid, VmfSide } from './VmfParser';

/**
 * Converts VMF convex solids defined by planes into Three.js Geometry (Vertices/Indices).
 */
export class VmfGeometryBuilder {

    /**
     * Build geometry for a single convex solid.
     * Uses plane intersection method to find all valid vertices.
     */
    // Default materials to ignore (filtered visually)
    public static DEFAULT_IGNORED_MATERIALS = [
        'TOOLS/TOOLSNODRAW',
        'TOOLS/TOOLSSKYBOX',
        'TOOLS/TOOLSCLIP',
        'TOOLS/TOOLSTRIGGER',
        'TOOLS/TOOLSSKIP',
        'TOOLS/TOOLSHINT',
        'TOOLS/TOOLSORIGIN',
        'TOOLS/TOOLSAREAPORTAL',
        'TOOLS/TOOLSFOG',
        'TOOLS/TOOLSLIGHT'
    ];

    /**
     * Build geometry for a single convex solid.
     * Uses plane intersection method to find all valid vertices.
     * @param filterMaterials If true, excludes faces with ignored materials.
     * @param ignoredMaterials List of material names (substring) to ignore. Defaults to standard tools.
     */
    /**
     * Build geometry for a single convex solid.
     * Uses plane intersection method to find all valid vertices.
     * @param filterMaterials If true, excludes faces with ignored materials.
     * @param ignoredMaterials List of material names (substring) to ignore. Defaults to standard tools.
     */
    public static buildSolidGeometry(solid: VmfSolid, filterMaterials: boolean = true, ignoredMaterials: string[] = VmfGeometryBuilder.DEFAULT_IGNORED_MATERIALS): Array<{ material: string, geometry: THREE.BufferGeometry }> {
        const vertices: THREE.Vector3[] = [];
        const sides = solid.sides;
        const results: Array<{ material: string, geometry: THREE.BufferGeometry }> = [];

        // 1. Find all vertices by intersecting every triplet of planes
        for (let i = 0; i < sides.length - 2; i++) {
            for (let j = i + 1; j < sides.length - 1; j++) {
                for (let k = j + 1; k < sides.length; k++) {
                    const intersection = this.getIntersection(sides[i].plane, sides[j].plane, sides[k].plane);
                    if (intersection && this.isPointInsideSolid(intersection, sides)) {
                        vertices.push(intersection);
                    }
                }
            }
        }

        // Remove duplicates
        const uniqueVertices = this.mergeVertices(vertices);
        if (uniqueVertices.length < 4) {
            return [];
        }

        // 2. Build Faces Grouped by Material
        const materialGroups = new Map<string, { vertices: number[], uvs: number[] }>();

        for (const side of sides) {
            // Check if material should be skipped
            let matName = side.material.toUpperCase();

            if (filterMaterials && !side.dispinfo && ignoredMaterials.some(m => matName.includes(m))) {
                continue;
            }

            // Find vertices on this plane
            const onPlane = uniqueVertices.filter(v =>
                Math.abs(side.plane.distanceToPoint(v)) < 0.1
            );

            if (onPlane.length >= 3) {
                // Initialize group if needed
                if (!materialGroups.has(matName)) {
                    materialGroups.set(matName, { vertices: [], uvs: [] });
                }
                const group = materialGroups.get(matName)!;

                // Sort vertices to form a convex polygon
                this.sortVerticesCCW(onPlane, side.plane.normal);

                // Triangulate fan
                const center = onPlane[0];
                for (let k = 1; k < onPlane.length - 1; k++) {
                    const v1 = center;
                    const v2 = onPlane[k];
                    const v3 = onPlane[k + 1];

                    // Add to geometry
                    group.vertices.push(v1.x, v1.y, v1.z);
                    group.vertices.push(v2.x, v2.y, v2.z);
                    group.vertices.push(v3.x, v3.y, v3.z);

                    // Basic placeholder UVs (planar mapping)
                    this.pushUV(group.uvs, v1, side);
                    this.pushUV(group.uvs, v2, side);
                    this.pushUV(group.uvs, v3, side);
                }
            }
        }

        // 3. Create Geometries from groups
        for (const [material, data] of materialGroups) {
            if (data.vertices.length > 0) {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
                geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
                geometry.computeVertexNormals();

                // Source Engine Coordinate Transform
                geometry.rotateX(-Math.PI / 2);

                results.push({ material, geometry });
            }
        }

        return results;
    }

    private static getIntersection(p1: THREE.Plane, p2: THREE.Plane, p3: THREE.Plane): THREE.Vector3 | null {
        // cramer's rule or vector algebra
        // Intersection P = [ (d1 * (n2 x n3)) + (d2 * (n3 x n1)) + (d3 * (n1 x n2)) ] / (n1 . (n2 x n3))
        // Note: THREE.Plane form is ax + by + cz + w = 0 -> normal . P + constant = 0
        // So d = -constant

        const n1 = p1.normal; const n2 = p2.normal; const n3 = p3.normal;
        const det = n1.dot(n2.clone().cross(n3));

        if (Math.abs(det) < 1e-6) return null; // Parallel planes

        const d1 = -p1.constant;
        const d2 = -p2.constant;
        const d3 = -p3.constant;

        const v1 = n2.clone().cross(n3).multiplyScalar(d1);
        const v2 = n3.clone().cross(n1).multiplyScalar(d2);
        const v3 = n1.clone().cross(n2).multiplyScalar(d3);

        return v1.add(v2).add(v3).divideScalar(det);
    }

    private static isPointInsideSolid(pt: THREE.Vector3, sides: VmfSide[]): boolean {
        // Tolerant check
        const EPSILON = 0.1;
        for (const side of sides) {
            const dist = side.plane.distanceToPoint(pt);

            // Assume normals point INWARD due to VMF winding order vs Three.js expectation.
            // If dist < -EPSILON, the point is "behind" the plane (outside the volume).
            if (dist < -EPSILON) return false;
        }
        return true;
    }

    private static mergeVertices(vertices: THREE.Vector3[], tolerance = 0.1): THREE.Vector3[] {
        const unique: THREE.Vector3[] = [];
        for (const v of vertices) {
            let found = false;
            for (const u of unique) {
                if (v.distanceTo(u) < tolerance) {
                    found = true;
                    break;
                }
            }
            if (!found) unique.push(v);
        }
        return unique;
    }

    private static sortVerticesCCW(vertices: THREE.Vector3[], normal: THREE.Vector3) {
        // Project to 2D plane defined by normal
        // Find center
        const center = new THREE.Vector3();
        vertices.forEach(v => center.add(v));
        center.divideScalar(vertices.length);

        // Pick arbitrary axis on plane
        const up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(normal.dot(up)) > 0.99) up.set(1, 0, 0); // Handle vertical normal

        const u = new THREE.Vector3().crossVectors(normal, up).normalize();
        const v = new THREE.Vector3().crossVectors(normal, u); // Already normalized

        vertices.sort((a, b) => {
            const va = a.clone().sub(center);
            const vb = b.clone().sub(center);

            const angA = Math.atan2(va.dot(v), va.dot(u));
            const angB = Math.atan2(vb.dot(v), vb.dot(u));

            return angA - angB;
        });
    }

    private static pushUV(uvs: number[], pos: THREE.Vector3, side: VmfSide) {
        // Basic Planar Mapping based on axis
        // Real VMF parsing uses uaxis/vaxis strings like "[1 0 0 0] 0.25"
        // uaxis = [x y z offset] scale
        // u = (x*pos.x + y*pos.y + z*pos.z + offset) / scale

        // Simple fallback parsing
        try {
            const uMatch = side.uaxis.match(/\[([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\]\s+([0-9.-]+)/);
            const vMatch = side.vaxis.match(/\[([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\]\s+([0-9.-]+)/);

            if (uMatch && vMatch) {
                const uVec = new THREE.Vector3(parseFloat(uMatch[1]), parseFloat(uMatch[2]), parseFloat(uMatch[3]));
                const uOff = parseFloat(uMatch[4]);
                const uScale = parseFloat(uMatch[5]) || 1;

                const vVec = new THREE.Vector3(parseFloat(vMatch[1]), parseFloat(vMatch[2]), parseFloat(vMatch[3]));
                const vOff = parseFloat(vMatch[4]);
                const vScale = parseFloat(vMatch[5]) || 1;

                const u = (pos.dot(uVec) + uOff) / uScale;
                const v = (pos.dot(vVec) + vOff) / vScale;

                // Scale UVs down a bit because Source textures are huge
                uvs.push(u / 128, v / 128);
                return;
            }
        } catch (e) {
            // fallback
        }

        uvs.push(pos.x, pos.z);
    }
}
