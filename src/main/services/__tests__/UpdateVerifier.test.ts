/**
 * UpdateVerifier — an update is installed only if its publisher signed it.
 *
 * The signing side is the release script itself (scripts/update-signing.js),
 * run as CI runs it, so the two cannot drift apart.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  parseUpdatePublicKey,
  readManifest,
  updateManifestName,
  verifyDownloadedUpdate,
  type DownloadedUpdate,
} from '../UpdateVerifier'

const SCRIPT = path.join(process.cwd(), 'scripts/update-signing.js')
const FEED = 'https://dl.example.test'

let dir: string
let publicKeyText: string
let privateKeyText: string
let installer: string
let manifest: string

function runScript(args: string[], env: Record<string, string> = {}): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  })
}

function manifestFor(version: string, file: string): string {
  const sha = crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${path.basename(file)}`,
    `    sha512: ${sha}`,
    `    size: ${fs.statSync(file).size}`,
    `path: ${path.basename(file)}`,
    `sha512: ${sha}`,
    "releaseDate: '2026-10-12T10:00:00.000Z'",
    '',
  ].join('\n')
}

/** An update server holding whatever files are in `served`. */
function server(served: Record<string, string | Buffer>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const body = served[url.pathname.slice(1)]
    if (body === undefined) return new Response('not found', { status: 404 })
    return new Response(body)
  }) as typeof fetch
}

function update(overrides: Partial<DownloadedUpdate> = {}): DownloadedUpdate {
  const key = parseUpdatePublicKey(publicKeyText)
  if (!key) throw new Error('test key did not parse')
  return {
    feedUrl: FEED,
    manifestName: 'latest.yml',
    publicKey: key,
    version: '0.9.0',
    downloadedFile: installer,
    fetchImpl: server({
      'latest.yml': fs.readFileSync(manifest),
      'latest.yml.sig': fs.readFileSync(`${manifest}.sig`),
    }),
    ...overrides,
  }
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluearkive-update-'))
  const printed = runScript(['keygen'])
  const keys = printed.split('\n').filter(line => /^ {2}\S+$/.test(line))
  publicKeyText = (keys[0] ?? '').trim()
  privateKeyText = (keys[1] ?? '').trim()

  installer = path.join(dir, 'BlueArkive-Setup-0.9.0.exe')
  fs.writeFileSync(installer, crypto.randomBytes(200_000))
  manifest = path.join(dir, 'latest.yml')
  fs.writeFileSync(manifest, manifestFor('0.9.0', installer))
  runScript(['sign', manifest], { UPDATE_SIGNING_KEY: privateKeyText })
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the release script', () => {
  it('produces a signature its own verify accepts, and rejects a changed manifest', () => {
    expect(runScript(['verify', publicKeyText, manifest])).toContain('ok ')

    const tampered = path.join(dir, 'tampered.yml')
    fs.writeFileSync(tampered, fs.readFileSync(manifest, 'utf-8').replace('0.9.0', '9.9.9'))
    fs.copyFileSync(`${manifest}.sig`, `${tampered}.sig`)
    expect(() => runScript(['verify', publicKeyText, tampered])).toThrow()
  })

  it('refuses to sign without a key', () => {
    expect(() => runScript(['sign', manifest], { UPDATE_SIGNING_KEY: '' })).toThrow()
  })
})

describe('verifyDownloadedUpdate', () => {
  it('accepts the update the publisher signed', async () => {
    expect(await verifyDownloadedUpdate(update())).toEqual({ ok: true })
  })

  it('rejects an installer that was swapped on the server, manifest and all', async () => {
    // Whoever controls the server replaces the installer and rewrites the
    // manifest to match it. They cannot produce the signature.
    const evil = path.join(dir, 'evil.exe')
    fs.writeFileSync(evil, crypto.randomBytes(200_000))
    const verdict = await verifyDownloadedUpdate(
      update({
        downloadedFile: evil,
        fetchImpl: server({
          'latest.yml': manifestFor('0.9.0', evil),
          'latest.yml.sig': fs.readFileSync(`${manifest}.sig`),
        }),
      })
    )
    expect(verdict).toEqual({ ok: false, reason: 'the manifest signature does not verify' })
  })

  it('rejects a swapped installer even when the genuine signed manifest is served', async () => {
    // The updater was shown a forged manifest; this check is shown the real one.
    const evil = path.join(dir, 'evil2.exe')
    fs.writeFileSync(evil, crypto.randomBytes(1000))
    const verdict = await verifyDownloadedUpdate(update({ downloadedFile: evil }))
    expect(verdict).toMatchObject({
      ok: false,
      reason: expect.stringContaining('not one the signed'),
    })
  })

  it('rejects a genuine but different release (replayed old manifest)', async () => {
    const verdict = await verifyDownloadedUpdate(update({ version: '0.9.1' }))
    expect(verdict).toMatchObject({
      ok: false,
      reason: expect.stringContaining('is for version 0.9.0'),
    })
  })

  it('rejects a release that was not signed at all', async () => {
    const verdict = await verifyDownloadedUpdate(
      update({ fetchImpl: server({ 'latest.yml': fs.readFileSync(manifest) }) })
    )
    expect(verdict).toMatchObject({
      ok: false,
      reason: expect.stringContaining('could not be fetched'),
    })
  })

  it('rejects a signature made with someone else’s key', async () => {
    const other = crypto.generateKeyPairSync('ed25519')
    const forged = crypto.sign(null, fs.readFileSync(manifest), other.privateKey).toString('base64')
    const verdict = await verifyDownloadedUpdate(
      update({
        fetchImpl: server({ 'latest.yml': fs.readFileSync(manifest), 'latest.yml.sig': forged }),
      })
    )
    expect(verdict).toEqual({ ok: false, reason: 'the manifest signature does not verify' })
  })

  it('does not follow the update server somewhere else', async () => {
    let options: RequestInit | undefined
    const spy = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      options = init
      return new Response('x', { status: 404 })
    }) as typeof fetch
    await verifyDownloadedUpdate(update({ fetchImpl: spy }))
    expect(options?.redirect).toBe('error')
  })
})

describe('configuration', () => {
  it('reads the public key as raw base64 or PEM, and nothing else', () => {
    expect(parseUpdatePublicKey(publicKeyText)).not.toBeNull()
    const pem = crypto
      .generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'pem', type: 'spki' })
    expect(parseUpdatePublicKey(String(pem))).not.toBeNull()
    expect(parseUpdatePublicKey('')).toBeNull()
    expect(parseUpdatePublicKey(undefined)).toBeNull()
    expect(parseUpdatePublicKey('not a key')).toBeNull()
    expect(parseUpdatePublicKey(Buffer.alloc(31).toString('base64'))).toBeNull()
  })

  it('looks for signed manifests where the installers are published', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
    const { config } = await import('../../config/environment')
    expect(pkg.build.publish.provider).toBe('generic')
    expect(config.UPDATE_FEED_URL).toBe(pkg.build.publish.url)
  })

  it('names the manifest electron-updater reads on each platform', () => {
    expect(updateManifestName('win32', 'x64')).toBe('latest.yml')
    expect(updateManifestName('darwin', 'arm64')).toBe('latest-mac.yml')
    expect(updateManifestName('linux', 'x64')).toBe('latest-linux.yml')
    expect(updateManifestName('linux', 'arm64')).toBe('latest-linux-arm64.yml')
  })

  it('reads the version and every listed hash from a manifest', () => {
    const parsed = readManifest(
      'version: \'1.2.3\'\nfiles:\n  - url: a.dmg\n    sha512: AAA=\n  - url: a.zip\n    sha512: "BBB="\npath: a.dmg\nsha512: AAA=\n'
    )
    expect(parsed.version).toBe('1.2.3')
    expect([...parsed.sha512].sort()).toEqual(['AAA=', 'BBB='])
  })
})
