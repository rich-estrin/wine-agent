import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: process.env.VITE_BASE_PATH || '/',
    build: {
      manifest: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          headers: env.WEBHOOK_SECRET
            ? { 'x-wine-agent-key': env.WEBHOOK_SECRET }
            : {},
        },
      },
    },
  };
});
