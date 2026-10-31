import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs work both locally and under a GitHub Pages project path.
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.e2b.app'],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
  },
});
