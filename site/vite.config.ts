import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { basename, resolve } from 'node:path';

// This app lives in `site/` but is built from the repo root
// (`vite build -c site/vite.config.ts`). Vite resolves `root` against
// process.cwd(), so resolve it explicitly. If invoked from inside `site/`,
// fall back to the current directory.
const root = basename(process.cwd()) === 'site' ? process.cwd() : resolve(process.cwd(), 'site');

export default defineConfig({
  root,
  plugins: [react()],
  // Reuse the repo-level logo instead of duplicating it.
  publicDir: '../public',
  build: {
    outDir: '../dist-site',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      // wrangler dev default port.
      '/api': 'http://localhost:8787',
    },
  },
});
