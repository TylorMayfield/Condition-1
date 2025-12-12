import * as THREE from 'three';

export interface EntityProperty {
    key: string;
    value: string;
}

export class EditorEntity {
    public id: string;
    public type: string;
    public position: THREE.Vector3;
    public properties: EntityProperty[] = [];
    public mesh: THREE.Mesh;

    private selectionBox: THREE.BoxHelper;

    constructor(type: string, position: THREE.Vector3) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.type = type;
        this.position = position.clone();

        // Visual rep
        const geometry = new THREE.SphereGeometry(0.5, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);

        // Offset for origin? VMF ent origins are usually center. 
        // Our sphere is center-based. 
        // But map builder usually places feet at position.
        // Let's assume position is origin.

        this.mesh.userData.editorEntity = this;

        this.selectionBox = new THREE.BoxHelper(this.mesh, 0xffff00);
        this.selectionBox.visible = false;
        this.mesh.add(this.selectionBox);
    }

    public setSelected(selected: boolean): void {
        this.selectionBox.visible = selected;
    }

    public setPosition(pos: THREE.Vector3): void {
        this.position.copy(pos);
        this.mesh.position.copy(pos);
    }

    public getMesh(): THREE.Mesh {
        return this.mesh;
    }
}
