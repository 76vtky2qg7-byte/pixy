import { defineConfig } from 'vite';

// Yandex Games serves the build from a nested path, so every asset reference
// must be relative. `base: './'` is what makes the ZIP work when unpacked.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
});
