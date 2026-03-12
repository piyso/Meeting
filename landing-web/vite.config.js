import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    target: 'esnext',
    modulePreload: {
      polyfill: false,
    },
  },
  server: {
    port: 3000,
  },
})
