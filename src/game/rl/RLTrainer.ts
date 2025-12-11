// In-Browser RL Trainer using TensorFlow.js
// This runs entirely within the game client - no external Python needed

import * as tf from '@tensorflow/tfjs';
import type { Observation, Action } from './EnvWrapper';

/**
 * PPO-style policy network that can be trained in-browser
 */
export class RLTrainer {
    private policyNetwork: tf.LayersModel | null = null;
    private valueNetwork: tf.LayersModel | null = null;
    private policyOptimizer: tf.Optimizer;
    private valueOptimizer: tf.Optimizer;

    // Training config
    private readonly learningRate = 0.0003;
    private readonly gamma = 0.99;           // Discount factor
    private readonly epsilon = 0.2;          // PPO clip range
    private readonly entropyCoef = 0.01;     // Entropy bonus

    // Experience buffer
    private experiences: {
        obs: number[];
        action: number[];
        reward: number;
        nextObs: number[];
        done: boolean;
        logProb: number;
        value: number;
    }[] = [];

    private readonly batchSize = 64;
    private readonly bufferSize = 2048;

    // Statistics
    public episodeReward = 0;
    public episodeCount = 0;
    public avgReward = 0;
    public trainingSteps = 0;

    constructor() {
        // Use SEPARATE optimizers for each network to avoid shape conflicts
        this.policyOptimizer = tf.train.adam(this.learningRate);
        this.valueOptimizer = tf.train.adam(this.learningRate);
        this.buildNetworks();
    }

    /** Build the policy and value networks */
    private buildNetworks(): void {
        const inputSize = 3 + 3 + 1 + 1 + 1 + 1 + 1 + 1 + 1; // pos, vel, health, armor, weapon, ammo, crouch, grenades, team
        // Note: visionGrid (32*32=1024) is large - we'll use a simplified version
        const totalInputSize = inputSize + 64; // Simplified vision (8x8)

        // Policy network (actor) - outputs action probabilities
        this.policyNetwork = tf.sequential({
            layers: [
                tf.layers.dense({ inputShape: [totalInputSize], units: 128, activation: 'relu' }),
                tf.layers.dense({ units: 128, activation: 'relu' }),
                tf.layers.dense({ units: 64, activation: 'relu' }),
                // Output: moveX, moveZ, yaw, pitch, fire, crouch, grenade (continuous + discrete)
                tf.layers.dense({ units: 7, activation: 'tanh' })
            ]
        });

        // Value network (critic) - estimates state value
        this.valueNetwork = tf.sequential({
            layers: [
                tf.layers.dense({ inputShape: [totalInputSize], units: 128, activation: 'relu' }),
                tf.layers.dense({ units: 64, activation: 'relu' }),
                tf.layers.dense({ units: 1 })
            ]
        });

        console.log('[RLTrainer] Networks initialized');
    }

    /** Convert observation to tensor-friendly format */
    private obsToArray(obs: Observation): number[] {
        // Simplified vision: downsample 32x32 to 8x8
        const simplifiedVision: number[] = [];
        for (let i = 0; i < 64; i++) {
            const startIdx = i * 16; // 1024/64 = 16
            let sum = 0;
            for (let j = 0; j < 16; j++) {
                sum += obs.visionGrid[startIdx + j] || 0;
            }
            simplifiedVision.push(sum > 0 ? 1 : 0);
        }

        return [
            obs.position[0] / 100, obs.position[1] / 100, obs.position[2] / 100, // Normalize
            obs.velocity[0] / 10, obs.velocity[1] / 10, obs.velocity[2] / 10,
            obs.health / 100,
            obs.armor / 100,
            obs.weaponId / 10,
            obs.ammo / 100,
            obs.crouch,
            obs.grenades / 4,
            obs.team,
            ...simplifiedVision
        ];
    }

    /** Get action from policy network */
    predict(obs: Observation): { action: Action; logProb: number; value: number } {
        if (!this.policyNetwork || !this.valueNetwork) {
            return { action: this.randomAction(), logProb: 0, value: 0 };
        }

        const obsArray = this.obsToArray(obs);
        const obsTensor = tf.tensor2d([obsArray]);

        // Get policy output
        const policyOutput = this.policyNetwork.predict(obsTensor) as tf.Tensor;
        const actionValues = policyOutput.dataSync();

        // Get value estimate
        const valueOutput = this.valueNetwork.predict(obsTensor) as tf.Tensor;
        const value = valueOutput.dataSync()[0];

        // Add exploration noise
        const noise = 0.3;
        const action: Action = {
            moveX: Math.max(-1, Math.min(1, actionValues[0] + (Math.random() - 0.5) * noise)),
            moveZ: Math.max(-1, Math.min(1, actionValues[1] + (Math.random() - 0.5) * noise)),
            yaw: actionValues[2] * Math.PI,
            pitch: actionValues[3] * Math.PI / 2,
            fire: actionValues[4] > 0 ? 1 : 0,
            crouchToggle: actionValues[5] > 0.5 ? 1 : 0,
            throwGrenade: actionValues[6] > 0.8 ? 1 : 0,
        };

        // Approximate log probability (simplified)
        const actionArray = Array.from(actionValues);
        const logProb = -0.5 * actionArray.reduce((sum: number, v: number) => sum + v * v, 0);

        // Clean up tensors
        obsTensor.dispose();
        policyOutput.dispose();
        valueOutput.dispose();

        return { action, logProb, value };
    }

    /** Store experience for training */
    storeExperience(
        obs: Observation,
        action: Action,
        reward: number,
        nextObs: Observation,
        done: boolean,
        logProb: number,
        value: number
    ): void {
        this.experiences.push({
            obs: this.obsToArray(obs),
            action: [action.moveX, action.moveZ, action.yaw / Math.PI, action.pitch / (Math.PI / 2),
            action.fire, action.crouchToggle, action.throwGrenade],
            reward,
            nextObs: this.obsToArray(nextObs),
            done,
            logProb,
            value
        });

        this.episodeReward += reward;

        // Train when buffer is full
        if (this.experiences.length >= this.bufferSize) {
            this.train();
        }
    }

    /** End of episode - update stats */
    endEpisode(): void {
        this.episodeCount++;
        this.avgReward = this.avgReward * 0.9 + this.episodeReward * 0.1;
        console.log(`[RLTrainer] Episode ${this.episodeCount} - Reward: ${this.episodeReward.toFixed(2)}, Avg: ${this.avgReward.toFixed(2)}`);
        this.episodeReward = 0;
    }

    /** Get number of experiences currently in buffer */
    getExperienceCount(): number {
        return this.experiences.length;
    }

    /** Train the networks on collected experiences */
    private train(): void {
        if (!this.policyNetwork || !this.valueNetwork) return;
        if (this.experiences.length < this.batchSize) return;

        console.log(`[RLTrainer] Training on ${this.experiences.length} experiences...`);

        // Compute advantages using GAE
        const advantages = this.computeAdvantages();

        // Convert to tensors
        const obsData = this.experiences.map(e => e.obs);
        const actionData = this.experiences.map(e => e.action);
        const oldLogProbs = this.experiences.map(e => e.logProb);
        const returns = advantages.map((adv, i) => adv + this.experiences[i].value);

        const obsTensor = tf.tensor2d(obsData);
        const actionTensor = tf.tensor2d(actionData);
        const advantageTensor = tf.tensor1d(advantages);
        const returnTensor = tf.tensor1d(returns);
        const oldLogProbTensor = tf.tensor1d(oldLogProbs);

        // Training loop
        for (let epoch = 0; epoch < 4; epoch++) {
            // Policy loss (PPO clipped objective) - use policyOptimizer with policy network weights
            const policyLoss = this.policyOptimizer.minimize(() => {
                const predictions = this.policyNetwork!.predict(obsTensor) as tf.Tensor;
                const newLogProbs = tf.sum(tf.mul(predictions, actionTensor), 1).mul(-0.5);

                const ratio = tf.exp(tf.sub(newLogProbs, oldLogProbTensor));
                const clippedRatio = tf.clipByValue(ratio, 1 - this.epsilon, 1 + this.epsilon);

                const obj1 = tf.mul(ratio, advantageTensor);
                const obj2 = tf.mul(clippedRatio, advantageTensor);

                const policyLoss = tf.neg(tf.mean(tf.minimum(obj1, obj2)));

                // Add entropy bonus
                const entropy = tf.mean(tf.sum(tf.mul(predictions, tf.log(tf.add(tf.abs(predictions), 1e-8))), 1));

                return policyLoss.sub(entropy.mul(this.entropyCoef)) as tf.Scalar;
            }, true) as tf.Scalar;

            // Value loss (MSE) - use valueOptimizer with value network weights
            const valueLoss = this.valueOptimizer.minimize(() => {
                const valuePreds = this.valueNetwork!.predict(obsTensor) as tf.Tensor;
                return tf.losses.meanSquaredError(returnTensor.reshape([-1, 1]), valuePreds) as tf.Scalar;
            }, true) as tf.Scalar;

            if (policyLoss) policyLoss.dispose();
            if (valueLoss) valueLoss.dispose();
        }

        // Clean up
        obsTensor.dispose();
        actionTensor.dispose();
        advantageTensor.dispose();
        returnTensor.dispose();
        oldLogProbTensor.dispose();

        this.trainingSteps++;
        this.experiences = [];

        console.log(`[RLTrainer] Training step ${this.trainingSteps} complete`);
    }

    /** Compute GAE advantages */
    private computeAdvantages(): number[] {
        const advantages: number[] = [];
        let lastAdv = 0;

        for (let i = this.experiences.length - 1; i >= 0; i--) {
            const exp = this.experiences[i];
            const nextValue = i < this.experiences.length - 1 ? this.experiences[i + 1].value : 0;
            const delta = exp.reward + this.gamma * nextValue * (exp.done ? 0 : 1) - exp.value;
            lastAdv = delta + this.gamma * 0.95 * (exp.done ? 0 : 1) * lastAdv;
            advantages.unshift(lastAdv);
        }

        // Normalize advantages
        const mean = advantages.reduce((a, b) => a + b, 0) / advantages.length;
        const std = Math.sqrt(advantages.reduce((a, b) => a + (b - mean) ** 2, 0) / advantages.length) + 1e-8;
        return advantages.map(a => (a - mean) / std);
    }

    /** Random action for exploration */
    private randomAction(): Action {
        return {
            moveX: Math.random() * 2 - 1,
            moveZ: Math.random() * 2 - 1,
            yaw: (Math.random() * 2 - 1) * Math.PI,
            pitch: (Math.random() * 2 - 1) * Math.PI / 2,
            fire: Math.random() > 0.7 ? 1 : 0,
            crouchToggle: Math.random() > 0.95 ? 1 : 0,
            throwGrenade: Math.random() > 0.99 ? 1 : 0,
        };
    }

    /** Save model to browser storage */
    async saveModel(name: string = 'rl-bot'): Promise<void> {
        if (this.policyNetwork && this.valueNetwork) {
            await this.policyNetwork.save(`localstorage://${name}-policy`);
            await this.valueNetwork.save(`localstorage://${name}-value`);
            console.log(`[RLTrainer] Model saved as "${name}"`);
        }
    }

    /** Load model from browser storage */
    async loadModel(name: string = 'rl-bot'): Promise<boolean> {
        try {
            this.policyNetwork = await tf.loadLayersModel(`localstorage://${name}-policy`);
            this.valueNetwork = await tf.loadLayersModel(`localstorage://${name}-value`);
            console.log(`[RLTrainer] Model loaded from "${name}"`);
            return true;
        } catch (e) {
            console.warn(`[RLTrainer] Could not load model "${name}":`, e);
            return false;
        }
    }

    /** Download model as a file (triggers browser download) */
    async downloadModel(filename: string = 'trained-bot'): Promise<void> {
        if (!this.policyNetwork || !this.valueNetwork) {
            console.warn('[RLTrainer] No model to download');
            return;
        }

        // Save policy network
        await this.policyNetwork.save(`downloads://${filename}-policy`);
        // Save value network  
        await this.valueNetwork.save(`downloads://${filename}-value`);

        console.log(`[RLTrainer] Model downloaded as "${filename}-policy" and "${filename}-value"`);
    }

    /** Export model as JSON string (for custom saving) */
    async exportModelJSON(): Promise<{ policy: any; value: any } | null> {
        if (!this.policyNetwork || !this.valueNetwork) {
            return null;
        }

        // Get model topology and weights
        const policyWeights = this.policyNetwork.getWeights();
        const valueWeights = this.valueNetwork.getWeights();

        const policyData = {
            topology: this.policyNetwork.toJSON(),
            weights: await Promise.all(policyWeights.map(async (w, i) => ({
                index: i,
                shape: w.shape,
                data: Array.from(await w.data())
            })))
        };

        const valueData = {
            topology: this.valueNetwork.toJSON(),
            weights: await Promise.all(valueWeights.map(async (w, i) => ({
                index: i,
                shape: w.shape,
                data: Array.from(await w.data())
            })))
        };

        return { policy: policyData, value: valueData };
    }

    /** Save model to a specific file path (for use with file system access API or Electron) */
    async saveModelToPath(basePath: string): Promise<void> {
        const modelData = await this.exportModelJSON();
        if (!modelData) {
            console.warn('[RLTrainer] No model to save');
            return;
        }

        // Create a downloadable blob
        const jsonStr = JSON.stringify(modelData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `${basePath}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[RLTrainer] Model saved to ${basePath}.json`);
    }

    /** Load model from a JSON file (via file input) */
    async loadModelFromFile(file: File): Promise<boolean> {
        try {
            const text = await file.text();
            const modelData = JSON.parse(text);

            // Reconstruct policy network
            this.policyNetwork = await tf.models.modelFromJSON(modelData.policy.topology);
            const policyWeights = modelData.policy.weights.map((w: any) =>
                tf.tensor(w.data, w.shape)
            );
            this.policyNetwork.setWeights(policyWeights);

            // Reconstruct value network
            this.valueNetwork = await tf.models.modelFromJSON(modelData.value.topology);
            const valueWeights = modelData.value.weights.map((w: any) =>
                tf.tensor(w.data, w.shape)
            );
            this.valueNetwork.setWeights(valueWeights);

            console.log(`[RLTrainer] Model loaded from file: ${file.name}`);
            return true;
        } catch (e) {
            console.error('[RLTrainer] Failed to load model from file:', e);
            return false;
        }
    }

    /** Load model from JSON string */
    async loadModelFromJSON(jsonStr: string): Promise<boolean> {
        try {
            const modelData = JSON.parse(jsonStr);

            this.policyNetwork = await tf.models.modelFromJSON(modelData.policy.topology);
            const policyWeights = modelData.policy.weights.map((w: any) =>
                tf.tensor(w.data, w.shape)
            );
            this.policyNetwork.setWeights(policyWeights);

            this.valueNetwork = await tf.models.modelFromJSON(modelData.value.topology);
            const valueWeights = modelData.value.weights.map((w: any) =>
                tf.tensor(w.data, w.shape)
            );
            this.valueNetwork.setWeights(valueWeights);

            console.log('[RLTrainer] Model loaded from JSON');
            return true;
        } catch (e) {
            console.error('[RLTrainer] Failed to load model from JSON:', e);
            return false;
        }
    }

    /** Get training statistics */
    getStats(): { episodes: number; avgReward: number; trainingSteps: number } {
        return {
            episodes: this.episodeCount,
            avgReward: this.avgReward,
            trainingSteps: this.trainingSteps
        };
    }

    /** Dispose of TensorFlow resources */
    dispose(): void {
        if (this.policyNetwork) this.policyNetwork.dispose();
        if (this.valueNetwork) this.valueNetwork.dispose();
    }
}
