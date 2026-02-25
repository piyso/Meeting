#!/usr/bin/env node

/**
 * Download AI Models for PiyAPI Notes
 * This script downloads all required AI models for the application
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { pipeline } = require('stream')
const { promisify } = require('util')

const streamPipeline = promisify(pipeline)

// Model directory
const MODELS_DIR = path.join(__dirname, '..', 'resources', 'models')

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
}

/**
 * Download a file from URL to destination
 */
async function downloadFile(url, dest, name) {
  console.log(`${colors.yellow}Downloading ${name}...${colors.reset}`)

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    let downloadedBytes = 0
    let totalBytes = 0

    https
      .get(url, response => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close()
          fs.unlinkSync(dest)
          return downloadFile(response.headers.location, dest, name).then(resolve).catch(reject)
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(dest)
          return reject(new Error(`Failed to download: HTTP ${response.statusCode}`))
        }

        totalBytes = parseInt(response.headers['content-length'], 10)

        response.on('data', chunk => {
          downloadedBytes += chunk.length
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1)
          const mbDownloaded = (downloadedBytes / 1024 / 1024).toFixed(2)
          const mbTotal = (totalBytes / 1024 / 1024).toFixed(2)
          process.stdout.write(`\r  Progress: ${percent}% (${mbDownloaded}MB / ${mbTotal}MB)`)
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          process.stdout.write('\n')
          const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(2)
          console.log(`${colors.green}✓ Downloaded ${name} (${size}MB)${colors.reset}\n`)
          resolve()
        })
      })
      .on('error', err => {
        file.close()
        fs.unlinkSync(dest)
        reject(err)
      })
  })
}

/**
 * Check if file exists and return its size
 */
function checkFile(filePath, name) {
  if (fs.existsSync(filePath)) {
    const size = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2)
    console.log(`${colors.green}✓ ${name} exists (${size}MB)${colors.reset}`)
    return true
  } else {
    console.log(`${colors.yellow}⚠ ${name} not found${colors.reset}`)
    return false
  }
}

/**
 * Main function
 */
async function main() {
  console.log('================================================')
  console.log('PiyAPI Notes - AI Models Download Script')
  console.log('================================================\n')

  // Create models directory if it doesn't exist
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true })
    console.log(`Created directory: ${MODELS_DIR}\n`)
  }

  // Download Silero VAD Model
  console.log('1. Silero VAD Model')
  console.log('-------------------')

  const vadModel = path.join(MODELS_DIR, 'silero_vad.onnx')
  const vadUrl = 'https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx'

  if (!checkFile(vadModel, 'Silero VAD')) {
    try {
      await downloadFile(vadUrl, vadModel, 'Silero VAD')
    } catch (error) {
      console.error(`${colors.red}✗ Failed to download Silero VAD:${colors.reset}`, error.message)
      process.exit(1)
    }
  } else {
    console.log('  Skipping download (already exists)\n')
  }

  // Download Whisper Turbo Model
  console.log('2. Whisper Turbo Model (High Tier - 16GB+ RAM)')
  console.log('-----------------------------------------------')

  const whisperModel = path.join(MODELS_DIR, 'ggml-large-v3-turbo.bin')
  const whisperUrl =
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin'

  if (!checkFile(whisperModel, 'Whisper Turbo')) {
    console.log('  Model: ggml-large-v3-turbo.bin (~1.6GB)')
    console.log('  Performance: 51.8x real-time (30s audio → 0.58s processing)')
    console.log('  RAM Usage: ~1.5GB during transcription')
    console.log('  Use Case: High tier machines (16GB+ RAM)\n')

    try {
      await downloadFile(whisperUrl, whisperModel, 'Whisper Turbo')
    } catch (error) {
      console.error(
        `${colors.red}✗ Failed to download Whisper Turbo:${colors.reset}`,
        error.message
      )
      console.log(`${colors.yellow}Note: You can manually download from:${colors.reset}`)
      console.log(`  ${whisperUrl}`)
      console.log(`  Save to: ${whisperModel}\n`)
      process.exit(1)
    }
  } else {
    console.log('  Skipping download (already exists)\n')
  }

  // Summary
  console.log('================================================')
  console.log('Download Summary')
  console.log('================================================\n')

  checkFile(vadModel, 'Silero VAD (Voice Activity Detection)')
  checkFile(whisperModel, 'Whisper Turbo (ASR - High Tier)')

  console.log(`\n${colors.green}✓ All required models are ready!${colors.reset}\n`)
  console.log(`Models location: ${MODELS_DIR}\n`)
  console.log('Next steps:')
  console.log('1. The VAD model will be used by src/main/workers/vad.worker.ts')
  console.log('2. The Whisper Turbo model will be used for high-tier transcription (16GB+ RAM)')
  console.log('3. Run "npm run dev" to start the application')
  console.log('4. The models will automatically load on first use\n')
  console.log('Hardware Tier Information:')
  console.log('  - High (16GB+ RAM): Whisper Turbo (1.5GB RAM, 51.8x RT)')
  console.log('  - Mid/Low (8-12GB RAM): Moonshine Base (300MB RAM, 290x RT) - To be added\n')
}

// Run main function
main().catch(error => {
  console.error(`${colors.red}Error:${colors.reset}`, error)
  process.exit(1)
})
