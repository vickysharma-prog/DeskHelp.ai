import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run ui:dev` talks to the DeskHelp server for everything under /api,
    // so the UI can hot-reload without a second copy of the state.
    proxy: { '/api': 'http://127.0.0.1:4321' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
