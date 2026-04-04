import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { builtinModules } from 'module'
import { config as dotenvConfig } from 'dotenv'

// Load .env file so we can inject vars into the Electron main process build
const envResult = dotenvConfig({ path: path.resolve(__dirname, '.env') })
const envVars = envResult.parsed || {}

// Build a define map that replaces process.env.X with the actual values at bundle time
const envKeys = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'BLUEARKIVE_API_URL',
  'BLUEARKIVE_FUNCTIONS_URL',
  'DEEPGRAM_API_URL',
  'SENTRY_DSN',
  'LOG_LEVEL',
  'BLUEARKIVE_BILLING_URL',
]
const electronDefine: Record<string, string> = {}
for (const key of envKeys) {
  const value = envVars[key] || process.env[key] || ''
  electronDefine[`process.env.${key}`] = JSON.stringify(value)
}

// Build-time validation: catch misconfigured GitHub Secrets that would produce broken builds.
// If SUPABASE_ANON_KEY is set to the literal string 'supabase_anon_key' (the variable name
// itself rather than the actual JWT), the Supabase JS client will concatenate it into the
// URL hostname, causing DNS failures like 'xxx.supabase.cosupabase_anon_key'.
const criticalKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'] as const
for (const key of criticalKeys) {
  const val = JSON.parse(electronDefine[`process.env.${key}`])
  if (val && val === key.toLowerCase()) {
    throw new Error(
      `\n❌ BUILD ERROR: process.env.${key} is set to the literal string "${val}".\n` +
        `   This is the variable NAME, not its VALUE.\n` +
        `   Check your .env file or GitHub Secrets configuration.\n`
    )
  }
}

// All native Node.js built-in modules (with and without node: prefix)
const nodeBuiltins = [...builtinModules, ...builtinModules.map(m => `node:${m}`)]

// Native addons and packages that must not be bundled
const nativeModules = ['electron', 'better-sqlite3', 'onnxruntime-node', 'node-llama-cpp', 'keytar']

const allExternals = [...nativeModules, ...nodeBuiltins]

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: 'electron/main.ts',
        onstart({ startup }) {
          // ELECTRON_RUN_AS_NODE=1 in the shell environment makes the Electron
          // binary run as plain Node.js, breaking require('electron'). Remove it
          // from the current process env so the spawned Electron process doesn't
          // inherit it. The env var is read at C++ binary startup level before
          // any JS runs, so a JS-level delete is too late.
          delete process.env.ELECTRON_RUN_AS_NODE
          startup()
        },
        vite: {
          define: electronDefine,
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
          define: {
            // Toggle mock mode: 'true' ONLY for local UI dev (Vite dev server running)
            // so the renderer's mock layer can set window.electronAPI.
            // MUST be 'false' for production builds. Uses VITE_DEV_SERVER_URL presence to detect.
            'process.env.USE_MOCK_DATA': JSON.stringify('false'),
          },
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
      // Force single React instance — prevent vite-plugin-electron-renderer
      // from resolving its own copy, which causes "Invalid hook call" in production
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
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
        widget: path.resolve(__dirname, 'widget-index.html'),
      },
    },
  },
})
