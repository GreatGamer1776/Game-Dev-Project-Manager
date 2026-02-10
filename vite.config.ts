
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This is critical for GitHub Pages. 
  // It ensures assets are loaded from './' instead of '/'
  base: './',
});
