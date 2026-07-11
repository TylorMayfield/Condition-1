/**
 * Offloads navmesh generation to a Web Worker so large maps don't block the main thread.
 * Falls back to main-thread generation when workers are unavailable.
 */

export type NavMeshWorkerRequest =
    | { type: 'generate'; geometry: Float32Array; positions: Float32Array }
    | { type: 'cancel' };

export type NavMeshWorkerResponse =
    | { type: 'ready' }
    | { type: 'progress'; percent: number }
    | { type: 'complete'; navMeshData: ArrayBuffer }
    | { type: 'error'; message: string };

export class NavMeshWorkerService {
    private worker: Worker | null = null;
    private ready = false;

    constructor() {
        if (typeof Worker !== 'undefined') {
            try {
                this.worker = new Worker(
                    new URL('../../workers/navmesh.worker.ts', import.meta.url),
                    { type: 'module' },
                );
                this.worker.onmessage = (event: MessageEvent<NavMeshWorkerResponse>) => {
                    if (event.data.type === 'ready') {
                        this.ready = true;
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

    dispose(): void {
        this.worker?.terminate();
        this.worker = null;
        this.ready = false;
    }

    /** Placeholder — wire to RecastNavigation.generateFromScene data when ready. */
    async generate(_geometry: Float32Array, _positions: Float32Array): Promise<ArrayBuffer | null> {
        if (!this.worker) return null;
        // Future: postMessage and await complete response
        return null;
    }
}
