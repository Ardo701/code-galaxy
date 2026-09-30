import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createApp } from '../src/app.ts';

/**
 * During development, serves the same API as the CLI server. Opens the repository in
 * CG_REPO (with CG_TRUNK as trunk) if set, otherwise starts on the repository picker.
 */
function devApi(): Plugin {
  return {
    name: 'code-galaxy-dev-api',
    configureServer(server) {
      // Keep the recent list and clones of development sessions out of the real ~/.code-galaxy.
      process.env.CODE_GALAXY_HOME ??= fileURLToPath(new URL('../../../.cache/dev-data', import.meta.url));
      const app = createApp({ watch: true });
      if (process.env.CG_REPO) {
        // Relative paths are resolved from where `npm run dev` was typed (npm sets INIT_CWD).
        const repo = resolve(process.env.INIT_CWD ?? process.cwd(), process.env.CG_REPO);
        app.open(repo, process.env.CG_TRUNK).catch((error: Error) => console.error(`CG_REPO: ${error.message}`));
      }
      server.middlewares.use((req, res, next) => {
        app.handle(req, res).then((handled) => handled || next(), next);
      });
      server.httpServer?.on('close', () => app.dispose());
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), devApi()],
  resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'] },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
