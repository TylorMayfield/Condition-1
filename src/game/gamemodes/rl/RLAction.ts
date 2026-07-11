import type { Enemy } from '../../Enemy';
import type { Action } from '../../rl/EnvWrapper';

export function applyRLAction(bot: Enemy, action: Action): void {
    const baseSpeed = 5;
    const speed = action.sprint > 0.5 ? baseSpeed * 1.5 : baseSpeed;

    const body = bot.body;
    const mesh = bot.mesh;

    if (body) {
        body.velocity.x = action.moveX * speed;
        body.velocity.z = action.moveZ * speed;
        if (action.jump > 0.5) bot.jump();
    }

    if (mesh) {
        mesh.rotation.y = action.yaw;
    }

    bot.setLookAngles(action.yaw, action.pitch);

    if (bot.lean) bot.lean(action.lean);

    if (action.fire > 0.5) bot.fireAtLookDirection();
    if (action.throwGrenade > 0.5) bot.throwGrenade();
    if (action.crouchToggle > 0.5) bot.toggleCrouch();
}
