import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
    base: './', // Ensure relative paths for Electron
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@engine': path.resolve(__dirname, 'src/engine'),
            '@game': path.resolve(__dirname, 'src/game'),
            '@config': path.resolve(__dirname, 'src/config'),
        },
    },
    build: {
        outDir: 'dist',
        assetsDir: '.',
    }
});
