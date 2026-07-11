import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@engine': path.resolve(__dirname, 'src/engine'),
            '@game': path.resolve(__dirname, 'src/game'),
            '@config': path.resolve(__dirname, 'src/config'),
        },
    },
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.test.ts'],
    },
});
