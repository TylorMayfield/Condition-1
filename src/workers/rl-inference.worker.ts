/** RL inference worker stub — runs policy.predict off the main thread for many agents. */
export type RLWorkerRequest = {
    type: 'predict';
    observation: Float32Array;
    requestId: number;
};

export type RLWorkerResponse = {
    type: 'action';
    requestId: number;
    action: Float32Array;
};

self.onmessage = (event: MessageEvent<RLWorkerRequest>) => {
    const { type, requestId, observation } = event.data;
    if (type === 'predict') {
        // TODO: Load ONNX/tfjs model and run inference
        const action = new Float32Array(observation.length);
        (self as unknown as { postMessage: (message: RLWorkerResponse, transfer: Transferable[]) => void })
            .postMessage({ type: 'action', requestId, action }, [action.buffer]);
    }
};

self.postMessage({ type: 'ready' });
