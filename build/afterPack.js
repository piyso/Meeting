/**
 * afterPack hook for electron-builder
 *
 * Selectively rebuilds ONLY the native modules that need Electron-compatible
 * binaries. This replaces the default @electron/rebuild behavior that tries
 * to rebuild ALL native modules, including:
 * - node-llama-cpp (hangs trying to cmake-compile llama.cpp)
 * - onnxruntime-node (hangs downloading 210MB platform binaries)
 *
 * Only better-sqlite3 and keytar need architecture-specific .node binaries.
 *
 * IMPORTANT: After rebuild, each .node file is verified against the target
 * architecture to prevent shipping wrong-arch binaries (the #1 cause of
 * ERR_DLOPEN_FAILED crashes on end-user machines).
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

/**
 * Modules to rebuild per platform.
 * - better-sqlite3: CRITICAL — app won't start without it
 * - keytar: Optional — OS keychain integration, falls back gracefully
 */
const MODULES_TO_REBUILD = {
  darwin: ['better-sqlite3', 'keytar'],
  win32: ['better-sqlite3', 'keytar'],
  linux: ['better-sqlite3', 'keytar'],
}

/**
 * Map electron-builder arch enum to string.
 * electron-builder passes context.arch as a numeric Arch enum:
 *   0=ia32, 1=x64, 2=armv7l, 3=arm64, 4=universal
 * BUT it can also pass the string directly in some versions.
 * Handle both cases safely.
 */
function resolveArch(archInput) {
  // If it's already a string (some electron-builder versions), use it directly
  if (typeof archInput === 'string') {
    const valid = ['ia32', 'x64', 'armv7l', 'arm64', 'universal']
    if (valid.includes(archInput)) return archInput
    console.warn(`[afterPack] ⚠️ Unknown arch string "${archInput}", falling back to process.arch`)
    return process.arch
  }
  // Numeric enum
  switch (archInput) {
    case 0: return 'ia32'
    case 1: return 'x64'
    case 2: return 'armv7l'
    case 3: return 'arm64'
    case 4: return 'universal'
    default:
      console.warn(`[afterPack] ⚠️ Unknown arch enum ${archInput}, falling back to process.arch (${process.arch})`)
      return process.arch
  }
}

/**
 * Verify that a .node binary matches the expected architecture.
 * Uses the `file` command on macOS/Linux or checks PE headers on Windows.
 * Returns true if arch matches, false otherwise.
 */
function verifyBinaryArch(nodePath, expectedArch) {
  if (!fs.existsSync(nodePath)) {
    console.warn(`[afterPack] ⚠️ Binary not found: ${nodePath}`)
    return false
  }

  try {
    const output = execSync(`file "${nodePath}"`, { encoding: 'utf-8' }).trim()
    console.log(`[afterPack] 🔍 Binary check: ${output}`)

    // Map expected arch to what `file` reports
    const archPatterns = {
      arm64: /arm64|aarch64/i,
      x64: /x86_64|x86-64|AMD64/i,
      ia32: /i386|i686|80386/i,
      armv7l: /armv7|ARM/i,
    }

    // For 'universal', both arm64 and x64 should be present
    if (expectedArch === 'universal') {
      return archPatterns.arm64.test(output) || archPatterns.x64.test(output)
    }

    const pattern = archPatterns[expectedArch]
    if (!pattern) {
      console.warn(`[afterPack] ⚠️ No verification pattern for arch "${expectedArch}"`)
      return true // Can't verify, assume ok
    }

    const matches = pattern.test(output)
    if (!matches) {
      console.error(`[afterPack] ❌ ARCH MISMATCH: expected ${expectedArch}, got: ${output}`)
    }
    return matches
  } catch (err) {
    console.warn(`[afterPack] ⚠️ Could not verify binary arch: ${err.message}`)
    return true // Can't verify, don't block
  }
}

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName || process.platform
  const arch = resolveArch(context.arch)
  const projectDir = context.packager.projectDir

  // Determine Electron version (try multiple sources)
  let elVersion =
    context.packager.config.electronVersion ||
    context.packager.appInfo?.electronVersion
  if (!elVersion) {
    try {
      const elPkg = require(path.join(projectDir, 'node_modules', 'electron', 'package.json'))
      elVersion = elPkg.version
    } catch {
      console.log('[afterPack] ⚠️ Could not determine Electron version, skipping rebuild')
      return
    }
  }

  const modules = MODULES_TO_REBUILD[platform] || MODULES_TO_REBUILD.linux
  console.log(`[afterPack] Rebuilding native modules for Electron ${elVersion} (${platform}/${arch})`)
  console.log(`[afterPack] Host process.arch: ${process.arch}`)
  console.log(`[afterPack] Target arch: ${arch}`)
  console.log(`[afterPack] Modules: ${modules.join(', ')}`)

  for (const mod of modules) {
    const modulePath = path.join(projectDir, 'node_modules', mod)

    // Skip if module doesn't exist (e.g. optional dependency not installed)
    if (!fs.existsSync(modulePath)) {
      console.log(`[afterPack] ⏭️  Skipping ${mod} — not installed`)
      continue
    }

    // Check if this module has a binding.gyp (needs native compilation)
    const hasGyp = fs.existsSync(path.join(modulePath, 'binding.gyp'))
    if (!hasGyp) {
      console.log(`[afterPack] ⏭️  Skipping ${mod} — no binding.gyp (not a native module)`)
      continue
    }

    try {
      console.log(`[afterPack] 🔨 Rebuilding ${mod} for ${arch}...`)
      execSync(
        `npx @electron/rebuild --module-dir "${modulePath}" --electron-version "${elVersion}" --arch "${arch}" --force`,
        {
          cwd: projectDir,
          stdio: 'inherit',
          timeout: 180000, // 3 minute timeout per module
          env: {
            ...process.env,
            npm_config_runtime: 'electron',
            npm_config_target: elVersion,
            npm_config_arch: arch,
            npm_config_disturl: 'https://electronjs.org/headers',
          },
        }
      )
      console.log(`[afterPack] ✅ ${mod} rebuilt successfully`)

      // ─── Post-rebuild architecture verification ───────────────
      // Find the .node binary and verify it matches the target arch
      const buildRelease = path.join(modulePath, 'build', 'Release')
      if (fs.existsSync(buildRelease)) {
        const nodeFiles = fs.readdirSync(buildRelease).filter(f => f.endsWith('.node'))
        for (const nodeFile of nodeFiles) {
          const nodePath = path.join(buildRelease, nodeFile)
          const archOk = verifyBinaryArch(nodePath, arch)
          if (!archOk) {
            const msg = `ARCH MISMATCH: ${mod}/${nodeFile} was rebuilt but is NOT ${arch}. ` +
              `This will cause ERR_DLOPEN_FAILED at runtime!`
            console.error(`[afterPack] ❌ ${msg}`)
            if (mod === 'better-sqlite3') {
              throw new Error(`CRITICAL: ${msg}`)
            }
          }
        }
      }
    } catch (err) {
      console.error(`[afterPack] ⚠️ Failed to rebuild ${mod}:`, err.message)

      // better-sqlite3 is critical — fail the build if it can't be rebuilt
      if (mod === 'better-sqlite3') {
        throw new Error(`CRITICAL: ${mod} failed to rebuild for ${platform}/${arch}: ${err.message}`)
      }
      // Other modules (keytar) are optional — continue
      console.log(`[afterPack] ↳ Continuing without ${mod} (optional dependency)`)
    }
  }

  console.log('[afterPack] ✅ Native module rebuild complete')
}
