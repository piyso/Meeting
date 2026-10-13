/**
 * Update authenticity
 *
 * electron-updater checks a download against the hash in the manifest
 * (latest.yml) it fetched from the update server. That shows the download is
 * intact, not that it came from us — whoever can write to the server, or to
 * the connection, can replace the manifest and the installer together. On
 * Windows the usual answer is an Authenticode certificate; this build has
 * none (`verifyUpdateCodeSignature` is off), and Linux has no equivalent.
 *
 * So the release pipeline signs every manifest (scripts/update-signing.js)
 * and the app, when built with the matching public key, installs a
 * downloaded update only if
 *   - the manifest's signature verifies with that key,
 *   - the manifest is for the version that was downloaded, and
 *   - the downloaded file's SHA-512 is one the signed manifest lists.
 * The file is hashed here, independently of the updater: it does not matter
 * which manifest the updater itself was shown.
 *
 * A build without a public key behaves as before (nothing is verified).
 */

import crypto from 'crypto'
import fs from 'fs'

/** DER prefix of an Ed25519 SubjectPublicKeyInfo; the 32 key bytes follow. */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const MAX_MANIFEST_BYTES = 256 * 1024
const FETCH_TIMEOUT_MS = 20_000

export type UpdateVerdict = { ok: true } | { ok: false; reason: string }

/** The key from `UPDATE_PUBLIC_KEY`: 32 raw bytes in base64, or a PEM. Null when unusable. */
export function parseUpdatePublicKey(value: string | undefined): crypto.KeyObject | null {
  const text = (value ?? '').trim()
  if (!text) return null
  try {
    if (text.includes('BEGIN')) return crypto.createPublicKey(text)
    const raw = Buffer.from(text, 'base64')
    if (raw.length !== 32) return null
    return crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    })
  } catch {
    return null
  }
}

/** The manifest electron-updater reads on this platform (generic provider, default channel). */
export function updateManifestName(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  if (platform === 'darwin') return 'latest-mac.yml'
  if (platform === 'linux') return arch === 'x64' ? 'latest-linux.yml' : `latest-linux-${arch}.yml`
  return 'latest.yml'
}

export function verifyManifestSignature(
  manifest: Buffer,
  signatureBase64: string,
  publicKey: crypto.KeyObject
): boolean {
  try {
    const signature = Buffer.from(signatureBase64.trim(), 'base64')
    return signature.length === 64 && crypto.verify(null, manifest, publicKey, signature)
  } catch {
    return false
  }
}

/**
 * Version and file hashes of a manifest. Read only after its signature has
 * been verified, so this can be as plain as the format is.
 */
export function readManifest(manifest: string): { version: string | null; sha512: Set<string> } {
  const unquote = (value: string) => value.trim().replace(/^['"]|['"]$/g, '')
  const version = /^version:\s*(.+)$/m.exec(manifest)
  const sha512 = new Set<string>()
  for (const match of manifest.matchAll(/^\s*(?:-\s*)?sha512:\s*(.+)$/gm)) {
    const hash = unquote(match[1] ?? '')
    if (hash) sha512.add(hash)
  }
  return { version: version ? unquote(version[1] ?? '') : null, sha512 }
}

export async function sha512Base64(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha512')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk as Buffer)
  return hash.digest('base64')
}

async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'error',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > MAX_MANIFEST_BYTES) throw new Error('response too large')
    return body
  } finally {
    clearTimeout(timer)
  }
}

export interface DownloadedUpdate {
  /** Base URL of the update server (the `publish.url` of the build). */
  feedUrl: string
  manifestName: string
  publicKey: crypto.KeyObject
  /** The version electron-updater says it downloaded. */
  version: string
  downloadedFile: string
  fetchImpl?: typeof fetch
}

/** Whether the update in `downloadedFile` is one this app's publisher signed off. */
export async function verifyDownloadedUpdate(update: DownloadedUpdate): Promise<UpdateVerdict> {
  const fetchImpl = update.fetchImpl ?? fetch
  const base = update.feedUrl.replace(/\/+$/, '')
  // Past any cache in between: the two files must be the pair from one release.
  const stamp = Date.now()

  let manifest: Buffer
  let signature: string
  try {
    manifest = await download(`${base}/${update.manifestName}?v=${stamp}`, fetchImpl)
    signature = (
      await download(`${base}/${update.manifestName}.sig?v=${stamp}`, fetchImpl)
    ).toString('utf-8')
  } catch (err) {
    return {
      ok: false,
      reason: `the signed manifest could not be fetched (${err instanceof Error ? err.message : err})`,
    }
  }

  if (!verifyManifestSignature(manifest, signature, update.publicKey)) {
    return { ok: false, reason: 'the manifest signature does not verify' }
  }

  const signed = readManifest(manifest.toString('utf-8'))
  if (signed.version !== update.version) {
    return {
      ok: false,
      reason: `the signed manifest is for version ${signed.version ?? 'unknown'}, not ${update.version}`,
    }
  }

  let actual: string
  try {
    actual = await sha512Base64(update.downloadedFile)
  } catch (err) {
    return {
      ok: false,
      reason: `the downloaded file could not be read (${err instanceof Error ? err.message : err})`,
    }
  }
  if (!signed.sha512.has(actual)) {
    return { ok: false, reason: 'the downloaded file is not one the signed manifest lists' }
  }
  return { ok: true }
}
