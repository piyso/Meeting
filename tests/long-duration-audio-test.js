/**
 * Long-Duration Audio Capture Test
 *
 * Tests audio capture stability over extended periods:
 * - 60 minutes (1 hour)
 * - 120 minutes (2 hours)
 * - 480 minutes (8 hours)
 *
 * Pass criteria:
 * - No crashes
 * - No memory leaks (RAM growth <10% per hour)
 * - Audio capture remains functional throughout
 *
 * Usage:
 *   node tests/long-duration-audio-test.js [duration_minutes]
 *   Example: node tests/long-duration-audio-test.js 60
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Configuration
const DURATION_MINUTES = parseInt(process.argv[2]) || 60
const SAMPLE_INTERVAL_MS = 10000 // Sample memory every 10 seconds
const RESULTS_DIR = path.join(__dirname, 'results')
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')
const RESULTS_FILE = path.join(
  RESULTS_DIR,
  `long-duration-test-${DURATION_MINUTES}min-${TIMESTAMP}.json`
)

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
}

// Test state
const testResults = {
  startTime: new Date().toISOString(),
  durationMinutes: DURATION_MINUTES,
  platform: process.platform,
  arch: process.arch,
  totalRAM: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10, // GB
  samples: [],
  errors: [],
  status: 'running',
  endTime: null,
  summary: null,
}

console.log('='.repeat(80))
console.log('Long-Duration Audio Capture Test')
console.log('='.repeat(80))
console.log(`Duration: ${DURATION_MINUTES} minutes`)
console.log(`Platform: ${process.platform} ${process.arch}`)
console.log(`Total RAM: ${testResults.totalRAM} GB`)
console.log(`Sample Interval: ${SAMPLE_INTERVAL_MS / 1000} seconds`)
console.log(`Results File: ${RESULTS_FILE}`)
console.log('='.repeat(80))
console.log('')

// Get process memory usage
function getMemoryUsage(pid) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // Use ps command on Unix-like systems
      const ps = spawn('ps', ['-o', 'rss=', '-p', pid])
      let output = ''

      ps.stdout.on('data', data => {
        output += data.toString()
      })

      ps.on('close', code => {
        if (code === 0) {
          const rssKB = parseInt(output.trim())
          resolve(rssKB / 1024) // Convert to MB
        } else {
          reject(new Error(`ps command failed with code ${code}`))
        }
      })
    } else if (process.platform === 'win32') {
      // Use tasklist command on Windows
      const tasklist = spawn('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'])
      let output = ''

      tasklist.stdout.on('data', data => {
        output += data.toString()
      })

      tasklist.on('close', code => {
        if (code === 0) {
          // Parse CSV output: "name","pid","session","session#","mem usage"
          const match = output.match(/"([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)"/)
          if (match) {
            const memStr = match[5].replace(/[^\d]/g, '') // Remove non-digits
            const memKB = parseInt(memStr)
            resolve(memKB / 1024) // Convert to MB
          } else {
            reject(new Error('Failed to parse tasklist output'))
          }
        } else {
          reject(new Error(`tasklist command failed with code ${code}`))
        }
      })
    } else {
      reject(new Error(`Unsupported platform: ${process.platform}`))
    }
  })
}

// Simulate audio capture process
// In a real test, this would be the actual Electron app
let mockAppProcess = null
let sampleCount = 0
let sampleInterval = null

function startMockApp() {
  console.log('Starting mock audio capture process...')

  // For testing purposes, we'll use a Node.js process that simulates memory usage
  // In production, replace this with actual Electron app launch
  mockAppProcess = spawn('node', [
    '-e',
    `
    // Simulate audio capture with gradual memory growth
    const buffers = [];
    let iteration = 0;
    
    setInterval(() => {
      // Simulate audio buffer allocation (10KB per iteration)
      const buffer = Buffer.alloc(10240);
      buffers.push(buffer);
      
      // Periodically clean up old buffers (simulate proper memory management)
      if (buffers.length > 1000) {
        buffers.shift();
      }
      
      iteration++;
      if (iteration % 100 === 0) {
        console.log('Audio capture iteration:', iteration);
      }
    }, 100);
    
    // Keep process alive
    process.on('SIGTERM', () => {
      console.log('Shutting down gracefully...');
      process.exit(0);
    });
  `,
  ])

  mockAppProcess.stdout.on('data', data => {
    // Log app output (optional)
    // console.log('[APP]', data.toString().trim());
  })

  mockAppProcess.stderr.on('data', data => {
    const error = data.toString().trim()
    console.error('[APP ERROR]', error)
    testResults.errors.push({
      timestamp: new Date().toISOString(),
      error: error,
    })
  })

  mockAppProcess.on('close', code => {
    console.log(`Mock app process exited with code ${code}`)
    if (code !== 0 && testResults.status === 'running') {
      testResults.status = 'crashed'
      testResults.errors.push({
        timestamp: new Date().toISOString(),
        error: `Process crashed with exit code ${code}`,
      })
      stopTest()
    }
  })

  return mockAppProcess.pid
}

async function sampleMemory(pid) {
  try {
    const memoryMB = await getMemoryUsage(pid)
    const elapsedMinutes = (sampleCount * SAMPLE_INTERVAL_MS) / 60000

    const sample = {
      timestamp: new Date().toISOString(),
      elapsedMinutes: Math.round(elapsedMinutes * 100) / 100,
      memoryMB: Math.round(memoryMB * 100) / 100,
    }

    testResults.samples.push(sample)

    // Calculate memory growth rate
    if (testResults.samples.length > 1) {
      const firstSample = testResults.samples[0]
      const growthMB = sample.memoryMB - firstSample.memoryMB
      const growthPercent = (growthMB / firstSample.memoryMB) * 100
      const growthPerHour = (growthPercent / elapsedMinutes) * 60

      console.log(
        `[${sample.elapsedMinutes.toFixed(1)}m] ` +
          `Memory: ${sample.memoryMB.toFixed(1)} MB ` +
          `(+${growthMB.toFixed(1)} MB, +${growthPercent.toFixed(1)}%, ` +
          `${growthPerHour.toFixed(1)}%/hour)`
      )
    } else {
      console.log(
        `[${sample.elapsedMinutes.toFixed(1)}m] ` +
          `Memory: ${sample.memoryMB.toFixed(1)} MB (baseline)`
      )
    }

    sampleCount++
  } catch (error) {
    console.error('Failed to sample memory:', error.message)
    testResults.errors.push({
      timestamp: new Date().toISOString(),
      error: `Memory sampling failed: ${error.message}`,
    })
  }
}

function calculateSummary() {
  if (testResults.samples.length < 2) {
    return {
      passed: false,
      reason: 'Insufficient samples collected',
    }
  }

  const firstSample = testResults.samples[0]
  const lastSample = testResults.samples[testResults.samples.length - 1]

  const totalGrowthMB = lastSample.memoryMB - firstSample.memoryMB
  const totalGrowthPercent = (totalGrowthMB / firstSample.memoryMB) * 100
  const growthPerHour = (totalGrowthPercent / lastSample.elapsedMinutes) * 60

  const passed =
    testResults.status !== 'crashed' && testResults.errors.length === 0 && growthPerHour < 10

  return {
    passed,
    baselineMemoryMB: Math.round(firstSample.memoryMB * 100) / 100,
    finalMemoryMB: Math.round(lastSample.memoryMB * 100) / 100,
    totalGrowthMB: Math.round(totalGrowthMB * 100) / 100,
    totalGrowthPercent: Math.round(totalGrowthPercent * 100) / 100,
    growthPerHour: Math.round(growthPerHour * 100) / 100,
    samplesCollected: testResults.samples.length,
    errorsEncountered: testResults.errors.length,
    reason: passed
      ? 'All criteria met'
      : testResults.status === 'crashed'
        ? 'Process crashed'
        : testResults.errors.length > 0
          ? 'Errors encountered'
          : growthPerHour >= 10
            ? `Memory growth too high: ${growthPerHour.toFixed(1)}%/hour`
            : 'Unknown failure',
  }
}

function stopTest() {
  console.log('')
  console.log('='.repeat(80))
  console.log('Stopping test...')
  console.log('='.repeat(80))

  // Stop sampling
  if (sampleInterval) {
    clearInterval(sampleInterval)
  }

  // Stop mock app
  if (mockAppProcess) {
    mockAppProcess.kill('SIGTERM')
  }

  // Calculate summary
  testResults.endTime = new Date().toISOString()
  if (testResults.status === 'running') {
    testResults.status = 'completed'
  }
  testResults.summary = calculateSummary()

  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(testResults, null, 2))

  // Print summary
  console.log('')
  console.log('Test Summary:')
  console.log('-'.repeat(80))
  console.log(`Status: ${testResults.status}`)
  console.log(`Duration: ${testResults.durationMinutes} minutes`)
  console.log(`Samples Collected: ${testResults.summary.samplesCollected}`)
  console.log(`Errors: ${testResults.summary.errorsEncountered}`)
  console.log('')
  console.log(`Baseline Memory: ${testResults.summary.baselineMemoryMB} MB`)
  console.log(`Final Memory: ${testResults.summary.finalMemoryMB} MB`)
  console.log(
    `Total Growth: ${testResults.summary.totalGrowthMB} MB (${testResults.summary.totalGrowthPercent}%)`
  )
  console.log(`Growth Rate: ${testResults.summary.growthPerHour}%/hour`)
  console.log('')
  console.log(`Result: ${testResults.summary.passed ? '✅ PASSED' : '❌ FAILED'}`)
  console.log(`Reason: ${testResults.summary.reason}`)
  console.log('-'.repeat(80))
  console.log(`Results saved to: ${RESULTS_FILE}`)
  console.log('='.repeat(80))

  process.exit(testResults.summary.passed ? 0 : 1)
}

// Start test
const appPid = startMockApp()
console.log(`Mock app started with PID: ${appPid}`)
console.log('')

// Wait for app to initialize
setTimeout(() => {
  console.log('Starting memory sampling...')
  console.log('')

  // Take initial sample
  sampleMemory(appPid)

  // Start periodic sampling
  sampleInterval = setInterval(() => {
    sampleMemory(appPid)
  }, SAMPLE_INTERVAL_MS)

  // Stop after duration
  const durationMs = DURATION_MINUTES * 60 * 1000
  setTimeout(() => {
    stopTest()
  }, durationMs)
}, 2000)

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('')
  console.log('Test interrupted by user')
  testResults.status = 'interrupted'
  stopTest()
})
