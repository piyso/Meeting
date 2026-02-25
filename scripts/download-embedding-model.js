/**
 * Download all-MiniLM-L6-v2 ONNX Model
 *
 * Downloads the sentence-transformers embedding model for local semantic search.
 * Model size: ~25MB
 * Source: HuggingFace
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MODEL_URL =
  'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx'
const TOKENIZER_URL =
  'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json'
const VOCAB_URL =
  'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/vocab.txt'

const MODELS_DIR = path.join(__dirname, '..', 'resources', 'models')
const MODEL_PATH = path.join(MODELS_DIR, 'all-MiniLM-L6-v2.onnx')
const TOKENIZER_PATH = path.join(MODELS_DIR, 'all-MiniLM-L6-v2-tokenizer.json')
const VOCAB_PATH = path.join(MODELS_DIR, 'all-MiniLM-L6-v2-vocab.txt')

// Expected SHA-256 checksums (verify integrity)
const EXPECTED_CHECKSUMS = {
  model: null, // Will be calculated on first download
  tokenizer: null,
  vocab: null,
}

/**
 * Download file with progress indicator
 */
function downloadFile(url, destPath, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n📥 Downloading ${label}...`)
    console.log(`   URL: ${url}`)

    const file = fs.createWriteStream(destPath)
    let downloadedBytes = 0
    let totalBytes = 0

    https
      .get(url, { headers: { 'User-Agent': 'PiyAPI-Notes' } }, response => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close()
          fs.unlinkSync(destPath)
          return downloadFile(response.headers.location, destPath, label)
            .then(resolve)
            .catch(reject)
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(destPath)
          return reject(new Error(`Failed to download: HTTP ${response.statusCode}`))
        }

        totalBytes = parseInt(response.headers['content-length'], 10)

        response.on('data', chunk => {
          downloadedBytes += chunk.length
          const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1)
          const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(2)
          const totalMB = (totalBytes / 1024 / 1024).toFixed(2)
          process.stdout.write(`\r   Progress: ${progress}% (${downloadedMB} MB / ${totalMB} MB)`)
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          console.log(`\n   ✅ Downloaded successfully`)
          resolve()
        })
      })
      .on('error', err => {
        file.close()
        fs.unlinkSync(destPath)
        reject(err)
      })
  })
}

/**
 * Calculate SHA-256 checksum
 */
function calculateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)

    stream.on('data', data => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Verify file integrity
 */
async function verifyIntegrity(filePath, expectedChecksum, label) {
  if (!expectedChecksum) {
    console.log(`   ⚠️  No checksum available for ${label}, skipping verification`)
    return true
  }

  console.log(`   🔍 Verifying ${label} integrity...`)
  const actualChecksum = await calculateChecksum(filePath)

  if (actualChecksum === expectedChecksum) {
    console.log(`   ✅ Checksum verified`)
    return true
  } else {
    console.log(`   ❌ Checksum mismatch!`)
    console.log(`      Expected: ${expectedChecksum}`)
    console.log(`      Actual:   ${actualChecksum}`)
    return false
  }
}

/**
 * Main download function
 */
async function main() {
  console.log('🚀 PiyAPI Notes - Embedding Model Downloader')
  console.log('============================================\n')

  // Create models directory if it doesn't exist
  if (!fs.existsSync(MODELS_DIR)) {
    console.log(`📁 Creating models directory: ${MODELS_DIR}`)
    fs.mkdirSync(MODELS_DIR, { recursive: true })
  }

  try {
    // Check if model already exists
    if (fs.existsSync(MODEL_PATH)) {
      console.log('⚠️  Model already exists. Delete it to re-download.')
      const stats = fs.statSync(MODEL_PATH)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
      console.log(`   Size: ${sizeMB} MB`)
      console.log(`   Path: ${MODEL_PATH}`)

      // Calculate and display checksum
      const checksum = await calculateChecksum(MODEL_PATH)
      console.log(`   SHA-256: ${checksum}`)
      return
    }

    // Download model
    await downloadFile(MODEL_URL, MODEL_PATH, 'ONNX Model')

    // Verify model size
    const stats = fs.statSync(MODEL_PATH)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
    console.log(`   📊 Model size: ${sizeMB} MB`)

    if (stats.size < 20 * 1024 * 1024) {
      throw new Error(`Model file too small (${sizeMB} MB). Expected ~25 MB.`)
    }

    // Calculate checksum for future verification
    const checksum = await calculateChecksum(MODEL_PATH)
    console.log(`   🔑 SHA-256: ${checksum}`)

    // Download tokenizer (optional, for better tokenization)
    console.log('\n📥 Downloading tokenizer (optional)...')
    try {
      await downloadFile(TOKENIZER_URL, TOKENIZER_PATH, 'Tokenizer')
    } catch (err) {
      console.log(`   ⚠️  Tokenizer download failed (non-critical): ${err.message}`)
    }

    // Download vocab (optional, for better tokenization)
    console.log('\n📥 Downloading vocabulary (optional)...')
    try {
      await downloadFile(VOCAB_URL, VOCAB_PATH, 'Vocabulary')
    } catch (err) {
      console.log(`   ⚠️  Vocabulary download failed (non-critical): ${err.message}`)
    }

    console.log('\n✅ All downloads complete!')
    console.log(`\n📁 Model location: ${MODEL_PATH}`)
    console.log('🎉 Ready to use LocalEmbeddingService\n')
  } catch (error) {
    console.error('\n❌ Download failed:', error.message)
    console.error('\n🔧 Troubleshooting:')
    console.error('   1. Check your internet connection')
    console.error('   2. Verify HuggingFace is accessible')
    console.error('   3. Try again in a few minutes')
    console.error(
      '   4. Manual download: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2'
    )
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

module.exports = { downloadFile, calculateChecksum, verifyIntegrity }
