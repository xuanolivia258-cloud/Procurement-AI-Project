import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/ai_procurement/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ai_procurement/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai_procurement/, ''),
      },
      '/ai_procurement/authorize': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai_procurement/, ''),
      },
    },
  },
});
