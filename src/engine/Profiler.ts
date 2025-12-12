import * as THREE from 'three';

export class Profiler {
    private measurements: Map<string, number> = new Map();
    private startTimes: Map<string, number> = new Map();
    private container: HTMLElement;
    private lastUpdate: number = 0;
    private frames: number = 0;
    private maxTimes: Map<string, number> = new Map(); // Track max per interval

    constructor() {
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '10px',
            right: '10px', // Top-Right, below likely FPS counter if any, or just visible
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: '#0f0',
            fontFamily: 'monospace',
            padding: '10px',
            pointerEvents: 'none',
            zIndex: '10000',
            whiteSpace: 'pre',
            borderRadius: '4px',
            fontSize: '12px',
            minWidth: '150px'
        });
        document.body.appendChild(this.container);
    }

    private frameDurations: Map<string, number> = new Map(); // Accumulator for current frame

    public start(label: string) {
        this.startTimes.set(label, performance.now());
    }

    public end(label: string) {
        const start = this.startTimes.get(label);
        if (start !== undefined) {
            const duration = performance.now() - start;

            // Accumulate for this frame (handling multiple calls per frame)
            const current = this.frameDurations.get(label) || 0;
            this.frameDurations.set(label, current + duration);

            // Track Max (immediate for spikes)
            const currentMax = this.maxTimes.get(label) || 0;
            if (duration > currentMax) {
                this.maxTimes.set(label, duration);
            }
        }
    }

    public update(renderer?: THREE.WebGLRenderer) {
        // Apply accumulated durations to measurements (EMA)
        for (const [label, totalDuration] of this.frameDurations) {
            const prev = this.measurements.get(label) || 0;
            // Use faster convergence (0.2) since we update once per frame now
            this.measurements.set(label, prev * 0.8 + totalDuration * 0.2);
        }
        this.frameDurations.clear();

        this.frames++;
        const now = performance.now();
        if (now - this.lastUpdate >= 500) { // Update UI every 500ms
            this.renderUI(renderer);
            this.lastUpdate = now;
            this.frames = 0;
        }
    }

    private renderUI(renderer?: THREE.WebGLRenderer) {
        let text = '=== PROFILER ===\n';
        // let total = 0;

        // Sort by duration desc
        const sorted = [...this.measurements.entries()].sort((a, b) => b[1] - a[1]);

        for (const [label, ms] of sorted) {
            const max = this.maxTimes.get(label) || 0;
            text += `${label.padEnd(12)}: ${ms.toFixed(2)}ms (Max: ${max.toFixed(2)})\n`;
        }

        // Reset Max every update to show recent spikes
        this.maxTimes.clear();

        // text += `----------------\n`;
        // text += `Sum         : ${total.toFixed(2)}ms`;

        if (renderer) {
            text += `----------------\n`;
            text += `Calls       : ${renderer.info.render.calls}\n`;
            text += `Triangles   : ${renderer.info.render.triangles}\n`;
            text += `Textures    : ${renderer.info.memory.textures}\n`;
            text += `Geometries  : ${renderer.info.memory.geometries}\n`;
        }

        this.container.textContent = text;
    }
}
