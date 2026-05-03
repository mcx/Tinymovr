import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// All assets get inlined into a single dist/index.html. The npm `build`
// script then copies that into dashboard.html (the canonical artifact
// committed for GitHub Pages hosting).
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
