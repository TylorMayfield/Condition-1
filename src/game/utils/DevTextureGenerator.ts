import * as THREE from 'three';

export interface DevTextureOptions {
    color?: number | string;
    width?: number;
    height?: number;
    text?: string;
    gridSize?: number;
}

export class DevTextureGenerator {
    private static textureCache: Map<string, THREE.Texture> = new Map();

    /**
     * Get or create a dev texture for a specific material type.
     */
    public static getTexture(name: string, options: DevTextureOptions = {}): THREE.Texture {
        const key = `${name}-${JSON.stringify(options)}`;
        if (this.textureCache.has(key)) {
            return this.textureCache.get(key)!;
        }

        const texture = this.createTexture(name, options);
        this.textureCache.set(key, texture);
        return texture;
    }

    private static createTexture(name: string, options: DevTextureOptions): THREE.Texture {
        const width = options.width || 512;
        const height = options.height || 512;
        const baseColor = new THREE.Color(options.color || 0x888888);

        // NODE.JS FALLBACK (Server-side baking)
        if (typeof document === 'undefined') {
            // Return a simple DataTexture or just a null texture (since physics don't care)
            // But visuals might expect a texture.
            // Let's create a 1x1 DataTexture of the color.
            const size = 1;
            const data = new Uint8Array(4);
            const r = Math.floor(baseColor.r * 255);
            const g = Math.floor(baseColor.g * 255);
            const b = Math.floor(baseColor.b * 255);
            data[0] = r;
            data[1] = g;
            data[2] = b;
            data[3] = 255;
            
            const texture = new THREE.DataTexture(data, 1, 1);
            texture.needsUpdate = true;
            return texture;
        }

        const gridSize = options.gridSize || 64;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // Fill Background
        ctx.fillStyle = `#${baseColor.getHexString()}`;
        ctx.fillRect(0, 0, width, height);

        // Draw Grid
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 2;

        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw Cross (X)
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(width, height);
        ctx.moveTo(width, 0);
        ctx.lineTo(0, height);
        ctx.stroke();

        // Draw Border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 8;
        ctx.strokeRect(0, 0, width, height);

        // Draw Text
        const text = options.text || name.toUpperCase();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(text, width / 2, height / 2);

        // Draw Texture Size
        ctx.font = '24px monospace';
        ctx.fillText(`${width}x${height}`, width / 2, height - 30);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 4;
        texture.colorSpace = THREE.SRGBColorSpace;

        return texture;
    }
}
