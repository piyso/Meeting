#!/usr/bin/env node
/**
 * Download the models the app needs for local development into resources/models.
 *
 *   node scripts/download-models.js            # speech + search models (~345 MB)
 *   node scripts/download-models.js --llm      # also the 1.5B LLM (~1.1 GB)
 *
 * Files are pinned to exact Hugging Face revisions and verified by size and
 * SHA-256, matching src/main/services/ModelDownloadService.ts (keep in sync).
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const MODELS_DIR = path.join(__dirname, '..', 'resources', 'models')
const hf = (repo, rev, file) => `https://huggingface.co/${repo}/resolve/${rev}/${file}`

const MOONSHINE_REV = '48b4e427b587bcf67797a5be706d6ddc4a298149'
const MINILM_REV = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'

const FILES = [
  {
    name: 'moonshine-encoder.onnx',
    url: hf('moonshine-ai/moonshine', MOONSHINE_REV, 'onnx/merged/base/float/encoder_model.onnx'),
    size: 80818781,
    sha256: '153e128e7abd64a74ee47f2c3f585c3171c4d46cbb368b032827934c4e01e779',
  },
  {
    name: 'moonshine-decoder.onnx',
    url: hf(
      'moonshine-ai/moonshine',
      MOONSHINE_REV,
      'onnx/merged/base/float/decoder_model_merged.onnx'
    ),
    size: 166211345,
    sha256: '58778763ca8438963190244d6b26572bdca2cedec56a4b91e828f3f2d69ef3c5',
  },
  {
    name: 'moonshine-tokenizer.json',
    url: hf('moonshine-ai/moonshine', MOONSHINE_REV, 'onnx/merged/base/float/tokenizer.json'),
    size: 3761751,
    sha256: 'ad3a2ceb0e84e4da57451d86fa337f8116dcff5f5d106434f8aa0b0de89718b9',
  },
  {
    name: 'all-MiniLM-L6-v2.onnx',
    url: hf('sentence-transformers/all-MiniLM-L6-v2', MINILM_REV, 'onnx/model.onnx'),
    size: 90405214,
    sha256: '6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452',
  },
  {
    name: 'all-MiniLM-L6-v2-tokenizer.json',
    url: hf('sentence-transformers/all-MiniLM-L6-v2', MINILM_REV, 'tokenizer.json'),
    size: 466247,
    sha256: 'be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037',
  },
  {
    name: 'all-MiniLM-L6-v2-vocab.txt',
    url: hf('sentence-transformers/all-MiniLM-L6-v2', MINILM_REV, 'vocab.txt'),
    size: 231508,
    sha256: '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3',
  },
]

// Apache-2.0. (The 3B variant is under the non-commercial Qwen Research License.)
const LLM = {
  name: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  url: hf(
    'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    '91cad51170dc346986eccefdc2dd33a9da36ead9',
    'qwen2.5-1.5b-instruct-q4_k_m.gguf'
  ),
  size: 1117320736,
  sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

async function ensure(file) {
  const dest = path.join(MODELS_DIR, file.name)
  if (fs.existsSync(dest) && fs.statSync(dest).size === file.size) {
    if ((await sha256(dest)) === file.sha256) {
      console.log(`✓ ${file.name} (already present)`)
      return
    }
    console.log(`! ${file.name} is present but does not match its checksum — re-downloading`)
  }

  const mb = (file.size / 1024 / 1024).toFixed(1)
  console.log(`↓ ${file.name} (${mb} MB)`)
  const partial = dest + '.partial'
  const response = await fetch(file.url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`${file.name}: HTTP ${response.status}`)
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial))

  const size = fs.statSync(partial).size
  const hash = size === file.size ? await sha256(partial) : ''
  if (size !== file.size || hash !== file.sha256) {
    fs.rmSync(partial, { force: true })
    throw new Error(`${file.name}: verification failed (size ${size}, expected ${file.size})`)
  }
  fs.renameSync(partial, dest)
  console.log(`✓ ${file.name}`)
}

async function main() {
  fs.mkdirSync(MODELS_DIR, { recursive: true })
  const files = process.argv.includes('--llm') ? [...FILES, LLM] : FILES
  for (const file of files) await ensure(file)
  console.log('\nAll models ready in resources/models')
}

main().catch(error => {
  console.error(`\n✗ ${error.message}`)
  process.exit(1)
})
