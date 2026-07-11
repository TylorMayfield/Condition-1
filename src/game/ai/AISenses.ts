import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { Enemy } from '../Enemy';

export class AISenses {
    private game: Game;
    private owner: Enemy;

    // Stats
    public sightRange: number = 30;
    public fov: number = 0.42; // Deliberate forward vision without tunnel vision.
    public peripheralFov: number = 0.45; // wider cone for "something moved" checks

    constructor(game: Game, owner: Enemy) {
        this.game = game;
        this.owner = owner;
    }

    public config(sightRange: number, fov: number) {
        this.sightRange = sightRange;
        this.fov = fov;
    }

    public canSee(target: any): boolean {
        // Accept any object with a body property (GameObject or Player)
        const body = this.owner.body;
        const mesh = this.owner.mesh;
        const targetBody = target.body;

        if (!body || !mesh || !targetBody) return false;

        const targetPos = targetBody.position;

        // 1. Distance Check
        const dist = body.position.distanceTo(targetPos);
        if (dist > this.sightRange) return false;

        // 2. Cone of Vision
        const toTarget = new THREE.Vector3(targetPos.x - body.position.x, 0, targetPos.z - body.position.z).normalize();
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).normalize();

        const dot = forward.dot(toTarget);
        // Nearby threats are noticed peripherally; distant threats require the view cone.
        if (dist > 7 && dot < this.fov) return false;

        // 3. Line of Sight (Raycast)
        const start = new CANNON.Vec3(body.position.x, body.position.y + 0.5, body.position.z);
        const end = new CANNON.Vec3(targetPos.x, targetPos.y + 0.5, targetPos.z);

        let closestBody: CANNON.Body | null = null;
        let closestDistance = Infinity;
        this.game.world.raycastAll(start, end, { skipBackfaces: true }, (result) => {
            if (!result.body || result.body === body || result.distance >= closestDistance) return;
            closestDistance = result.distance;
            closestBody = result.body;
        });
        return closestBody === null || closestBody === targetBody;
    }
}
