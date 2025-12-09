import * as THREE from 'three';

// Types representing VMF structure
export interface VmfSolid {
    id: string;
    sides: VmfSide[];
}

export interface VmfSide {
    id: string;
    plane: THREE.Plane; // The math plane
    planePoints: THREE.Vector3[]; // The 3 points defining the plane from VMF
    material: string;
    uaxis: string;
    vaxis: string;
}

export interface VmfEntity {
    id: string;
    classname: string;
    origin?: THREE.Vector3;
    properties: Record<string, string>;
    solids?: VmfSolid[]; // Some entities like func_detail have solids
}

export interface VmfMap {
    version: string;
    world: {
        solids: VmfSolid[];
        skyname: string;
    };
    entities: VmfEntity[];
}

export class VmfParser {
    public static parse(content: string): VmfMap {
        const root = this.parseKeyValues(content);
        return this.processMapData(root);
    }

    // --- KeyValues Parsing ---

    private static parseKeyValues(content: string): any {
        const result: any = {};
        const stack: any[] = [result];
        let currentKey = '';

        // Simple tokenizer for KeyValues
        // Remove comments //
        const cleanContent = content.replace(/\/\/.*$/gm, '');

        const tokens = cleanContent.match(/"[^"]*"|[{}a-zA-Z0-9_.-]+/g) || [];

        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i];

            // Strip quotes
            if (token.startsWith('"') && token.endsWith('"')) {
                token = token.slice(1, -1);
            }

            if (token === '{') {
                const newObj: any = {};
                // If currentKey is valid, add it. If it exists, make array.
                const parent = stack[stack.length - 1];

                if (Array.isArray(parent[currentKey])) {
                    parent[currentKey].push(newObj);
                } else if (parent[currentKey]) {
                    parent[currentKey] = [parent[currentKey], newObj];
                } else {
                    parent[currentKey] = newObj;
                }

                stack.push(newObj);
                currentKey = '';
            } else if (token === '}') {
                stack.pop();
            } else {
                // Peek next
                const next = tokens[i + 1];
                if (next === '{') {
                    // It's a block name
                    currentKey = token;
                    // Fix for duplicate keys like "solid" or "entity" -> ensure array from start if known type
                    const parent = stack[stack.length - 1];
                    if ((token === 'solid' || token === 'entity' || token === 'side') && !parent[token]) {
                        parent[token] = [];
                    }
                } else {
                    // It's a key-value pair
                    i++; // consume value
                    let value = tokens[i];
                    if (value && value.startsWith('"') && value.endsWith('"')) {
                        value = value.slice(1, -1);
                    }

                    const obj = stack[stack.length - 1];
                    obj[token] = value;
                }
            }
        }

        return result;
    }

    private static processMapData(root: any): VmfMap {
        const world = Array.isArray(root.world) ? root.world[0] : root.world;

        const map: VmfMap = {
            version: root.versioninfo?.mapversion || '0',
            world: {
                solids: [],
                skyname: world.skyname || 'sky_day01_01'
            },
            entities: []
        };

        // Process World Solids
        if (world && world.solid) {
            const solids = Array.isArray(world.solid) ? world.solid : [world.solid];
            map.world.solids = solids.map((s: any) => this.processSolid(s));
        }

        // Process Entities
        if (root.entity) {
            const entities = Array.isArray(root.entity) ? root.entity : [root.entity];
            map.entities = entities.map((e: any) => this.processEntity(e));
        }

        return map;
    }

    private static processSolid(data: any): VmfSolid {
        if (!data || !data.side) {
            return {
                id: data?.id || 'unknown',
                sides: []
            };
        }

        const sidesData = Array.isArray(data.side) ? data.side : [data.side];

        const sides = sidesData
            .filter((side: any) => side && side.plane) // Filter invalid sides
            .map((side: any) => {
                const points = this.parsePlane(side.plane);
                // Create THREE.Plane from 3 points
                const plane = new THREE.Plane();
                plane.setFromCoplanarPoints(points[0], points[1], points[2]);

                return {
                    id: side.id,
                    plane: plane,
                    planePoints: points,
                    material: side.material,
                    uaxis: side.uaxis,
                    vaxis: side.vaxis
                };
            });

        return {
            id: data.id,
            sides: sides
        };
    }

    private static processEntity(data: any): VmfEntity {
        const entity: VmfEntity = {
            id: data.id,
            classname: data.classname,
            properties: { ...data },
            solids: []
        };

        if (data.origin) {
            const [x, y, z] = data.origin.split(' ').map(parseFloat);
            // Convert Source to Three.js coords: x=x, y=z, z=-y (Source Z is up, Three Y is up)
            // Actually, let's keep it 1:1 first then rotate world. 
            // Standard Source: T(x, y, z) -> T(x, z, -y) is common for Y-up engines.
            // Condition-1 uses Y-up. Source uses Z-up.
            // Source: X=East, Y=North, Z=Up
            // Three: X=Right, Y=Up, Z=Back (South)
            // Let's create a helper for conversion later. For now parse raw.
            entity.origin = new THREE.Vector3(x, y, z);
        }

        if (data.solid) {
            const solids = Array.isArray(data.solid) ? data.solid : [data.solid];
            entity.solids = solids.map((s: any) => this.processSolid(s));
        }

        return entity;
    }

    private static parsePlane(planeStr: string): THREE.Vector3[] {
        // Format: "(x1 y1 z1) (x2 y2 z2) (x3 y3 z3)"
        const parts = planeStr.replace(/[()]/g, '').split(/\s+/).map(parseFloat);
        return [
            new THREE.Vector3(parts[0], parts[1], parts[2]),
            new THREE.Vector3(parts[3], parts[4], parts[5]),
            new THREE.Vector3(parts[6], parts[7], parts[8])
        ];
    }
}
