import { Game } from '../engine/Game';
import { SquadMember } from './SquadMember';
import * as THREE from 'three';

export class SquadManager {
    private game: Game;
    public members: SquadMember[] = [];


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

    // Command Interface (Deprecated/Removed)
    // AI is now autonomous

    public addMember(member: SquadMember) {
        this.game.addGameObject(member);
        this.members.push(member);
    }

    public update(_dt: number) {
        // Monitor squad status
    }
}
