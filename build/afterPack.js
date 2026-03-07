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
 * See: https://www.electron.build/configuration#arch
 */
function resolveArch(archEnum) {
  switch (archEnum) {
    case 0: return 'ia32'
    case 1: return 'x64'
    case 2: return 'armv7l'
    case 3: return 'arm64'
    case 4: return 'universal'
    default: return 'x64'
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
      console.log(`[afterPack] 🔨 Rebuilding ${mod}...`)
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
