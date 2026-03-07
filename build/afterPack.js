/**
 * afterPack hook for electron-builder
 *
 * Selectively rebuilds ONLY the native modules that need Electron-compatible
 * binaries (better-sqlite3 and keytar). This replaces the default
 * @electron/rebuild behavior that tries to rebuild ALL native modules,
 * including node-llama-cpp (which hangs trying to cmake-compile llama.cpp)
 * and onnxruntime-node (which hangs downloading 210MB binaries).
 */
const { execSync } = require('child_process')
const path = require('path')

const MODULES_TO_REBUILD = ['better-sqlite3', 'keytar']

exports.default = async function afterPack(context) {
  const appDir = context.appOutDir
  const electronVersion = context.electronPlatformName === 'darwin'
    ? context.packager.config.electronVersion || context.packager.appInfo.electronVersion
    : context.packager.appInfo.electronVersion

  // Get the actual electron version from the installed package
  let elVersion = electronVersion
  if (!elVersion) {
    try {
      const elPkg = require(path.join(context.packager.projectDir, 'node_modules', 'electron', 'package.json'))
      elVersion = elPkg.version
    } catch {
      console.log('[afterPack] Could not determine electron version, skipping rebuild')
      return
    }
  }

  const arch = context.arch === 1 ? 'x64' : context.arch === 3 ? 'arm64' : 'x64'

  console.log(`[afterPack] Selectively rebuilding native modules for Electron ${elVersion} ${arch}...`)
  console.log(`[afterPack] Modules: ${MODULES_TO_REBUILD.join(', ')}`)

  for (const mod of MODULES_TO_REBUILD) {
    try {
      const modulePath = path.join(context.packager.projectDir, 'node_modules', mod)
      console.log(`[afterPack] Rebuilding ${mod}...`)

      execSync(
        `npx @electron/rebuild --module-dir "${modulePath}" --electron-version "${elVersion}" --arch "${arch}" --force`,
        {
          cwd: context.packager.projectDir,
          stdio: 'inherit',
          timeout: 120000, // 2 minute timeout per module
        }
      )

      console.log(`[afterPack] ✅ ${mod} rebuilt successfully`)
    } catch (err) {
      console.error(`[afterPack] ⚠️ Failed to rebuild ${mod}:`, err.message)
      // Don't fail the entire build — keytar is optional (we use it but fall back gracefully)
      if (mod === 'better-sqlite3') {
        throw new Error(`Critical module ${mod} failed to rebuild: ${err.message}`)
      }
    }
  }

  console.log('[afterPack] ✅ Native module selective rebuild complete')
}
