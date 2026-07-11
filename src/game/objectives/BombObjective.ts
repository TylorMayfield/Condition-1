import * as THREE from 'three';
import { ObjectiveState, type MatchRules } from '../gamemodes/round/MatchTypes';

export interface BombActor { id: string; team: 'TaskForce' | 'OpFor'; position: THREE.Vector3; alive: boolean; hasDefuseKit?: boolean; }

export class BombObjective {
    public state: ObjectiveState = ObjectiveState.Carried;
    public carrierId: string | null = null;
    public position = new THREE.Vector3();
    public plantedSite: string | null = null;
    public timeRemaining = 0;
    public interactionProgress = 0;
    private readonly rules: MatchRules;

    constructor(rules: MatchRules) { this.rules = rules; }
    reset(carrierId: string): void { this.state = ObjectiveState.Carried; this.carrierId = carrierId; this.plantedSite = null; this.timeRemaining = 0; this.cancelInteraction(); }
    drop(position: THREE.Vector3): void { this.state = ObjectiveState.Dropped; this.carrierId = null; this.position.copy(position); this.cancelInteraction(); }
    pickup(actor: BombActor): boolean {
        if (this.state !== ObjectiveState.Dropped || actor.team !== 'OpFor' || !actor.alive || actor.position.distanceTo(this.position) > 2) return false;
        this.state = ObjectiveState.Carried; this.carrierId = actor.id; return true;
    }
    updatePlant(actor: BombActor, siteId: string | null, interacting: boolean, dt: number): boolean {
        if (this.state !== ObjectiveState.Carried && this.state !== ObjectiveState.Planting) return false;
        if (actor.id !== this.carrierId || actor.team !== 'OpFor' || !actor.alive || !siteId || !interacting) { this.cancelPlant(); return false; }
        this.state = ObjectiveState.Planting; this.interactionProgress += dt;
        if (this.interactionProgress < this.rules.plantTime) return false;
        this.state = ObjectiveState.Planted; this.position.copy(actor.position); this.plantedSite = siteId; this.carrierId = null; this.timeRemaining = this.rules.bombTime; this.cancelInteraction(); return true;
    }
    updateDefuse(actor: BombActor, interacting: boolean, dt: number): boolean {
        if (this.state !== ObjectiveState.Planted && this.state !== ObjectiveState.Defusing) return false;
        if (actor.team !== 'TaskForce' || !actor.alive || actor.position.distanceTo(this.position) > 2 || !interacting) { this.cancelDefuse(); return false; }
        this.state = ObjectiveState.Defusing; this.interactionProgress += dt;
        const required = actor.hasDefuseKit ? this.rules.defuseKitTime : this.rules.defuseTime;
        if (this.interactionProgress < required) return false;
        this.state = ObjectiveState.Defused; this.cancelInteraction(); return true;
    }
    update(dt: number): boolean {
        if (this.state !== ObjectiveState.Planted && this.state !== ObjectiveState.Defusing) return false;
        this.timeRemaining = Math.max(0, this.timeRemaining - dt);
        if (this.timeRemaining > 0) return false;
        this.state = ObjectiveState.Exploded; this.cancelInteraction(); return true;
    }
    canActorFinishDefuse(actor: BombActor): boolean { return this.timeRemaining >= (actor.hasDefuseKit ? this.rules.defuseKitTime : this.rules.defuseTime); }
    private cancelPlant(): void { if (this.state === ObjectiveState.Planting) this.state = ObjectiveState.Carried; this.cancelInteraction(); }
    private cancelDefuse(): void { if (this.state === ObjectiveState.Defusing) this.state = ObjectiveState.Planted; this.cancelInteraction(); }
    private cancelInteraction(): void { this.interactionProgress = 0; }
}
