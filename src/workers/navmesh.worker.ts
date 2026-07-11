/** Navmesh worker stub — receives geometry and will run Recast bake off the main thread. */
export type NavMeshWorkerMessage = { type: 'generate' } | { type: 'cancel' };

self.onmessage = (event: MessageEvent<NavMeshWorkerMessage>) => {
    if (event.data.type === 'generate') {
        // TODO: Port Recast navmesh bake here using transferred geometry buffers
        self.postMessage({ type: 'complete', navMeshData: new ArrayBuffer(0) });
    }
};

self.postMessage({ type: 'ready' });
