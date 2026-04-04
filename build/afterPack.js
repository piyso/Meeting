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

// ═══ SAFETY GUARD: Fail fast if large model files are in the project ═══
// These files bypass electron-builder's files exclusion and bloat the
// ASAR from 39MB to 3.5GB. They must be moved out before building.
const modelsDir = path.join(__dirname, '..', 'resources', 'models')
if (fs.existsSync(modelsDir)) {
  const dangerousFiles = fs.readdirSync(modelsDir).filter(f =>
    f.endsWith('.gguf') || (f.startsWith('ggml-') && f.endsWith('.bin'))
  )
  if (dangerousFiles.length > 0) {
    const totalMB = dangerousFiles.reduce((sum, f) => {
      return sum + fs.statSync(path.join(modelsDir, f)).size / 1024 / 1024
    }, 0)
    console.error('\n' + '═'.repeat(60))
    console.error('❌ BUILD ABORTED — Large model files detected!')
    console.error('═'.repeat(60))
    console.error(`\nFound ${dangerousFiles.length} files (${Math.round(totalMB)}MB) in resources/models/:`)
    dangerousFiles.forEach(f => console.error(`  • ${f}`))
    console.error('\nThese will be packed into the ASAR and create a 3.5GB+ DMG.')
    console.error('Use the safe build script instead:')
    console.error('  ./build/build-safe.sh mac')
    console.error('═'.repeat(60) + '\n')
    process.exit(1)
  }
}

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
    let output

    if (process.platform === 'win32') {
      // Windows: `file` command doesn't exist. Use PowerShell to read PE header.
      // The PE machine type is at offset 0x3C (PE header offset) + 4 (signature) bytes.
      // Machine type: 0x8664 = x64 (AMD64), 0x14c = i386, 0xAA64 = arm64
      try {
        output = execSync(
          `powershell -Command "$bytes = [System.IO.File]::ReadAllBytes('${nodePath.replace(/'/g, "''")}'); $peOffset = [BitConverter]::ToInt32($bytes, 0x3C); $machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4); Write-Output ('MACHINE:' + '0x' + $machine.ToString('X4'))"`,
          { encoding: 'utf-8', timeout: 10000 }
        ).trim()
        console.log(`[afterPack] 🔍 Binary check (PE header): ${output}`)

        const peArchMap = {
          'x64': /MACHINE:0x8664/i,
          'ia32': /MACHINE:0x014C/i,
          'arm64': /MACHINE:0xAA64/i,
        }

        if (expectedArch === 'universal') return true // Can't verify universal on Windows

        const pattern = peArchMap[expectedArch]
        if (!pattern) {
          console.warn(`[afterPack] ⚠️ No PE verification pattern for arch "${expectedArch}"`)
          return true
        }

        const matches = pattern.test(output)
        if (!matches) {
          console.error(`[afterPack] ❌ ARCH MISMATCH (PE): expected ${expectedArch}, got: ${output}`)
        }
        return matches
      } catch (peErr) {
        console.warn(`[afterPack] ⚠️ PE header check failed: ${peErr.message}`)
        // Fall through to `file` command attempt
      }
    }

    // macOS/Linux: use the `file` command
    output = execSync(`file "${nodePath}"`, { encoding: 'utf-8' }).trim()
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
          timeout: 600000, // 10 minute timeout per module (Windows CI with node-gyp + MSVC is slow)
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

        // ─── CRITICAL: Copy rebuilt binary to packaged output ─────────
        // electron-builder copies node_modules BEFORE afterPack runs.
        // When building multi-arch (arm64 + x64), the second build copies
        // the FIRST build's binary from node_modules. Without this copy,
        // the second architecture's DMG ships with the wrong binary.
        const appName = context.packager.appInfo.productFilename
        let outputModuleBuild
        if (platform === 'darwin') {
          outputModuleBuild = path.join(
            context.appOutDir,
            `${appName}.app`,
            'Contents', 'Resources', 'app.asar.unpacked',
            'node_modules', mod, 'build', 'Release'
          )
        } else {
          // Windows and Linux: resources/ is at the root of appOutDir
          outputModuleBuild = path.join(
            context.appOutDir, 'resources', 'app.asar.unpacked',
            'node_modules', mod, 'build', 'Release'
          )
        }

        if (fs.existsSync(outputModuleBuild)) {
          for (const nodeFile of nodeFiles) {
            const src = path.join(buildRelease, nodeFile)
            const dst = path.join(outputModuleBuild, nodeFile)
            fs.copyFileSync(src, dst)
            console.log(`[afterPack] 📦 Copied rebuilt ${mod}/${nodeFile} → output dir (${platform}/${arch})`)

            // Verify the OUTPUT copy is correct too
            const outputArchOk = verifyBinaryArch(dst, arch)
            if (!outputArchOk) {
              throw new Error(`CRITICAL: Output binary ${dst} has wrong architecture after copy!`)
            }
          }
        } else {
          console.warn(`[afterPack] ⚠️ Output module dir not found: ${outputModuleBuild}`)
          console.warn(`[afterPack] ↳ appOutDir: ${context.appOutDir}`)
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

  // ═══ AD-HOC CODE SIGNING (macOS only) ═══
  // Without this, Gatekeeper blocks the app with:
  //   "code has no resources but signature indicates they must be present"
  // The --deep flag signs all nested frameworks, helpers, and native .node binaries.
  // The --force flag replaces any existing linker-only adhoc signatures.
  if (platform === 'darwin') {
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    console.log(`[afterPack] 🔏 Ad-hoc signing: ${appPath}`)
    try {
      // Clean resource forks and macOS detritus that block codesign
      try {
        execSync(`xattr -cr "${appPath}"`, { stdio: 'pipe', timeout: 30000 })
        execSync(`find "${appPath}" -name '._*' -delete`, { stdio: 'pipe', timeout: 30000 })
        execSync(`find "${appPath}" -name '.DS_Store' -delete`, { stdio: 'pipe', timeout: 30000 })
        console.log('[afterPack] 🧹 Cleaned resource forks and detritus')
      } catch { /* best-effort clean */ }

      execSync(
        `codesign --deep --force --sign - "${appPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      // Verify the signature
      const verifyResult = execSync(
        `codesign --verify --deep --strict "${appPath}" 2>&1`,
        { stdio: 'pipe', timeout: 30000 }
      ).toString().trim()
      console.log(`[afterPack] ✅ Code signing verified${verifyResult ? ': ' + verifyResult : ''}`)
    } catch (signErr) {
      console.error(`[afterPack] ⚠️ Ad-hoc signing failed: ${signErr.message}`)
      console.error('[afterPack] ↳ App may be blocked by Gatekeeper. Users will need: xattr -cr /Applications/BlueArkive.app')
    }
  }
}
