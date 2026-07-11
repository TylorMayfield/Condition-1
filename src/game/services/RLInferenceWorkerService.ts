export type RLInferenceWorkerRequest = {
    type: 'predict';
    observation: Float32Array;
    requestId: number;
};

export type RLInferenceWorkerResponse = {
    type: 'action';
    requestId: number;
    action: Float32Array;
};

/**
 * Batches RL policy inference in a worker for training mode with many agents.
 */
export class RLInferenceWorkerService {
    private worker: Worker | null = null;
    private nextRequestId = 0;
    private pending = new Map<number, (action: Float32Array) => void>();

    constructor() {
        if (typeof Worker !== 'undefined') {
            try {
                this.worker = new Worker(
                    new URL('../../workers/rl-inference.worker.ts', import.meta.url),
                    { type: 'module' },
                );
                this.worker.onmessage = (event: MessageEvent<RLInferenceWorkerResponse>) => {
                    const { requestId, action } = event.data;
                    const resolve = this.pending.get(requestId);
                    if (resolve) {
                        this.pending.delete(requestId);
                        resolve(action);
                    }
                };
            } catch {
                this.worker = null;
            }
        }
    }

    isAvailable(): boolean {
        return this.worker !== null;
    }

    predict(observation: Float32Array): Promise<Float32Array | null> {
        if (!this.worker) return Promise.resolve(null);

        const requestId = this.nextRequestId++;
        return new Promise((resolve) => {
            this.pending.set(requestId, resolve);
            this.worker!.postMessage(
                { type: 'predict', observation, requestId } satisfies RLInferenceWorkerRequest,
                [observation.buffer],
            );
        });
    }

    dispose(): void {
        this.worker?.terminate();
        this.worker = null;
        this.pending.clear();
    }
}
