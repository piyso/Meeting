import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    target: 'esnext',
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        security: resolve(__dirname, 'security.html'),
      },
    },
  },
  server: {
    port: 3000,
  },
})
