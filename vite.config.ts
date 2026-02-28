import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { builtinModules } from 'module'

// All native Node.js built-in modules (with and without node: prefix)
const nodeBuiltins = [...builtinModules, ...builtinModules.map(m => `node:${m}`)]

// Native addons and packages that must not be bundled
const nativeModules = [
  'electron',
  'better-sqlite3',
  'onnxruntime-node',
  'node-llama-cpp',
  'keytar',
  'electron-squirrel-startup',
]

const allExternals = [...nativeModules, ...nodeBuiltins]

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: allExternals,
              output: {
                format: 'cjs',
                inlineDynamicImports: true,
                esModule: false,
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      {
        // Preload script
        entry: 'electron/preload.ts',
        onstart(options) {
          // Notify the Renderer process to reload the page when the Preload scripts build is complete
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', ...nodeBuiltins],
            },
          },
        },
      },
      {
        // Worker threads (ASR + VAD) — must be compiled separately
        entry: {
          'workers/asr.worker': 'src/main/workers/asr.worker.ts',
          'workers/vad.worker': 'src/main/workers/vad.worker.ts',
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: allExternals,
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // CRITICAL: Prevent duplicate React instances.
    // vite-plugin-electron-renderer + @tanstack/react-query can each pull
    // in their own copy of React, leading to "Invalid hook call" crashes.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
})
