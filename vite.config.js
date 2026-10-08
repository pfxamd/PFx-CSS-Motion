import { defineConfig } from 'vite';

export default defineConfig({
  base: '/PFx-CSS-Motion/',
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    sourcemap: true,
    outDir: 'dist'
  }
});
