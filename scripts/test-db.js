#!/usr/bin/env node
/**
 * Runs the database tests (`*.dbtest.ts`).
 *
 * They are not vitest files: better-sqlite3 is compiled for Electron's ABI, so
 * each test is bundled with esbuild and run with Electron's own Node
 * (ELECTRON_RUN_AS_NODE). A test passes when its process exits with 0.
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')

const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'node_modules', '.cache', 'bluearkive-dbtest')

function findTests(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) findTests(full, found)
    else if (entry.name.endsWith('.dbtest.ts')) found.push(full)
  }
  return found
}

const only = process.argv[2]
const tests = findTests(path.join(root, 'src'))
  .filter(file => !only || file.includes(only))
  .sort()
if (tests.length === 0) {
  console.error(only ? `No database test matches "${only}"` : 'No database tests found')
  process.exit(1)
}

const electron = require('electron') // path to the Electron binary
let failed = 0

for (const test of tests) {
  const name = path.basename(test, '.ts')
  const outfile = path.join(outDir, `${name}.cjs`)
  console.log(`\n── ${path.relative(root, test)}`)

  esbuild.buildSync({
    entryPoints: [test],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'warning',
    outfile,
    alias: {
      electron: path.join(root, 'src/main/database/__tests__/fixtures/electron-stub.cjs'),
    },
    external: ['better-sqlite3', 'keytar', 'onnxruntime-node', 'node-llama-cpp'],
  })

  const run = spawnSync(electron, [outfile], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', LOG_LEVEL: 'error' },
  })
  if (run.status !== 0) {
    failed++
    console.error(`FAILED: ${name} (exit ${run.status ?? run.signal})`)
  }
}

console.log(`\n${tests.length - failed} of ${tests.length} database test file(s) passed`)
process.exit(failed === 0 ? 0 : 1)
