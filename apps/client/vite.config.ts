import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy the lobby HTTP and the WebSocket to the server (default localhost:8787),
// so the client can use same-origin URLs that also work in the single-container build (M16).
const SERVER = process.env.VITE_SERVER ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/ws': { target: SERVER, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
