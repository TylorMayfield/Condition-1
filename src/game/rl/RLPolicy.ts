// RL Policy - Interface for loading and running trained models
// Supports ONNX format for cross-platform inference

import type { Observation, Action } from './EnvWrapper';

/**
 * Abstract policy interface - can be implemented with different backends
 */
export interface IRLPolicy {
    /** Load model from file */
    load(modelPath: string): Promise<void>;

    /** Get action from observation */
    predict(observation: Observation): Action;

    /** Check if model is loaded */
    isLoaded(): boolean;
}

/**
 * Simple scripted policy for testing (mimics basic tactical behavior)
 */
export class ScriptedPolicy implements IRLPolicy {
    private loaded = false;

    async load(_modelPath: string): Promise<void> {
        // No actual loading needed for scripted policy
        this.loaded = true;
        console.log('[ScriptedPolicy] Loaded (fallback scripted behavior)');
    }

    predict(obs: Observation): Action {
        // Basic heuristic: if health low, be more defensive
        const isLowHealth = obs.health < 30;
        const hasEnemyInSight = obs.visionGrid.some(v => v > 0);

        return {
            // Move towards center if low health, otherwise random
            moveX: isLowHealth ? 0 : (Math.random() * 0.5 - 0.25),
            moveZ: isLowHealth ? -0.5 : (Math.random() * 0.8),
            // Look around
            yaw: Math.random() * 0.2 - 0.1,
            pitch: 0,
            // Fire if enemy in sight
            fire: hasEnemyInSight ? 1 : 0,
            // Crouch when low health
            crouchToggle: isLowHealth && Math.random() > 0.9 ? 1 : 0,
            // Use grenade occasionally
            throwGrenade: hasEnemyInSight && obs.grenades > 0 && Math.random() > 0.95 ? 1 : 0,
            sprint: 0,
            jump: 0,
            lean: 0
        };
    }

    isLoaded(): boolean {
        return this.loaded;
    }
}

/**
 * ONNX-based policy (placeholder - requires onnxruntime-web)
 * To use: npm install onnxruntime-web
 */
export class ONNXPolicy implements IRLPolicy {
    private session: any = null;
    private loaded = false;

    async load(modelPath: string): Promise<void> {
        try {
            // Dynamic import to avoid issues if onnxruntime not installed
            const ort = await import('onnxruntime-web');
            this.session = await ort.InferenceSession.create(modelPath);
            this.loaded = true;
            console.log(`[ONNXPolicy] Loaded model from ${modelPath}`);
        } catch (err) {
            console.error('[ONNXPolicy] Failed to load model:', err);
            throw err;
        }
    }

    predict(obs: Observation): Action {
        if (!this.session) {
            throw new Error('Model not loaded');
        }

        // Convert observation to tensor format
        const inputData = this.observationToTensor(obs);

        // Run inference (synchronous for game loop)
        // Note: In production, you'd want to batch this or run async
        const feeds = { input: inputData };
        const results = this.session.run(feeds);

        return this.tensorToAction(results);
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    private observationToTensor(obs: Observation): Float32Array {
        // Flatten observation into a single tensor
        const data: number[] = [
            ...obs.position,
            ...obs.velocity,
            obs.health / 100,  // Normalize
            obs.armor / 100,
            obs.weaponId / 10,
            obs.ammo / 30,
            obs.crouch,
            obs.grenades / 4,
            obs.team,
            ...obs.visionGrid,
        ];
        return new Float32Array(data);
    }

    private tensorToAction(output: any): Action {
        // Parse model output into action
        const data = output.output.data as Float32Array;
        return {
            moveX: Math.max(-1, Math.min(1, data[0])),
            moveZ: Math.max(-1, Math.min(1, data[1])),
            yaw: data[2],
            pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, data[3])),
            fire: data[4] > 0.5 ? 1 : 0,
            crouchToggle: data[5] > 0.5 ? 1 : 0,
            throwGrenade: data[6] > 0.5 ? 1 : 0,
            sprint: 0, // Not trained yet
            jump: 0,   // Not trained yet
            lean: 0    // Not trained yet
        };
    }
}

/**
 * Factory function to create the appropriate policy
 */
export function createPolicy(type: 'scripted' | 'onnx' = 'scripted'): IRLPolicy {
    switch (type) {
        case 'onnx':
            return new ONNXPolicy();
        case 'scripted':
        default:
            return new ScriptedPolicy();
    }
}
