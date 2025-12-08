import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy';

export class AISenses {
    private game: Game;
    private owner: Enemy;

    // Stats
    public sightRange: number = 20;
    public fov: number = 0.5; // Dot product

    constructor(game: Game, owner: Enemy) {
        this.game = game;
        this.owner = owner;
    }

    public config(sightRange: number, fov: number) {
        this.sightRange = sightRange;
        this.fov = fov;
    }

    public canSeePlayer(): boolean {
        const body = this.owner.body;
        const mesh = this.owner.mesh;
        const playerBody = this.game.player.body;

        if (!body || !mesh || !playerBody) return false;

        const playerPos = playerBody.position;

        // 1. Distance Check
        const dist = body.position.distanceTo(playerPos);
        if (dist > this.sightRange) return false;

        // 2. Cone of Vision
        const toPlayer = new THREE.Vector3(playerPos.x - body.position.x, 0, playerPos.z - body.position.z).normalize();
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).normalize();

        const dot = forward.dot(toPlayer);
        if (dot < this.fov) return false;

        // 3. Line of Sight (Raycast)
        const start = new CANNON.Vec3(body.position.x, body.position.y + 0.5, body.position.z);
        const end = new CANNON.Vec3(playerPos.x, playerPos.y + 0.5, playerPos.z);

        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: result });

        if (result.hasHit) {
            // Check if we hit something other than the player
            // Ideally we check result.body === playerBody
            if (result.body && result.body !== playerBody) {
                return false;
            }
        }

        return true;
    }
}
