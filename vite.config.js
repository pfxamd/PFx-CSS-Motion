import { pfxReleasePlugin } from "./scripts/pfx-release.mjs";
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [pfxReleasePlugin()],
  base: '/PFx-CSS-Motion/',
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    sourcemap: true,
    outDir: 'dist'
  }
});
