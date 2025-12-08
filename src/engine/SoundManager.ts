import * as THREE from 'three';
import { EnemyAI } from '../game/components/EnemyAI';

export class SoundManager {
    private listeners: EnemyAI[] = [];

    public registerListener(listener: EnemyAI) {
        this.listeners.push(listener);
    }

    public unregisterListener(listener: EnemyAI) {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    public emitSound(position: THREE.Vector3, radius: number) {
        console.log(`Sound emitted at ${position.toArray()} with radius ${radius}`);
        this.listeners.forEach(listener => {
            if (listener.getOwnerPosition()) {
                const dist = listener.getOwnerPosition()!.distanceTo(position);
                if (dist <= radius) {
                    listener.onHearSound(position);
                }
            }
        });
    }
}
