import type { Vector3 } from 'three';
import type { Enemy } from '../../Enemy';
import type { Observation, Action } from '../../rl/EnvWrapper';

export interface TrainedBot {
    bot: Enemy;
    lastObs: Observation | null;
    lastAction: Action | null;
    lastLogProb: number;
    lastValue: number;
    lastEnemyDamage: number;
    lastFriendlyDamage: number;
    spawnPosition: Vector3;
    stuckTimer: number;
}
