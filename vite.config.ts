import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const DIST_DIR = path.resolve(__dirname, 'dist');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'clean-dist-before-build',
      apply: 'build',
      buildStart() {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
      },
    },
  ],
  base: '/USPEX-Analyzer/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('plotly.js-dist-min')) {
            return 'plotly';
          }
          if (id.includes('/d3/') || id.includes('\\d3\\')) {
            return 'd3';
          }
          if (
            id.includes('/react/') ||
            id.includes('\\react\\') ||
            id.includes('/react-dom/') ||
            id.includes('\\react-dom\\') ||
            id.includes('/react-router-dom/') ||
            id.includes('\\react-router-dom\\')
          ) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
