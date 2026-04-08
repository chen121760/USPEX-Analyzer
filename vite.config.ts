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
  base: '/uspex-analyzer/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks: {
          plotly: ['plotly.js-dist-min'],
          d3: ['d3'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
