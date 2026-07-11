import type { Enemy } from '../../Enemy';
import type { Observation } from '../../rl/EnvWrapper';
import type { TrainedBot } from './RLTrainingTypes';

export function computeStepReward(
    bot: Enemy,
    tb: TrainedBot,
    prevObs: Observation,
    currObs: Observation,
): number {
    let reward = 0;

    const enemyDamage = bot.enemyDamageDealt;
    const newEnemyDamage = enemyDamage - tb.lastEnemyDamage;
    if (newEnemyDamage > 0) {
        reward += newEnemyDamage * 0.5;
    }

    const friendlyDamage = bot.friendlyDamageDealt;
    const newFriendlyDamage = friendlyDamage - tb.lastFriendlyDamage;
    if (newFriendlyDamage > 0) {
        reward -= newFriendlyDamage * 1.0;
    }

    tb.lastEnemyDamage = enemyDamage;
    tb.lastFriendlyDamage = friendlyDamage;

    const healthLost = prevObs.health - currObs.health;
    if (healthLost > 0) {
        reward -= healthLost * 0.2;
    }

    if (bot.isDead) {
        reward -= 50;
    }

    if (currObs.isUnderFire && currObs.coverDistance < 0.2) {
        reward += 1.0;
    }

    if (currObs.isUnderFire && currObs.crouch) {
        reward += 0.5;
    }

    return Math.max(-100, Math.min(100, reward));
}
