import * as CANNON from 'cannon-es';
import { GameObject } from '../engine/GameObject';
import { Game } from '../engine/Game';
import { PlayerController } from './components/PlayerController';
import { WeaponSystem } from './components/WeaponSystem';

export class Player extends GameObject {
    public health: number = 100;

    private controller: PlayerController;
    private weapon: WeaponSystem;

    constructor(game: Game) {
        super(game);

        // Physics Body
        const radius = 0.5;
        const shape = new CANNON.Sphere(radius);
        this.body = new CANNON.Body({
            mass: 1, // Dynamic
            position: new CANNON.Vec3(0, 5, 0), // Spawn higher
            shape: shape,
            fixedRotation: true, // Prevent rolling
            material: new CANNON.Material({ friction: 0, restitution: 0 })
        });
        this.body.linearDamping = 0.9;

        // Init Components
        this.controller = new PlayerController(game, this);
        this.weapon = new WeaponSystem(game);
    }

    public update(dt: number) {
        super.update(dt);

        // Delegate to components
        this.controller.update(dt);
        this.weapon.update(dt, this.game.camera, this.controller);

        this.updateHUD();
    }

    public getCurrentWeapon() {
        return this.weapon;
    }

    private updateHUD() {
        // Old HUD logic disabled
    }
}
