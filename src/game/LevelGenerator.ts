import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { Enemy } from './Enemy';
import { DestructibleWall } from './components/DestructibleWall';

export class LevelGenerator {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public generate(playerTarget?: GameObject) {
        // Floor
        this.createBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(50, 1, 50), 0);

        // Random Walls
        for (let i = 0; i < 20; i++) {
            const x = (Math.random() - 0.5) * 40;
            const z = (Math.random() - 0.5) * 40;
            // Don't spawn on spawn point
            if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

            // 30% chance of Destructible Wall
            if (Math.random() < 0.3) {
                const w = 2 + Math.random() * 2;
                const h = 2 + Math.random() * 2;
                new DestructibleWall(this.game, new THREE.Vector3(x, 0, z), w, h);
            } else {
                const w = 1 + Math.random() * 5;
                const h = 2 + Math.random() * 3;
                const d = 1 + Math.random() * 5;
                this.createBox(new THREE.Vector3(x, h / 2, z), new THREE.Vector3(w, h, d), 0);
            }
        }

        // Random Enemies
        if (playerTarget) {
            for (let i = 0; i < 5; i++) {
                const x = (Math.random() - 0.5) * 30;
                const z = (Math.random() - 0.5) * 30;
                // Avoid spawn
                if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

                const enemy = new Enemy(this.game, new THREE.Vector3(x, 1, z));
                // AI automatically targets player via Game.player
                this.game.addGameObject(enemy);
            }
        }
    }

    private createBox(pos: THREE.Vector3, size: THREE.Vector3, mass: number = 0) {
        const go = new GameObject(this.game);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        go.body = new CANNON.Body({
            mass: mass,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape
        });

        // Visuals
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }
}
