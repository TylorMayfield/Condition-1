import * as THREE from 'three';
import { Enemy } from '../Enemy';

export class AIMovement {
    private owner: Enemy;
    private moveSpeed: number = 3;

    constructor(owner: Enemy) {
        this.owner = owner;
    }

    public setSpeed(speed: number) {
        this.moveSpeed = speed;
    }

    public moveTowards(targetPos: THREE.Vector3) {
        if (!this.owner.body) return;

        const dir = new THREE.Vector3(
            targetPos.x - this.owner.body.position.x,
            0,
            targetPos.z - this.owner.body.position.z
        ).normalize();

        this.owner.body.velocity.x = dir.x * this.moveSpeed;
        this.owner.body.velocity.z = dir.z * this.moveSpeed;

        // Rotation handled by lookAt separately or here? 
        // Let's keep rotation explicit in AI brain or here.
        // Usually moving implies looking, but strafing exists.
        // For now, let's keep it simple: Controller moves, Brain looks.
    }

    public stop() {
        if (!this.owner.body) return;
        this.owner.body.velocity.x = 0;
        this.owner.body.velocity.z = 0;
    }

    public lookAt(targetPos: THREE.Vector3) {
        if (!this.owner.mesh) return;
        this.owner.mesh.lookAt(targetPos.x, this.owner.mesh.position.y, targetPos.z);
    }
}
