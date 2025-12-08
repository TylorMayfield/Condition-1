import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';

export class DestructibleWall {
    private game: Game;

    constructor(game: Game, position: THREE.Vector3, width: number, height: number) {
        this.game = game;
        this.generate(position, width, height);
    }

    private generate(pos: THREE.Vector3, width: number, height: number) {
        const brickSize = { x: 0.5, y: 0.5, z: 0.5 };
        const rows = Math.floor(height / brickSize.y);
        const cols = Math.floor(width / brickSize.x);

        const startX = pos.x - (cols * brickSize.x) / 2 + brickSize.x / 2;
        const startY = pos.y + brickSize.y / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const p = new THREE.Vector3(
                    startX + c * brickSize.x,
                    startY + r * brickSize.y,
                    pos.z
                );
                this.createBrick(p, brickSize);
            }
        }
    }

    private createBrick(pos: THREE.Vector3, size: { x: number, y: number, z: number }) {
        const go = new GameObject(this.game);

        // Visuals
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;
        this.game.scene.add(go.mesh);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        go.body = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape,
            material: new CANNON.Material({ friction: 0.5, restitution: 0.1 })
        });

        go.body.sleep();
        go.body.allowSleep = true;
        go.body.sleepSpeedLimit = 0.5;
        go.body.sleepTimeLimit = 1;

        this.game.world.addBody(go.body);

        // Game object management
        this.game.addGameObject(go);
    }

    public update() {
        // No-op needed if bricks are game objects
    }
}
