import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Yandex Games serves the build from a nested path, so every asset reference
// must be relative. `base: './'` is what makes the ZIP work when unpacked.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2020',
    // Inline every small sprite sheet as a data URI. Two reasons: it removes
    // the separate request for the icon sheet that CSS references (which is
    // fetched lazily on first paint and therefore fails on a dropped
    // connection), and it cuts the request count on a cold mobile load. The
    // base64 overhead is a few kilobytes.
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
});
