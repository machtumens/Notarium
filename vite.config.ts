import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Enable code splitting and chunk optimization
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor code into separate chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Motion libs isolated into their own async chunk so they don't bloat
          // the entry/react-vendor bundle.
          'motion-vendor': ['framer-motion', 'motion'],
          'ui-vendor': ['lucide-react'],
          // three + @react-three/fiber kept in a dedicated heavy-lib chunk,
          // loaded on demand (SubjectsPage lazy-loads the WebGL scene).
          'three-vendor': ['three', '@react-three/fiber'],
          markdown: ['react-markdown'],
          'radix-ui': [
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-label',
            '@radix-ui/react-select',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 500,
    // Enable minification with esbuild (faster than terser)
    minify: 'esbuild',
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
