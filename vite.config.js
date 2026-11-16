import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  optimizeDeps: { exclude: ['@viggle/splat-engine'] },
  build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
  worker: { format: 'es' },
});
