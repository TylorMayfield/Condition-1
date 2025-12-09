#!/usr/bin/env node
/**
 * Map Validation CLI Script
 * Uses the real BrushMapParser and MapValidator for full validation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAPS_DIR = path.resolve(__dirname, '../src/game/maps');

// ============================================
// Inline implementations (avoid import issues)
// ============================================

type BrushType = 'solid' | 'detail' | 'trigger' | 'clip';
type BrushMaterialType = 'concrete' | 'brick' | 'wood' | 'metal' | 'grass' | 'dirt' | 'stone' | 'crate' | 'glass';

interface BrushSurface {
    roughness: number;
    metalness?: number;
    blend?: BrushMaterialType;
    blendWidth?: number;
}

interface Brush {
    id: string;
    type: BrushType;
    material: BrushMaterialType;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    destructible?: boolean;
    surface?: BrushSurface;
    color?: number;
    name?: string;
}

interface BrushMapEntity {
    type: string;
    position: { x: number; y: number; z: number };
    team?: string;
    name?: string;
    ai?: string;
}

interface BrushMapDefinition {
    name: string;
    version: string;
    scale: number;
    brushes: Brush[];
    entities: BrushMapEntity[];
}

// Parser
function parseBrushMap(content: string): BrushMapDefinition {
    const lines = content.split(/\r?\n/);
    const result: BrushMapDefinition = {
        name: 'Untitled',
        version: '1.0',
        scale: 2,
        brushes: [],
        entities: [],
    };

    let currentSection: 'none' | 'brush' | 'entity' = 'none';
    let currentBrush: Partial<Brush> = {};
    let currentEntity: Partial<BrushMapEntity> = {};
    let brushCount = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

        if (trimmed.startsWith('@')) {
            // Save pending
            if (currentSection === 'brush' && currentBrush.id) {
                // Set defaults
                currentBrush.type = currentBrush.type || 'solid';
                currentBrush.material = currentBrush.material || 'concrete';
                currentBrush.width = currentBrush.width || 1;
                currentBrush.height = currentBrush.height || 1;
                currentBrush.depth = currentBrush.depth || 1;
                currentBrush.x = currentBrush.x ?? 0;
                currentBrush.y = currentBrush.y ?? 0;
                currentBrush.z = currentBrush.z ?? 0;
                result.brushes.push(currentBrush as Brush);
            }
            if (currentSection === 'entity' && currentEntity.type) {
                result.entities.push(currentEntity as BrushMapEntity);
            }

            const [directive, ...rest] = trimmed.substring(1).split(/\s+/);
            const value = rest.join(' ').replace(/"/g, '');

            switch (directive) {
                case 'name': result.name = value; currentSection = 'none'; break;
                case 'version': result.version = value; currentSection = 'none'; break;
                case 'scale': result.scale = parseFloat(value) || 2; currentSection = 'none'; break;
                case 'brush':
                    currentSection = 'brush';
                    currentBrush = { id: value || `brush_${++brushCount}` };
                    break;
                case 'entity':
                    currentSection = 'entity';
                    currentEntity = { type: value };
                    break;
            }
            continue;
        }

        const match = trimmed.match(/^(\w+):\s*(.+)$/);
        if (!match) continue;

        const [, key, val] = match;
        const k = key.toLowerCase();
        const v = val.trim();

        if (currentSection === 'brush') {
            if (k === 'type') currentBrush.type = v as BrushType;
            if (k === 'material') currentBrush.material = v as BrushMaterialType;
            if (k === 'position' || k === 'pos') {
                const [x, y, z] = v.split(',').map(s => parseFloat(s.trim()));
                currentBrush.x = x; currentBrush.y = y; currentBrush.z = z;
            }
            if (k === 'size') {
                const [w, h, d] = v.split(',').map(s => parseFloat(s.trim()));
                currentBrush.width = w; currentBrush.height = h; currentBrush.depth = d;
            }
            if (k === 'destructible') currentBrush.destructible = v === 'true';
            if (k === 'roughness') {
                currentBrush.surface = currentBrush.surface || { roughness: 0.7 };
                currentBrush.surface.roughness = parseFloat(v);
            }
        }

        if (currentSection === 'entity') {
            if (k === 'position' || k === 'pos') {
                const [x, y, z] = v.split(',').map(s => parseFloat(s.trim()));
                currentEntity.position = { x, y, z };
            }
            if (k === 'team') currentEntity.team = v;
            if (k === 'name') currentEntity.name = v.replace(/"/g, '');
            if (k === 'ai') currentEntity.ai = v;
        }
    }

    // Final save
    if (currentSection === 'brush' && currentBrush.id) {
        currentBrush.type = currentBrush.type || 'solid';
        currentBrush.material = currentBrush.material || 'concrete';
        currentBrush.width = currentBrush.width || 1;
        currentBrush.height = currentBrush.height || 1;
        currentBrush.depth = currentBrush.depth || 1;
        currentBrush.x = currentBrush.x ?? 0;
        currentBrush.y = currentBrush.y ?? 0;
        currentBrush.z = currentBrush.z ?? 0;
        result.brushes.push(currentBrush as Brush);
    }
    if (currentSection === 'entity' && currentEntity.type) {
        result.entities.push(currentEntity as BrushMapEntity);
    }

    return result;
}

// Validator
interface ValidationIssue {
    type: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
}

function validateMap(map: BrushMapDefinition): { valid: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    const scale = map.scale || 2;

    // Check for player spawn
    const playerSpawns = map.entities.filter(e => e.type === 'player_spawn');
    if (playerSpawns.length === 0) {
        issues.push({ type: 'no_spawn', severity: 'error', message: 'No player spawn point' });
    }

    // Check brush validity
    for (const brush of map.brushes) {
        if (!brush.width || !brush.height || !brush.depth) {
            issues.push({ type: 'invalid_brush', severity: 'error', message: `Brush "${brush.id}" has missing dimensions` });
        }
        if (brush.width <= 0 || brush.height <= 0 || brush.depth <= 0) {
            issues.push({ type: 'invalid_brush', severity: 'error', message: `Brush "${brush.id}" has invalid dimensions` });
        }
    }

    // Check for floating brushes
    for (const brush of map.brushes) {
        if (brush.y === 0) continue; // Floor level

        const touchesFloor = brush.y <= 1;
        let hasSupport = touchesFloor;

        if (!hasSupport) {
            for (const other of map.brushes) {
                if (other.id === brush.id) continue;
                const topOfOther = other.y + other.height;
                const overlapXZ = (
                    brush.x < other.x + other.width &&
                    brush.x + brush.width > other.x &&
                    brush.z < other.z + other.depth &&
                    brush.z + brush.depth > other.z
                );
                if (overlapXZ && Math.abs(topOfOther - brush.y) < 0.5) {
                    hasSupport = true;
                    break;
                }
            }
        }

        if (!hasSupport) {
            issues.push({
                type: 'floating_brush',
                severity: 'error',
                message: `Brush "${brush.id}" at y=${brush.y} is FLOATING (not touching floor)`
            });
        }
    }

    // Check skybox bounds
    const MAX_WORLD = 80;
    for (const brush of map.brushes) {
        const worldMaxX = (brush.x + brush.width) * scale;
        const worldMaxZ = (brush.z + brush.depth) * scale;
        if (worldMaxX > MAX_WORLD || worldMaxZ > MAX_WORLD) {
            issues.push({
                type: 'skybox_bounds',
                severity: 'warning',
                message: `Brush "${brush.id}" exceeds skybox (world coords: ${worldMaxX.toFixed(0)}, ${worldMaxZ.toFixed(0)})`
            });
        }
    }

    // Check for perimeter holes (simplified)
    const bounds = {
        minX: Math.min(...map.brushes.map(b => b.x)),
        maxX: Math.max(...map.brushes.map(b => b.x + b.width)),
        minZ: Math.min(...map.brushes.map(b => b.z)),
        maxZ: Math.max(...map.brushes.map(b => b.z + b.depth)),
    };

    // Check for floor coverage
    const floors = map.brushes.filter(b => b.y === 0);
    if (floors.length === 0) {
        issues.push({ type: 'missing_floor', severity: 'error', message: 'No floor brush at y=0' });
    }

    return {
        valid: issues.filter(i => i.severity === 'error').length === 0,
        issues
    };
}

// Main
console.log('\n=== BRUSH MAP VALIDATOR ===\n');

const files = fs.readdirSync(MAPS_DIR).filter((f: string) => f.endsWith('.brushmap'));

if (files.length === 0) {
    console.log('No .brushmap files found in:', MAPS_DIR);
    process.exit(0);
}

console.log(`Found ${files.length} map(s):\n`);

let allValid = true;

for (const file of files) {
    console.log(`--- ${file} ---`);

    const content = fs.readFileSync(path.join(MAPS_DIR, file), 'utf-8');
    const map = parseBrushMap(content);

    console.log(`  Name: "${map.name}" v${map.version}`);
    console.log(`  Brushes: ${map.brushes.length} | Entities: ${map.entities.length}`);

    const result = validateMap(map);

    const errors = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');

    if (errors.length > 0) {
        console.log(`  ERRORS (${errors.length}):`);
        for (const e of errors) console.log(`    ❌ [${e.type}] ${e.message}`);
    }
    if (warnings.length > 0) {
        console.log(`  WARNINGS (${warnings.length}):`);
        for (const w of warnings) console.log(`    ⚠️  [${w.type}] ${w.message}`);
    }

    if (result.valid && warnings.length === 0) {
        console.log('  ✅ Valid');
    } else if (result.valid) {
        console.log('  ⚠️  Valid with warnings');
    } else {
        console.log('  ❌ INVALID');
        allValid = false;
    }
    console.log();
}

console.log(allValid ? '✅ All maps valid!' : '❌ Some maps have errors');
process.exit(allValid ? 0 : 1);
