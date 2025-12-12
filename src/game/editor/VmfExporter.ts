import * as THREE from 'three';
import { LevelEditor } from './LevelEditor';
import { EditorBrush } from './EditorBrush';
import { EditorEntity } from './EditorEntity';

export class VmfExporter {
    private editor: LevelEditor;
    private buffer: string[] = [];
    private idCounter: number = 1;

    constructor(editor: LevelEditor) {
        this.editor = editor;
    }

    public export(): string {
        this.buffer = [];
        this.idCounter = 1;

        // Header
        this.write('versioninfo', {
            "editorversion": "400",
            "editorbuild": "8864",
            "mapversion": "1",
            "formatversion": "100",
            "prefab": "0"
        });

        this.write('visgroups', {});

        this.write('viewsettings', {
            "bSnapToGrid": "1",
            "bShowGrid": "1",
            "bShowLogicalGrid": "0",
            "nGridSpacing": "64",
            "bShow3DGrid": "0"
        });

        this.write('world', {
            "id": this.nextId().toString(),
            "mapversion": "1",
            "classname": "worldspawn",
            "skyname": "sky_day01_01"
        }, () => {
            // Brushes
            for (const brush of this.editor.brushes) {
                this.writeBrush(brush);
            }
        });

        // Entities
        for (const entity of this.editor.entities) {
            this.writeEntity(entity);
        }

        return this.buffer.join('\n');
    }

    private writeBrush(brush: EditorBrush): void {
        const mesh = brush.getMesh();
        const box = new THREE.Box3().setFromObject(mesh);
        const min = box.min;
        const max = box.max;

        this.write('solid', {
            "id": this.nextId().toString()
        }, () => {
            // 6 Sides
            // Order: Z+, Z-, Y+, Y-, X+, X- (Standard Hammer order usually)
            // But actually just need valid planes.

            // Top (Y+)
            this.writeSide(
                [min.x, max.y, max.z], [max.x, max.y, max.z], [max.x, max.y, min.z],
                brush.getMaterialName(2) // 2 is typically Top in BoxGeometry? No, standard order is: +x, -x, +y, -y, +z, -z.
                // BoxGeometry materials: 0:x+, 1:x-, 2:y+, 3:y-, 4:z+, 5:z-
            );

            // Bottom (Y-)
            this.writeSide(
                [min.x, min.y, min.z], [max.x, min.y, min.z], [max.x, min.y, max.z],
                brush.getMaterialName(3)
            );

            // Front (Z+)
            this.writeSide(
                [min.x, max.y, max.z], [min.x, min.y, max.z], [max.x, min.y, max.z],
                brush.getMaterialName(4)
            );

            // Back (Z-)
            this.writeSide(
                [max.x, max.y, min.z], [max.x, min.y, min.z], [min.x, min.y, min.z],
                brush.getMaterialName(5)
            );

            // Right (X+)
            this.writeSide(
                [max.x, max.y, max.z], [max.x, min.y, max.z], [max.x, min.y, min.z],
                brush.getMaterialName(0)
            );

            // Left (X-)
            this.writeSide(
                [min.x, max.y, min.z], [min.x, min.y, min.z], [min.x, min.y, max.z],
                brush.getMaterialName(1)
            );

        });
    }

    private writeSide(p1: number[], p2: number[], p3: number[], material: string): void {
        this.write('side', {
            "id": this.nextId().toString(),
            "plane": `(${p1.join(' ')}) (${p2.join(' ')}) (${p3.join(' ')})`,
            "material": material.toUpperCase(),
            "uaxis": "[1 0 0 0] 0.25", // Default Texture mapping
            "vaxis": "[0 0 -1 0] 0.25",
            "rotation": "0",
            "lightmapscale": "16",
            "smoothing_groups": "0"
        });
    }

    private writeEntity(entity: EditorEntity): void {
        this.write('entity', {
            "id": this.nextId().toString(),
            "classname": entity.type,
            "origin": `${entity.position.x} ${entity.position.y} ${entity.position.z}`
        }, () => {
            // Additional properties
            for (const prop of entity.properties) {
                this.buffer.push(`\t"${prop.key}" "${prop.value}"`);
            }
        });
    }

    private write(type: string, props: Record<string, string>, content?: () => void): void {
        this.buffer.push(type);
        this.buffer.push('{');
        for (const key in props) {
            this.buffer.push(`\t"${key}" "${props[key]}"`);
        }
        if (content) {
            content();
        }
        this.buffer.push('}');
    }

    private nextId(): number {
        return this.idCounter++;
    }
}
