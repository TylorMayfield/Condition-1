import * as THREE from 'three';
import { Game } from '../engine/Game';
import { Enemy } from './Enemy';
import { AIPersonality, AIState } from './components/EnemyAI';

export const SquadOrder = {
    Follow: 0,
    Hold: 1,
    Attack: 2
} as const;
export type SquadOrder = (typeof SquadOrder)[keyof typeof SquadOrder];

export const SquadOrderName = {
    [SquadOrder.Follow]: 'Follow',
    [SquadOrder.Hold]: 'Hold',
    [SquadOrder.Attack]: 'Attack'
};

export class SquadMember extends Enemy {
    public currentOrder: SquadOrder = SquadOrder.Follow;
    public orderTarget: THREE.Vector3 | null = null; // Position to hold or attack

    constructor(game: Game, position: THREE.Vector3, name: string) {
        super(game, position);

        // Visual Distinction (Green/Blue)
        if (this.mesh) {
            this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    (child.material as THREE.MeshStandardMaterial).color.setHex(0x0000ff);
                }
            });
        }

        // Override AI config?
        // Actually, we might need a distinct AI class or configure the existing one.
        // For now, let's just override update logic or extend EnemyAI if possible.
        // But Enemy uses private AI.
        // Let's modify Enemy to allow access or subclassing AI.
        // FOR NOW: We'll assume friendly fire logic needs to check 'instanceof SquadMember'
    }

    public update(dt: number) {
        super.update(dt);

        // Override AI behavior based on orders
        // This is tricky if AI is private in Enemy.
        // Ideally, we refactor Enemy to have a more flexible AI controller.
        // For MVP: We keep Enemy logic but force state overrides? 
        // Or we Re-implement update to bypass EnemyAI and use SquadAI?
    }

    // Command Interface
    public setOrder(order: SquadOrder, target?: THREE.Vector3) {
        this.currentOrder = order;
        if (target) this.orderTarget = target;
        console.log(`Squad Member recieved order: ${SquadOrderName[order]}`);
    }
}
