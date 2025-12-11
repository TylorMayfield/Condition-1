// scripts/strategic-detection.ts
// Strategic point detection algorithms for navmesh baking

import * as THREE from 'three';
import type { NavMesh, NavMeshQuery } from 'recast-navigation';

// ============================================================================
// Types
// ============================================================================

export interface PatrolPoint {
    position: [number, number, number];
    score: number;  // 0-1, higher = more desirable
}

export interface CoverSpot {
    position: [number, number, number];
    coverDirection: [number, number, number];  // Direction of cover (toward wall)
    quality: number;  // 0-1
}

export interface ChokePoint {
    position: [number, number, number];
    width: number;  // How narrow the passage is
    connections: [number, number, number][];  // Connected positions
}

export interface VantagePoint {
    position: [number, number, number];
    visibilityScore: number;  // 0-1, percentage of area visible
    elevation: number;  // Height above surrounding ground
}

export interface StrategicPoints {
    patrolPoints: PatrolPoint[];
    coverSpots: CoverSpot[];
    chokePoints: ChokePoint[];
    vantagePoints: VantagePoint[];
}

// ============================================================================
// Main Detection Function
// ============================================================================

export function detectStrategicPoints(
    meshes: THREE.Mesh[],
    navMesh: NavMesh,
    navMeshQuery: NavMeshQuery
): StrategicPoints {
    console.log('[Strategic] Detecting strategic points...');

    const patrolPoints = findPatrolPoints(navMeshQuery);
    console.log(`[Strategic] Found ${patrolPoints.length} patrol points`);

    const coverSpots = findCoverSpots(meshes, navMeshQuery);
    console.log(`[Strategic] Found ${coverSpots.length} cover spots`);

    const chokePoints = findChokePoints(navMeshQuery);
    console.log(`[Strategic] Found ${chokePoints.length} choke points`);

    const vantagePoints = findVantagePoints(meshes, navMeshQuery);
    console.log(`[Strategic] Found ${vantagePoints.length} vantage points`);

    return { patrolPoints, coverSpots, chokePoints, vantagePoints };
}

// ============================================================================
// Patrol Points
// ============================================================================

function findPatrolPoints(query: NavMeshQuery): PatrolPoint[] {
    const candidates: PatrolPoint[] = [];
    const minSpacing = 10;  // Minimum distance between patrol points

    // Sample random points across the navmesh
    for (let i = 0; i < 200; i++) {
        const result = query.findRandomPoint();
        if (!result.success) continue;

        const pos = new THREE.Vector3(
            result.randomPoint.x,
            result.randomPoint.y,
            result.randomPoint.z
        );

        // Check spacing from existing points
        let tooClose = false;
        for (const existing of candidates) {
            const existingPos = new THREE.Vector3(...existing.position);
            if (pos.distanceTo(existingPos) < minSpacing) {
                tooClose = true;
                break;
            }
        }

        if (!tooClose) {
            // Score based on how "open" the area is (sample neighbors)
            const openness = calculateOpenness(query, result.randomPoint);
            candidates.push({
                position: [result.randomPoint.x, result.randomPoint.y, result.randomPoint.z],
                score: openness
            });
        }
    }

    // Sort by score and keep top 30
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 30);
}

function calculateOpenness(query: NavMeshQuery, center: { x: number; y: number; z: number }): number {
    let reachableCount = 0;
    const testRadius = 5;
    const testCount = 8;

    for (let i = 0; i < testCount; i++) {
        const angle = (i / testCount) * Math.PI * 2;
        const testPoint = {
            x: center.x + Math.cos(angle) * testRadius,
            y: center.y,
            z: center.z + Math.sin(angle) * testRadius
        };

        const nearest = query.findNearestPoly(testPoint, { halfExtents: { x: 2, y: 2, z: 2 } });
        if (nearest.success) {
            reachableCount++;
        }
    }

    return reachableCount / testCount;
}

// ============================================================================
// Cover Spots
// ============================================================================

function findCoverSpots(meshes: THREE.Mesh[], query: NavMeshQuery): CoverSpot[] {
    const coverSpots: CoverSpot[] = [];
    const minSpacing = 3;

    // Get wall geometry bounding boxes
    const wallBoxes: { box: THREE.Box3; center: THREE.Vector3 }[] = [];
    for (const mesh of meshes) {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        
        // Identify walls: tall and thin, or thick structures
        if (size.y > 1.5 && (size.x < 1 || size.z < 1 || size.x > 2 || size.z > 2)) {
            wallBoxes.push({ box, center: box.getCenter(new THREE.Vector3()) });
        }
    }

    // Sample points near walls
    for (let i = 0; i < 300; i++) {
        const result = query.findRandomPoint();
        if (!result.success) continue;

        const pos = new THREE.Vector3(result.randomPoint.x, result.randomPoint.y, result.randomPoint.z);

        // Find nearest wall
        let nearestWall: { box: THREE.Box3; center: THREE.Vector3 } | null = null;
        let nearestDist = Infinity;

        for (const wall of wallBoxes) {
            const dist = pos.distanceTo(wall.center);
            if (dist < nearestDist && dist < 2) {  // Within 2m of wall
                nearestDist = dist;
                nearestWall = wall;
            }
        }

        if (nearestWall && nearestDist > 0.3 && nearestDist < 1.5) {
            // Check spacing
            let tooClose = false;
            for (const existing of coverSpots) {
                const existingPos = new THREE.Vector3(...existing.position);
                if (pos.distanceTo(existingPos) < minSpacing) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                // Cover direction is toward the wall
                const coverDir = nearestWall.center.clone().sub(pos).normalize();
                coverSpots.push({
                    position: [pos.x, pos.y, pos.z],
                    coverDirection: [coverDir.x, coverDir.y, coverDir.z],
                    quality: 1 - (nearestDist / 1.5)  // Closer to wall = better cover
                });
            }
        }
    }

    // Keep top 50
    coverSpots.sort((a, b) => b.quality - a.quality);
    return coverSpots.slice(0, 50);
}

// ============================================================================
// Choke Points
// ============================================================================

function findChokePoints(query: NavMeshQuery): ChokePoint[] {
    const chokePoints: ChokePoint[] = [];
    const minSpacing = 5;

    // Sample points and check if they're in narrow passages
    for (let i = 0; i < 200; i++) {
        const result = query.findRandomPoint();
        if (!result.success) continue;

        const pos = new THREE.Vector3(result.randomPoint.x, result.randomPoint.y, result.randomPoint.z);

        // Check passage width by testing reachability in perpendicular directions
        const width = measurePassageWidth(query, result.randomPoint);

        if (width > 0 && width < 2.5) {  // Narrow passage (doorway width)
            // Check spacing
            let tooClose = false;
            for (const existing of chokePoints) {
                const existingPos = new THREE.Vector3(...existing.position);
                if (pos.distanceTo(existingPos) < minSpacing) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                // Find connected areas on either side
                const connections = findChokeConnections(query, result.randomPoint, width);
                chokePoints.push({
                    position: [pos.x, pos.y, pos.z],
                    width,
                    connections
                });
            }
        }
    }

    return chokePoints.slice(0, 20);
}

function measurePassageWidth(query: NavMeshQuery, center: { x: number; y: number; z: number }): number {
    // Test multiple perpendicular directions to find narrowest passage
    let minWidth = Infinity;

    for (let angle = 0; angle < Math.PI; angle += Math.PI / 4) {
        const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        
        let positiveReach = 0;
        let negativeReach = 0;

        // Probe in positive direction
        for (let dist = 0.5; dist <= 5; dist += 0.5) {
            const testPoint = {
                x: center.x + dir.x * dist,
                y: center.y,
                z: center.z + dir.z * dist
            };
            const nearest = query.findNearestPoly(testPoint, { halfExtents: { x: 0.3, y: 2, z: 0.3 } });
            if (nearest.success) {
                positiveReach = dist;
            } else {
                break;
            }
        }

        // Probe in negative direction
        for (let dist = 0.5; dist <= 5; dist += 0.5) {
            const testPoint = {
                x: center.x - dir.x * dist,
                y: center.y,
                z: center.z - dir.z * dist
            };
            const nearest = query.findNearestPoly(testPoint, { halfExtents: { x: 0.3, y: 2, z: 0.3 } });
            if (nearest.success) {
                negativeReach = dist;
            } else {
                break;
            }
        }

        const width = positiveReach + negativeReach;
        if (width < minWidth && width > 0) {
            minWidth = width;
        }
    }

    return minWidth === Infinity ? 0 : minWidth;
}

function findChokeConnections(
    query: NavMeshQuery,
    center: { x: number; y: number; z: number },
    _width: number
): [number, number, number][] {
    const connections: [number, number, number][] = [];

    // Find points on either side of the choke along the longer axis
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
        const testPoint = {
            x: center.x + Math.cos(angle) * 5,
            y: center.y,
            z: center.z + Math.sin(angle) * 5
        };
        const nearest = query.findNearestPoly(testPoint, { halfExtents: { x: 2, y: 2, z: 2 } });
        if (nearest.success) {
            connections.push([nearest.nearestPoint.x, nearest.nearestPoint.y, nearest.nearestPoint.z]);
        }
    }

    return connections.slice(0, 2);  // Keep two connections (entry/exit)
}

// ============================================================================
// Vantage Points
// ============================================================================

function findVantagePoints(meshes: THREE.Mesh[], query: NavMeshQuery): VantagePoint[] {
    const vantagePoints: VantagePoint[] = [];
    const minSpacing = 8;

    // Find elevated platforms/structures
    const elevatedAreas: THREE.Vector3[] = [];
    for (const mesh of meshes) {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        
        // Flat surfaces at height (platforms, roofs)
        if (size.y < 0.5 && box.min.y > 1) {
            elevatedAreas.push(box.getCenter(new THREE.Vector3()));
        }
    }

    // Sample points and check for elevation
    for (let i = 0; i < 150; i++) {
        const result = query.findRandomPoint();
        if (!result.success) continue;

        const pos = new THREE.Vector3(result.randomPoint.x, result.randomPoint.y, result.randomPoint.z);

        // Check if this point is elevated compared to surroundings
        let baselineY = result.randomPoint.y;
        let elevatedCount = 0;

        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const testPoint = {
                x: result.randomPoint.x + Math.cos(angle) * 5,
                y: result.randomPoint.y - 2,  // Start lower
                z: result.randomPoint.z + Math.sin(angle) * 5
            };
            const nearest = query.findNearestPoly(testPoint, { halfExtents: { x: 2, y: 4, z: 2 } });
            if (nearest.success && nearest.nearestPoint.y < result.randomPoint.y - 0.5) {
                elevatedCount++;
                baselineY = Math.min(baselineY, nearest.nearestPoint.y);
            }
        }

        const elevation = result.randomPoint.y - baselineY;

        if (elevatedCount >= 3 && elevation > 1) {
            // Check spacing
            let tooClose = false;
            for (const existing of vantagePoints) {
                const existingPos = new THREE.Vector3(...existing.position);
                if (pos.distanceTo(existingPos) < minSpacing) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                // Calculate visibility score (openness from elevated position)
                const visibilityScore = calculateOpenness(query, result.randomPoint);
                vantagePoints.push({
                    position: [pos.x, pos.y, pos.z],
                    visibilityScore,
                    elevation
                });
            }
        }
    }

    // Sort by combined score (visibility * elevation)
    vantagePoints.sort((a, b) => (b.visibilityScore * b.elevation) - (a.visibilityScore * a.elevation));
    return vantagePoints.slice(0, 15);
}
