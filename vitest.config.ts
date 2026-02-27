import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'dist-electron',
      'release',
      // Integration tests — use node:test API + real SQLite DB
      // Run separately with: node --test src/main/database/__tests__/*.test.ts
      'src/main/database/__tests__/connection.test.ts',
      'src/main/database/__tests__/crud.test.ts',
      'src/main/database/__tests__/fts5-triggers.test.ts',
      'src/main/database/__tests__/search-performance.test.ts',
      'src/main/database/__tests__/search.test.ts',
      'src/main/database/__tests__/transcript-meeting-linkage.test.ts',
      'src/main/services/__tests__/SyncManager.test.ts',
      'src/main/services/__tests__/EncryptionService.test.ts',
      'src/main/services/__tests__/EncryptionService.standalone.test.ts',
      'src/main/services/__tests__/CloudAccessManager.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'dist-electron',
        'release',
        '**/*.test.ts',
        '**/*.example.ts',
        'tests/**',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
