import * as THREE from 'three';

/**
 * EditorBrush - Represents a mutable 3D brush (box) in the editor.
 */
export class EditorBrush {
    public mesh: THREE.Mesh;
    private selectionBox: THREE.BoxHelper;
    private id: string;

    // Logical properties
    private size: THREE.Vector3; // Dimensions
    private materialNames: string[] = ['concrete', 'concrete', 'concrete', 'concrete', 'concrete', 'concrete'];
    private materials: THREE.MeshStandardMaterial[];

    constructor(position: THREE.Vector3, size: THREE.Vector3 = new THREE.Vector3(1, 1, 1), materialName: string = 'concrete') {
        this.id = Math.random().toString(36).substr(2, 9);
        this.size = size.clone();
        this.materialNames.fill(materialName);

        // Create Mesh
        const geometry = new THREE.BoxGeometry(1, 1, 1); // Unit box

        // Create 6 materials
        this.materials = Array(6).fill(null).map(() => new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.8,
            metalness: 0.2
        }));

        this.mesh = new THREE.Mesh(geometry, this.materials);
        this.mesh.position.copy(position);
        this.mesh.scale.copy(size);
        this.mesh.userData.editorBrush = this; // Link back to logic object

        // Selection helper
        this.selectionBox = new THREE.BoxHelper(this.mesh, 0xffff00);
        this.selectionBox.visible = false;
        this.mesh.add(this.selectionBox);
    }

    public setMaterial(faceIndex: number, name: string): void {
        if (faceIndex >= 0 && faceIndex < 6) {
            this.materialNames[faceIndex] = name;
            // Visual update (random color for now to distinguish)
            // In real app, load texture from AssetManager
            const color = new THREE.Color().setHex(Math.random() * 0xffffff);
            this.materials[faceIndex].color = color;
            this.materials[faceIndex].needsUpdate = true;
        }
    }

    public getMaterialName(faceIndex: number): string {
        return this.materialNames[faceIndex];
    }

    public getMesh(): THREE.Mesh {
        return this.mesh;
    }

    public getId(): string {
        return this.id;
    }

    public setSelected(selected: boolean): void {
        this.selectionBox.visible = selected;
    }

    public resize(newSize: THREE.Vector3): void {
        this.size.copy(newSize);
        this.mesh.scale.copy(this.size);
        this.selectionBox.update();
    }
}
