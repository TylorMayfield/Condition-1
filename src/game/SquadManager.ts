import { Game } from '../engine/Game';
import { SquadMember, SquadOrder, SquadOrderName } from './SquadMember';
import * as THREE from 'three';

export class SquadManager {
    private game: Game;
    public members: SquadMember[] = [];
    public currentOrder: SquadOrder = SquadOrder.Follow;

    constructor(game: Game) {
        this.game = game;
    }

    public init() {
        // Spawn Bravo
        const startPos = new THREE.Vector3(5, 0.8, 0); // Near player spawn, at floor level
        const bravo = new SquadMember(this.game, startPos, "Bravo");
        this.game.addGameObject(bravo);
        this.members.push(bravo);

        console.log("Squad Initialized: Bravo joined.");
    }

    public issueOrder(order: SquadOrder) {
        this.currentOrder = order;
        console.log(`Squad Order Issued: ${SquadOrderName[order]}`);


        if (order === SquadOrder.Follow) {
            // Target is Player (handled in AI update usually, or pass player pos)
            // SquadMember logic will handle 'Follow' by tracking player.
        } else if (order === SquadOrder.Hold) {
            // Target is current position? or Player's look target?
            // For simplicity: Hold current position.
            // Or Hold Position where Player is looking? (Ping)
            // Let's hold current position of each member.
        } else if (order === SquadOrder.Attack) {
            // Attack at will. Target is irrelevant or 'Find Enemies'.
        }

        this.members.forEach(m => {
            if (order === SquadOrder.Hold) {
                m.setOrder(order, m.body?.position ? new THREE.Vector3(m.body.position.x, m.body.position.y, m.body.position.z) : undefined);
            } else {
                m.setOrder(order);
            }
        });

        // Update HUD
        this.updateHUD();
    }

    public updateHUD() {
        if (this.game.hudManager) {
            this.game.hudManager.updateSquadOrder(this.currentOrder);
        }
    }

    public update(_dt: number) {
        // Monitor squad status
    }
}
