#!/usr/bin/env node

/**
 * Moonshine Base Model Downloader
 *
 * Downloads the Moonshine Base ONNX model for speech recognition.
 * Model specs:
 * - Size: ~250MB
 * - Speed: 290x real-time (10s audio → 34ms)
 * - WER: 12%
 * - RAM: ~300MB
 * - Best for: 8-12GB RAM systems
 *
 * Usage:
 *   node scripts/download-moonshine-model.js
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Configuration
const MODEL_URL = 'https://huggingface.co/UsefulSensors/moonshine/resolve/main/onnx/base.onnx'
const PREPROCESSOR_URL =
  'https://huggingface.co/UsefulSensors/moonshine/resolve/main/onnx/preprocess.onnx'
const MODELS_DIR = path.join(__dirname, '..', 'resources', 'models')
const MODEL_PATH = path.join(MODELS_DIR, 'moonshine-base.onnx')
const PREPROCESSOR_PATH = path.join(MODELS_DIR, 'moonshine-preprocess.onnx')

// Expected checksums (SHA-256)
const EXPECTED_CHECKSUMS = {
  'moonshine-base.onnx': null, // Will be calculated on first download
  'moonshine-preprocess.onnx': null,
}

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true })
  console.log(`Created models directory: ${MODELS_DIR}`)
}

/**
 * Calculate SHA-256 checksum of a file
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
 * Download file with progress indicator
 */
function downloadFile(url, destPath, description) {
  return new Promise((resolve, reject) => {
    console.log(`\nDownloading ${description}...`)
    console.log(`URL: ${url}`)
    console.log(`Destination: ${destPath}`)

    const file = fs.createWriteStream(destPath)
    let downloadedBytes = 0
    let totalBytes = 0
    let lastProgress = 0

    https
      .get(url, response => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          console.log(`Following redirect to: ${redirectUrl}`)
          file.close()
          fs.unlinkSync(destPath)
          return downloadFile(redirectUrl, destPath, description).then(resolve).catch(reject)
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`))
          return
        }

        totalBytes = parseInt(response.headers['content-length'], 10)
        console.log(`Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`)

        response.on('data', chunk => {
          downloadedBytes += chunk.length
          file.write(chunk)

          // Update progress every 5%
          const progress = Math.floor((downloadedBytes / totalBytes) * 100)
          if (progress >= lastProgress + 5) {
            const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(2)
            const totalMB = (totalBytes / 1024 / 1024).toFixed(2)
            console.log(`Progress: ${progress}% (${downloadedMB} / ${totalMB} MB)`)
            lastProgress = progress
          }
        })

        response.on('end', () => {
          file.end()
          console.log(`✅ Download complete: ${description}`)
          resolve()
        })

        response.on('error', error => {
          file.close()
          fs.unlinkSync(destPath)
          reject(error)
        })
      })
      .on('error', error => {
        file.close()
        fs.unlinkSync(destPath)
        reject(error)
      })
  })
}

/**
 * Verify file integrity
 */
async function verifyFile(filePath, expectedChecksum) {
  console.log(`\nVerifying ${path.basename(filePath)}...`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const actualChecksum = await calculateChecksum(filePath)
  console.log(`Checksum: ${actualChecksum}`)

  if (expectedChecksum && actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum mismatch! Expected: ${expectedChecksum}, Got: ${actualChecksum}`)
  }

  console.log(`✅ File verified: ${path.basename(filePath)}`)
  return actualChecksum
}

/**
 * Check if model already exists
 */
function modelExists() {
  return fs.existsSync(MODEL_PATH) && fs.existsSync(PREPROCESSOR_PATH)
}

/**
 * Main download function
 */
async function main() {
  console.log('='.repeat(80))
  console.log('Moonshine Base Model Downloader')
  console.log('='.repeat(80))

  // Check if models already exist
  if (modelExists()) {
    console.log('\n✅ Moonshine Base model already exists!')
    console.log(`Model: ${MODEL_PATH}`)
    console.log(`Preprocessor: ${PREPROCESSOR_PATH}`)

    // Verify existing files
    try {
      await verifyFile(MODEL_PATH, EXPECTED_CHECKSUMS['moonshine-base.onnx'])
      await verifyFile(PREPROCESSOR_PATH, EXPECTED_CHECKSUMS['moonshine-preprocess.onnx'])
      console.log('\n✅ All files verified successfully!')
      return
    } catch (error) {
      console.log(`\n⚠️  Verification failed: ${error.message}`)
      console.log('Re-downloading models...')
    }
  }

  try {
    // Download base model
    await downloadFile(MODEL_URL, MODEL_PATH, 'Moonshine Base model')
    const baseChecksum = await verifyFile(MODEL_PATH, EXPECTED_CHECKSUMS['moonshine-base.onnx'])

    // Download preprocessor
    await downloadFile(PREPROCESSOR_URL, PREPROCESSOR_PATH, 'Moonshine preprocessor')
    const preprocessorChecksum = await verifyFile(
      PREPROCESSOR_PATH,
      EXPECTED_CHECKSUMS['moonshine-preprocess.onnx']
    )

    // Save checksums for future verification
    const checksumFile = path.join(MODELS_DIR, 'moonshine-checksums.json')
    fs.writeFileSync(
      checksumFile,
      JSON.stringify(
        {
          'moonshine-base.onnx': baseChecksum,
          'moonshine-preprocess.onnx': preprocessorChecksum,
        },
        null,
        2
      )
    )

    console.log('\n' + '='.repeat(80))
    console.log('✅ Moonshine Base model downloaded successfully!')
    console.log('='.repeat(80))
    console.log(`\nModel location: ${MODEL_PATH}`)
    console.log(`Preprocessor location: ${PREPROCESSOR_PATH}`)
    console.log(`\nModel specs:`)
    console.log(`  - Size: ~250MB`)
    console.log(`  - Speed: 290x real-time`)
    console.log(`  - WER: 12%`)
    console.log(`  - RAM: ~300MB`)
    console.log(`  - Best for: 8-12GB RAM systems`)
    console.log('\nYou can now use Moonshine Base for transcription!')
  } catch (error) {
    console.error('\n❌ Download failed:', error.message)
    console.error('\nTroubleshooting:')
    console.error('1. Check your internet connection')
    console.error('2. Verify you have write permissions to:', MODELS_DIR)
    console.error('3. Try downloading manually from:')
    console.error(`   ${MODEL_URL}`)
    console.error(`   ${PREPROCESSOR_URL}`)
    console.error('4. Place files in:', MODELS_DIR)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { downloadFile, verifyFile, modelExists }
