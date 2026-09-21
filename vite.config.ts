import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: This ensures assets (js/css) load correctly
  // regardless of whether the site is at / or /repo-name/
  base: './',
  server: {
    proxy: {
      // Proxy API calls to the backend during local development.
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
