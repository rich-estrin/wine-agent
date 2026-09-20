import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: process.env.VITE_BASE_PATH || '/',
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          format: 'iife',
          name: 'WineAgent',
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true,
          headers: env.WINE_AGENT_KEY
            ? { 'x-wine-agent-key': env.WINE_AGENT_KEY }
            : {},
        },
      },
    },
  };
});
