import * as THREE from 'three';
import { Game } from '../engine/Game';

export class ExtractionZone {
    private game: Game;
    public mesh: THREE.Mesh;
    private radius: number = 5;
    private position: THREE.Vector3;

    constructor(game: Game, position: THREE.Vector3) {
        this.game = game;
        this.position = position;

        // Visual
        const geo = new THREE.CylinderGeometry(this.radius, this.radius, 10, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(position);
        this.mesh.position.y = 5; // Half height

        this.game.scene.add(this.mesh);

        // Add a light marker
        const light = new THREE.PointLight(0x00ff00, 1, 20);
        light.position.set(0, 0, 0);
        this.mesh.add(light);
    }

    public update(dt: number) {
        // Rotate visual
        this.mesh.rotation.y += dt;

        // Check Player Distance
        const playerPos = this.game.player.body?.position;
        if (playerPos) {
            const dist = new THREE.Vector3(playerPos.x, 0, playerPos.z).distanceTo(new THREE.Vector3(this.position.x, 0, this.position.z));

            if (dist < this.radius) {
                this.triggerExtraction();
            }
        }
    }

    private triggerExtraction() {
        console.log("EXTRACTING...");
        this.game.roundManager.triggerExtractionSuccess();
    }
}
