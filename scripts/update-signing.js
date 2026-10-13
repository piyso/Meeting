#!/usr/bin/env node
/**
 * Signing of update manifests (latest.yml, latest-mac.yml, latest-linux.yml).
 *
 * The app downloads an update from wherever the manifest on the update server
 * points and checks the download against the hash in that same manifest. That
 * proves the download is intact — not that it is ours: whoever can write to
 * the update server can replace both. A code-signing certificate closes that
 * gap on Windows and macOS; this closes it everywhere, and without one.
 *
 * The release pipeline signs each manifest with a private key that never
 * leaves CI. The app carries the public key and installs an update only when
 * the manifest's signature verifies and the downloaded file is one the signed
 * manifest lists (src/main/services/UpdateVerifier.ts).
 *
 *   node scripts/update-signing.js keygen
 *       Prints a new key pair. Store the private key as the CI secret
 *       UPDATE_SIGNING_KEY; build the app with the public key in
 *       UPDATE_PUBLIC_KEY. Do this once — the public key is in every
 *       installed copy, so a new pair means old copies reject new updates.
 *
 *   UPDATE_SIGNING_KEY=… node scripts/update-signing.js sign <manifest>…
 *       Writes <manifest>.sig next to each manifest.
 *
 *   node scripts/update-signing.js verify <public key> <manifest>…
 *       Checks each <manifest>.sig. Exits non-zero if any does not verify.
 */

const crypto = require('crypto')
const fs = require('fs')

/** DER prefix of an Ed25519 SubjectPublicKeyInfo; the 32 key bytes follow. */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function publicKeyFrom(value) {
  const text = String(value || '').trim()
  if (text.includes('BEGIN')) return crypto.createPublicKey(text)
  const raw = Buffer.from(text, 'base64')
  if (raw.length !== 32) throw new Error('The public key must be 32 bytes, base64-encoded')
  return crypto.createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  })
}

function privateKeyFrom(value) {
  const text = String(value || '').trim()
  if (!text) throw new Error('UPDATE_SIGNING_KEY is not set')
  if (text.includes('BEGIN')) return crypto.createPrivateKey(text)
  // A PEM stored without its line breaks, or the bare base64 body.
  return crypto.createPrivateKey({
    key: Buffer.from(text, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })
}

function keygen() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
  const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' })
  console.log('Public key  — build the app with this (UPDATE_PUBLIC_KEY):')
  console.log(`  ${rawPublic.toString('base64')}`)
  console.log('')
  console.log('Private key — CI secret UPDATE_SIGNING_KEY. Shown once; keep it nowhere else:')
  console.log(`  ${privateDer.toString('base64')}`)
}

function sign(files) {
  const key = privateKeyFrom(process.env.UPDATE_SIGNING_KEY)
  if (files.length === 0) throw new Error('No manifest given')
  for (const file of files) {
    const signature = crypto.sign(null, fs.readFileSync(file), key)
    fs.writeFileSync(`${file}.sig`, signature.toString('base64') + '\n')
    console.log(`signed ${file}`)
  }
}

function verify(publicKeyText, files) {
  const key = publicKeyFrom(publicKeyText)
  if (files.length === 0) throw new Error('No manifest given')
  let bad = 0
  for (const file of files) {
    let ok = false
    try {
      const signature = Buffer.from(fs.readFileSync(`${file}.sig`, 'utf-8').trim(), 'base64')
      ok = crypto.verify(null, fs.readFileSync(file), key, signature)
    } catch (err) {
      console.error(`${file}: ${err.message}`)
    }
    console.log(`${ok ? 'ok ' : 'BAD'} ${file}`)
    if (!ok) bad++
  }
  if (bad > 0) process.exit(1)
}

const [command, ...args] = process.argv.slice(2)
try {
  if (command === 'keygen') keygen()
  else if (command === 'sign') sign(args)
  else if (command === 'verify') verify(args[0], args.slice(1))
  else {
    console.error(
      'Usage: update-signing.js keygen | sign <manifest>… | verify <public key> <manifest>…'
    )
    process.exit(2)
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
