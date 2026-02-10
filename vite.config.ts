import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: This ensures assets (js/css) load correctly
  // regardless of whether the site is at / or /repo-name/
  base: './', 
});