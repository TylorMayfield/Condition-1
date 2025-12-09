import type { BrushMapDefinition, Brush } from './BrushMap';

/**
 * Validation error severity levels.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Types of validation issues.
 */
export type ValidationIssueType =
    | 'leak'           // Gap in perimeter allowing outside access
    | 'overlap'        // Redundant overlapping brushes
    | 'orphan'         // Brush not connected to anything
    | 'bounds'         // Entity outside walkable area
    | 'missing_floor'  // No floor under walkable area
    | 'no_spawn'       // Missing required spawn points
    | 'invalid_brush'  // Brush with invalid properties
    | 'thin_brush'     // Brush too thin to render properly
    | 'perimeter_hole' // Gap in perimeter wall allowing player fall-off
    | 'floating_brush' // Brush not connected to floor or other brushes
    | 'skybox_bounds'; // Brush extends outside skybox limits

/**
 * A single validation issue.
 */
export interface ValidationIssue {
    type: ValidationIssueType;
    severity: ValidationSeverity;
    message: string;
    location?: { x: number; y: number; z: number };
    brushIds?: string[];
    entityIndex?: number;
}

/**
 * Complete validation result.
 */
export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
    stats: {
        totalBrushes: number;
        solidBrushes: number;
        detailBrushes: number;
        totalEntities: number;
        playerSpawns: number;
        enemySpawns: number;
    };
}

/**
 * MapValidator - validates brush maps for common issues.
 * Use this to check maps during development before loading them.
 */
export class MapValidator {
    private map: BrushMapDefinition;
    private issues: ValidationIssue[] = [];
    private voxelGrid: Map<string, boolean> = new Map(); // true = solid

    constructor(map: BrushMapDefinition) {
        this.map = map;
    }

    /**
     * Run all validation checks.
     */
    public validate(): ValidationResult {
        this.issues = [];

        // Build voxel representation for spatial checks
        this.buildVoxelGrid();

        // Run all checks
        this.checkBrushValidity();
        this.checkForOverlaps();
        this.checkEntityBounds();
        this.checkSpawnPoints();
        this.checkForLeaks();
        this.checkFloorCoverage();
        this.checkPerimeterHoles();
        this.checkFloatingBrushes();
        this.checkSkyboxBounds();

        // Calculate stats
        const stats = this.calculateStats();

        return {
            valid: this.issues.filter(i => i.severity === 'error').length === 0,
            issues: this.issues,
            stats,
        };
    }

    /**
     * Build a voxel grid representation of the map for spatial queries.
     */
    private buildVoxelGrid(): void {
        this.voxelGrid.clear();

        for (const brush of this.map.brushes) {
            if (brush.type !== 'solid' && brush.type !== 'detail') continue;

            // Voxelize the brush
            for (let x = Math.floor(brush.x); x < brush.x + brush.width; x++) {
                for (let y = Math.floor(brush.y); y < brush.y + brush.height; y++) {
                    for (let z = Math.floor(brush.z); z < brush.z + brush.depth; z++) {
                        this.voxelGrid.set(`${x},${y},${z}`, true);
                    }
                }
            }
        }
    }

    /**
     * Check if a voxel position is solid.
     */
    private isSolidAt(x: number, y: number, z: number): boolean {
        return this.voxelGrid.has(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`);
    }

    /**
     * Check brush validity (required properties, dimensions).
     */
    private checkBrushValidity(): void {
        for (const brush of this.map.brushes) {
            // Check for zero or negative dimensions
            if (brush.width <= 0 || brush.height <= 0 || brush.depth <= 0) {
                this.issues.push({
                    type: 'invalid_brush',
                    severity: 'error',
                    message: `Brush "${brush.id}" has invalid dimensions: ${brush.width}x${brush.height}x${brush.depth}`,
                    brushIds: [brush.id],
                });
            }

            // Check for very thin brushes that may cause rendering issues
            const minDim = Math.min(brush.width, brush.height, brush.depth);
            if (minDim < 0.1) {
                this.issues.push({
                    type: 'thin_brush',
                    severity: 'warning',
                    message: `Brush "${brush.id}" is very thin (${minDim} units), may not render correctly`,
                    brushIds: [brush.id],
                });
            }
        }
    }

    /**
     * Check for overlapping brushes (potentially redundant geometry).
     */
    private checkForOverlaps(): void {
        const brushes = this.map.brushes.filter(b => b.type === 'solid');

        for (let i = 0; i < brushes.length; i++) {
            for (let j = i + 1; j < brushes.length; j++) {
                const a = brushes[i];
                const b = brushes[j];

                if (this.brushesOverlap(a, b)) {
                    // Check if one fully contains the other
                    if (this.brushContains(a, b)) {
                        this.issues.push({
                            type: 'overlap',
                            severity: 'warning',
                            message: `Brush "${a.id}" fully contains "${b.id}" - redundant geometry`,
                            brushIds: [a.id, b.id],
                        });
                    } else if (this.brushContains(b, a)) {
                        this.issues.push({
                            type: 'overlap',
                            severity: 'warning',
                            message: `Brush "${b.id}" fully contains "${a.id}" - redundant geometry`,
                            brushIds: [a.id, b.id],
                        });
                    }
                    // Partial overlaps are often intentional, so we skip those
                }
            }
        }
    }

    /**
     * Check if two brushes overlap.
     */
    private brushesOverlap(a: Brush, b: Brush): boolean {
        return (
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y &&
            a.z < b.z + b.depth &&
            a.z + a.depth > b.z
        );
    }

    /**
     * Check if brush a fully contains brush b.
     */
    private brushContains(a: Brush, b: Brush): boolean {
        return (
            a.x <= b.x &&
            a.y <= b.y &&
            a.z <= b.z &&
            a.x + a.width >= b.x + b.width &&
            a.y + a.height >= b.y + b.height &&
            a.z + a.depth >= b.z + b.depth
        );
    }

    /**
     * Check that all entities are in valid locations.
     */
    private checkEntityBounds(): void {
        for (let i = 0; i < this.map.entities.length; i++) {
            const entity = this.map.entities[i];
            const { x, y, z } = entity.position;

            // Check if spawn is inside a solid brush (stuck)
            if (this.isSolidAt(x, y, z)) {
                this.issues.push({
                    type: 'bounds',
                    severity: 'error',
                    message: `Entity "${entity.type}" at (${x},${y},${z}) is inside solid geometry`,
                    location: { x, y, z },
                    entityIndex: i,
                });
            }

            // Check if there's floor below spawn
            if (!this.isSolidAt(x, y - 1, z)) {
                this.issues.push({
                    type: 'missing_floor',
                    severity: 'warning',
                    message: `Entity "${entity.type}" at (${x},${y},${z}) has no floor below`,
                    location: { x, y, z },
                    entityIndex: i,
                });
            }
        }
    }

    /**
     * Check for required spawn points.
     */
    private checkSpawnPoints(): void {
        const playerSpawns = this.map.entities.filter(e => e.type === 'player_spawn');
        const enemySpawns = this.map.entities.filter(e => e.type === 'enemy_spawn');

        if (playerSpawns.length === 0) {
            this.issues.push({
                type: 'no_spawn',
                severity: 'error',
                message: 'Map has no player spawn point',
            });
        }

        if (enemySpawns.length === 0) {
            this.issues.push({
                type: 'no_spawn',
                severity: 'warning',
                message: 'Map has no enemy spawn points',
            });
        }
    }

    /**
     * Check for leaks (gaps in the perimeter that allow outside access).
     * Uses flood-fill from outside the map bounds.
     */
    private checkForLeaks(): void {
        // Get map bounds
        const bounds = this.getMapBounds();
        if (!bounds) return;

        // Expand bounds by 1 to create an "outside" layer
        const { min, max } = bounds;
        const outsideMin = { x: min.x - 1, y: min.y - 1, z: min.z - 1 };
        const outsideMax = { x: max.x + 1, y: max.y + 1, z: max.z + 1 };

        // Get spawn positions to check if leak reaches them
        const spawnPositions = this.map.entities
            .filter(e => e.type.endsWith('_spawn'))
            .map(e => e.position);

        if (spawnPositions.length === 0) return;

        // Flood-fill from outside corner
        const visited = new Set<string>();
        const queue: Array<{ x: number; y: number; z: number }> = [
            { x: outsideMin.x, y: min.y + 1, z: outsideMin.z } // Start outside at floor level
        ];

        const leakPoints: Array<{ x: number; y: number; z: number }> = [];
        let reachedSpawn = false;

        while (queue.length > 0) {
            const pos = queue.shift()!;
            const key = `${pos.x},${pos.y},${pos.z}`;

            if (visited.has(key)) continue;
            visited.add(key);

            // Check bounds
            if (pos.x < outsideMin.x || pos.x > outsideMax.x ||
                pos.y < outsideMin.y || pos.y > outsideMax.y ||
                pos.z < outsideMin.z || pos.z > outsideMax.z) {
                continue;
            }

            // Check if solid
            if (this.isSolidAt(pos.x, pos.y, pos.z)) {
                continue;
            }

            // Check if we reached a spawn point
            for (const spawn of spawnPositions) {
                if (Math.floor(spawn.x) === pos.x &&
                    Math.floor(spawn.y) === pos.y &&
                    Math.floor(spawn.z) === pos.z) {
                    reachedSpawn = true;
                }
            }

            // Track leak boundary (where outside meets inside)
            if (pos.x >= min.x && pos.x <= max.x &&
                pos.y >= min.y && pos.y <= max.y &&
                pos.z >= min.z && pos.z <= max.z) {
                leakPoints.push(pos);
            }

            // Add neighbors (6-connected)
            queue.push({ x: pos.x + 1, y: pos.y, z: pos.z });
            queue.push({ x: pos.x - 1, y: pos.y, z: pos.z });
            queue.push({ x: pos.x, y: pos.y + 1, z: pos.z });
            queue.push({ x: pos.x, y: pos.y - 1, z: pos.z });
            queue.push({ x: pos.x, y: pos.y, z: pos.z + 1 });
            queue.push({ x: pos.x, y: pos.y, z: pos.z - 1 });
        }

        if (reachedSpawn && leakPoints.length > 0) {
            // Find the entry point (first leak point at boundary)
            const entryPoint = leakPoints[0];
            this.issues.push({
                type: 'leak',
                severity: 'warning',
                message: `Map has a leak at approximately (${entryPoint.x},${entryPoint.y},${entryPoint.z}) - outside can reach spawn areas`,
                location: entryPoint,
            });
        }
    }

    /**
     * Check that floor exists under walkable areas.
     */
    private checkFloorCoverage(): void {
        for (const entity of this.map.entities) {
            if (!entity.type.endsWith('_spawn')) continue;

            const { x, y, z } = entity.position;

            // Check a small area around the spawn for floor
            let hasFloor = false;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (this.isSolidAt(x + dx, y - 1, z + dz)) {
                        hasFloor = true;
                        break;
                    }
                }
                if (hasFloor) break;
            }

            if (!hasFloor) {
                this.issues.push({
                    type: 'missing_floor',
                    severity: 'error',
                    message: `No floor coverage near ${entity.type} at (${x},${y},${z})`,
                    location: { x, y, z },
                });
            }
        }
    }

    /**
     * Get the bounding box of all brushes.
     */
    private getMapBounds(): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null {
        if (this.map.brushes.length === 0) return null;

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const brush of this.map.brushes) {
            minX = Math.min(minX, brush.x);
            minY = Math.min(minY, brush.y);
            minZ = Math.min(minZ, brush.z);
            maxX = Math.max(maxX, brush.x + brush.width);
            maxY = Math.max(maxY, brush.y + brush.height);
            maxZ = Math.max(maxZ, brush.z + brush.depth);
        }

        return {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ },
        };
    }

    /**
     * Check for holes in the perimeter that would let players fall off the map.
     * Scans all edges of the floor and ensures walls exist at floor level.
     */
    private checkPerimeterHoles(): void {
        const bounds = this.getMapBounds();
        if (!bounds) return;

        const { min, max } = bounds;
        const floorY = 1; // Standard floor level (on top of floor brush at y=0)
        const holes: Array<{ x: number; z: number; edge: string }> = [];

        // Check north edge (z = min.z)
        for (let x = Math.floor(min.x); x <= Math.floor(max.x); x++) {
            if (!this.isSolidAt(x, floorY, Math.floor(min.z))) {
                // Check if this is walkable area (not outside)
                if (this.isSolidAt(x, 0, Math.floor(min.z) + 1)) {
                    holes.push({ x, z: Math.floor(min.z), edge: 'north' });
                }
            }
        }

        // Check south edge (z = max.z - 1)
        for (let x = Math.floor(min.x); x <= Math.floor(max.x); x++) {
            if (!this.isSolidAt(x, floorY, Math.floor(max.z) - 1)) {
                if (this.isSolidAt(x, 0, Math.floor(max.z) - 2)) {
                    holes.push({ x, z: Math.floor(max.z) - 1, edge: 'south' });
                }
            }
        }

        // Check west edge (x = min.x)
        for (let z = Math.floor(min.z); z <= Math.floor(max.z); z++) {
            if (!this.isSolidAt(Math.floor(min.x), floorY, z)) {
                if (this.isSolidAt(Math.floor(min.x) + 1, 0, z)) {
                    holes.push({ x: Math.floor(min.x), z, edge: 'west' });
                }
            }
        }

        // Check east edge (x = max.x - 1)
        for (let z = Math.floor(min.z); z <= Math.floor(max.z); z++) {
            if (!this.isSolidAt(Math.floor(max.x) - 1, floorY, z)) {
                if (this.isSolidAt(Math.floor(max.x) - 2, 0, z)) {
                    holes.push({ x: Math.floor(max.x) - 1, z, edge: 'east' });
                }
            }
        }

        // Group holes by edge and report
        const edgeHoles = new Map<string, number>();
        for (const hole of holes) {
            edgeHoles.set(hole.edge, (edgeHoles.get(hole.edge) || 0) + 1);
        }

        for (const [edge, count] of edgeHoles) {
            const sample = holes.find(h => h.edge === edge)!;
            this.issues.push({
                type: 'perimeter_hole',
                severity: 'error',
                message: `${count} hole(s) in ${edge} perimeter wall near (${sample.x}, 1, ${sample.z}) - players can fall off!`,
                location: { x: sample.x, y: 1, z: sample.z },
            });
        }
    }

    /**
     * Check for floating brushes that aren't connected to the floor or other brushes.
     */
    private checkFloatingBrushes(): void {
        const scale = this.map.scale || 2;

        for (const brush of this.map.brushes) {
            // Skip floor brushes (y=0)
            if (brush.y === 0) continue;

            // Check if brush is touching floor (y position starts at 1, which is on top of floor at y=0)
            const touchesFloor = brush.y <= 1;

            // Check if brush is touching any other brush below it
            let hasSupport = touchesFloor;

            if (!hasSupport) {
                // Check if there's a solid brush directly below
                for (const other of this.map.brushes) {
                    if (other.id === brush.id) continue;
                    if (other.type !== 'solid' && other.type !== 'detail') continue;

                    // Check if other brush is directly below and overlaps in X/Z
                    const topOfOther = other.y + other.height;
                    const brushesOverlapXZ = (
                        brush.x < other.x + other.width &&
                        brush.x + brush.width > other.x &&
                        brush.z < other.z + other.depth &&
                        brush.z + brush.depth > other.z
                    );

                    // Other brush's top touches or is close to this brush's bottom
                    if (brushesOverlapXZ && Math.abs(topOfOther - brush.y) < 0.5) {
                        hasSupport = true;
                        break;
                    }
                }
            }

            if (!hasSupport) {
                this.issues.push({
                    type: 'floating_brush',
                    severity: 'error',
                    message: `Brush "${brush.id}" at y=${brush.y} is floating (not connected to floor or other brushes)`,
                    location: { x: brush.x, y: brush.y, z: brush.z },
                    brushIds: [brush.id],
                });
            }
        }
    }

    /**
     * Check that all brushes fit within skybox bounds.
     * Skybox is a sphere with radius ~90, so we use 80 as safe limit.
     */
    private checkSkyboxBounds(): void {
        const scale = this.map.scale || 2;
        const MAX_WORLD_COORD = 80; // Skybox radius is 90, use 80 for safety margin

        for (const brush of this.map.brushes) {
            // Calculate world coordinates
            const worldMinX = brush.x * scale;
            const worldMaxX = (brush.x + brush.width) * scale;
            const worldMinZ = brush.z * scale;
            const worldMaxZ = (brush.z + brush.depth) * scale;
            const worldMaxY = (brush.y + brush.height) * scale;

            // Check if any corner exceeds skybox bounds
            const exceedsList: string[] = [];

            if (Math.abs(worldMinX) > MAX_WORLD_COORD || Math.abs(worldMaxX) > MAX_WORLD_COORD) {
                exceedsList.push(`X: ${worldMinX.toFixed(0)} to ${worldMaxX.toFixed(0)}`);
            }
            if (Math.abs(worldMinZ) > MAX_WORLD_COORD || Math.abs(worldMaxZ) > MAX_WORLD_COORD) {
                exceedsList.push(`Z: ${worldMinZ.toFixed(0)} to ${worldMaxZ.toFixed(0)}`);
            }
            if (worldMaxY > MAX_WORLD_COORD) {
                exceedsList.push(`Y: up to ${worldMaxY.toFixed(0)}`);
            }

            if (exceedsList.length > 0) {
                this.issues.push({
                    type: 'skybox_bounds',
                    severity: 'warning',
                    message: `Brush "${brush.id}" exceeds skybox bounds (max ${MAX_WORLD_COORD}): ${exceedsList.join(', ')}`,
                    location: { x: brush.x, y: brush.y, z: brush.z },
                    brushIds: [brush.id],
                });
            }
        }
    }

    /**
     * Calculate map statistics.
     */
    private calculateStats(): ValidationResult['stats'] {
        const solidBrushes = this.map.brushes.filter(b => b.type === 'solid').length;
        const detailBrushes = this.map.brushes.filter(b => b.type === 'detail').length;
        const playerSpawns = this.map.entities.filter(e => e.type === 'player_spawn').length;
        const enemySpawns = this.map.entities.filter(e => e.type === 'enemy_spawn').length;

        return {
            totalBrushes: this.map.brushes.length,
            solidBrushes,
            detailBrushes,
            totalEntities: this.map.entities.length,
            playerSpawns,
            enemySpawns,
        };
    }

    /**
     * Format validation result as a human-readable report.
     */
    public static formatReport(result: ValidationResult): string {
        const lines: string[] = [];

        lines.push('=== MAP VALIDATION REPORT ===');
        lines.push('');

        // Stats
        lines.push('STATISTICS:');
        lines.push(`  Total Brushes: ${result.stats.totalBrushes}`);
        lines.push(`    Solid: ${result.stats.solidBrushes}`);
        lines.push(`    Detail: ${result.stats.detailBrushes}`);
        lines.push(`  Total Entities: ${result.stats.totalEntities}`);
        lines.push(`    Player Spawns: ${result.stats.playerSpawns}`);
        lines.push(`    Enemy Spawns: ${result.stats.enemySpawns}`);
        lines.push('');

        // Issues
        const errors = result.issues.filter(i => i.severity === 'error');
        const warnings = result.issues.filter(i => i.severity === 'warning');
        const infos = result.issues.filter(i => i.severity === 'info');

        if (errors.length > 0) {
            lines.push(`ERRORS (${errors.length}):`);
            for (const issue of errors) {
                lines.push(`  ❌ [${issue.type}] ${issue.message}`);
            }
            lines.push('');
        }

        if (warnings.length > 0) {
            lines.push(`WARNINGS (${warnings.length}):`);
            for (const issue of warnings) {
                lines.push(`  ⚠️  [${issue.type}] ${issue.message}`);
            }
            lines.push('');
        }

        if (infos.length > 0) {
            lines.push(`INFO (${infos.length}):`);
            for (const issue of infos) {
                lines.push(`  ℹ️  [${issue.type}] ${issue.message}`);
            }
            lines.push('');
        }

        // Summary
        if (result.valid) {
            lines.push('✅ MAP VALID - No critical errors found');
        } else {
            lines.push('❌ MAP INVALID - Fix errors before using');
        }

        return lines.join('\n');
    }
}
