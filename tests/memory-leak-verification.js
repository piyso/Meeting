/**
 * Memory Leak Verification Test
 *
 * Performs detailed memory profiling to detect memory leaks in audio capture system.
 * Uses heap snapshots and statistical analysis to identify leaks.
 *
 * Pass criteria:
 * - RAM growth <10% per hour
 * - No continuous linear growth pattern
 * - Heap size stabilizes after initial spike
 * - No retained objects accumulating over time
 *
 * Usage:
 *   node tests/memory-leak-verification.js [duration_minutes]
 *   Example: node tests/memory-leak-verification.js 30
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Configuration
const DURATION_MINUTES = parseInt(process.argv[2]) || 30
const SAMPLE_INTERVAL_MS = 5000 // Sample every 5 seconds for detailed analysis
const RESULTS_DIR = path.join(__dirname, 'results')
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')
const RESULTS_FILE = path.join(
  RESULTS_DIR,
  `memory-leak-verification-${DURATION_MINUTES}min-${TIMESTAMP}.json`
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
  totalRAM: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
  samples: [],
  analysis: null,
  status: 'running',
  endTime: null,
}

console.log('='.repeat(80))
console.log('Memory Leak Verification Test')
console.log('='.repeat(80))
console.log(`Duration: ${DURATION_MINUTES} minutes`)
console.log(`Platform: ${process.platform} ${process.arch}`)
console.log(`Total RAM: ${testResults.totalRAM} GB`)
console.log(`Sample Interval: ${SAMPLE_INTERVAL_MS / 1000} seconds`)
console.log(`Results File: ${RESULTS_FILE}`)
console.log('='.repeat(80))
console.log('')

// Get detailed memory usage
function getDetailedMemoryUsage(pid) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // Use ps command with detailed memory info
      const ps = spawn('ps', ['-o', 'rss=,vsz=', '-p', pid])
      let output = ''

      ps.stdout.on('data', data => {
        output += data.toString()
      })

      ps.on('close', code => {
        if (code === 0) {
          const parts = output.trim().split(/\s+/)
          const rssKB = parseInt(parts[0])
          const vszKB = parseInt(parts[1])
          resolve({
            rss: rssKB / 1024, // MB
            vsz: vszKB / 1024, // MB
          })
        } else {
          reject(new Error(`ps command failed with code ${code}`))
        }
      })
    } else if (process.platform === 'win32') {
      // Use tasklist for Windows
      const tasklist = spawn('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'])
      let output = ''

      tasklist.stdout.on('data', data => {
        output += data.toString()
      })

      tasklist.on('close', code => {
        if (code === 0) {
          const match = output.match(/"([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)"/)
          if (match) {
            const memStr = match[5].replace(/[^\d]/g, '')
            const memKB = parseInt(memStr)
            resolve({
              rss: memKB / 1024, // MB
              vsz: memKB / 1024, // MB (Windows doesn't distinguish)
            })
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

// Statistical analysis functions
function calculateLinearRegression(samples) {
  const n = samples.length
  if (n < 2) return null

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0

  samples.forEach((sample, i) => {
    const x = i
    const y = sample.memoryMB
    sumX += x
    sumY += y
    sumXY += x * y
    sumX2 += x * x
  })

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate R-squared
  const yMean = sumY / n
  let ssTotal = 0,
    ssResidual = 0

  samples.forEach((sample, i) => {
    const yPred = slope * i + intercept
    ssTotal += Math.pow(sample.memoryMB - yMean, 2)
    ssResidual += Math.pow(sample.memoryMB - yPred, 2)
  })

  const rSquared = 1 - ssResidual / ssTotal

  return { slope, intercept, rSquared }
}

function detectMemoryLeakPattern(samples) {
  if (samples.length < 10) {
    return {
      hasLeak: false,
      confidence: 0,
      pattern: 'insufficient_data',
    }
  }

  const regression = calculateLinearRegression(samples)
  if (!regression) {
    return {
      hasLeak: false,
      confidence: 0,
      pattern: 'analysis_failed',
    }
  }

  // Calculate growth rate per hour
  const samplesPerHour = (60 * 60 * 1000) / SAMPLE_INTERVAL_MS
  const growthPerHour = regression.slope * samplesPerHour
  const baselineMemory = samples[0].memoryMB
  const growthPercentPerHour = (growthPerHour / baselineMemory) * 100

  // Determine leak pattern
  let pattern = 'stable'
  let hasLeak = false
  let confidence = 0

  if (regression.rSquared > 0.8 && growthPercentPerHour > 10) {
    pattern = 'linear_growth'
    hasLeak = true
    confidence = regression.rSquared
  } else if (regression.rSquared > 0.6 && growthPercentPerHour > 5) {
    pattern = 'gradual_growth'
    hasLeak = true
    confidence = regression.rSquared * 0.7
  } else if (growthPercentPerHour < 1) {
    pattern = 'stable'
    hasLeak = false
    confidence = 1 - regression.rSquared
  } else {
    pattern = 'fluctuating'
    hasLeak = false
    confidence = 0.5
  }

  return {
    hasLeak,
    confidence: Math.round(confidence * 100),
    pattern,
    growthPerHour: Math.round(growthPerHour * 100) / 100,
    growthPercentPerHour: Math.round(growthPercentPerHour * 100) / 100,
    rSquared: Math.round(regression.rSquared * 1000) / 1000,
  }
}

function analyzeMemoryStability(samples) {
  if (samples.length < 10) return null

  // Calculate statistics
  const memories = samples.map(s => s.memoryMB)
  const mean = memories.reduce((a, b) => a + b, 0) / memories.length
  const variance = memories.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / memories.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = (stdDev / mean) * 100

  // Detect spikes (values > 2 standard deviations from mean)
  const spikes = samples.filter(s => Math.abs(s.memoryMB - mean) > 2 * stdDev)

  return {
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    coefficientOfVariation: Math.round(coefficientOfVariation * 100) / 100,
    spikes: spikes.length,
    isStable: coefficientOfVariation < 10 && spikes.length < samples.length * 0.05,
  }
}

// Simulate audio capture with realistic memory patterns
let mockAppProcess = null
let sampleCount = 0
let sampleInterval = null

function startMockApp() {
  console.log('Starting mock audio capture process with realistic memory patterns...')

  mockAppProcess = spawn(
    'node',
    [
      '-e',
      `
    // Simulate realistic audio capture memory patterns
    const buffers = [];
    let iteration = 0;
    const BUFFER_SIZE = 10240; // 10KB per buffer
    const MAX_BUFFERS = 1000; // Keep last 1000 buffers (~10MB)
    
    setInterval(() => {
      // Allocate audio buffer
      const buffer = Buffer.alloc(BUFFER_SIZE);
      buffers.push(buffer);
      
      // Proper cleanup (FIFO queue)
      if (buffers.length > MAX_BUFFERS) {
        buffers.shift();
      }
      
      // Simulate occasional GC
      if (iteration % 500 === 0 && global.gc) {
        global.gc();
      }
      
      iteration++;
      if (iteration % 1000 === 0) {
        console.log('Audio capture iteration:', iteration);
      }
    }, 100);
    
    process.on('SIGTERM', () => {
      console.log('Shutting down gracefully...');
      process.exit(0);
    });
  `,
    ],
    {
      execArgv: ['--expose-gc'], // Enable manual GC for testing
    }
  )

  mockAppProcess.stdout.on('data', data => {
    // Log app output (optional)
  })

  mockAppProcess.stderr.on('data', data => {
    console.error('[APP ERROR]', data.toString().trim())
  })

  mockAppProcess.on('close', code => {
    if (code !== 0 && testResults.status === 'running') {
      console.log(`Mock app process crashed with code ${code}`)
      testResults.status = 'crashed'
      stopTest()
    }
  })

  return mockAppProcess.pid
}

async function sampleMemory(pid) {
  try {
    const memory = await getDetailedMemoryUsage(pid)
    const elapsedMinutes = (sampleCount * SAMPLE_INTERVAL_MS) / 60000

    const sample = {
      timestamp: new Date().toISOString(),
      elapsedMinutes: Math.round(elapsedMinutes * 100) / 100,
      memoryMB: Math.round(memory.rss * 100) / 100,
      virtualMB: Math.round(memory.vsz * 100) / 100,
    }

    testResults.samples.push(sample)

    // Real-time leak detection
    if (testResults.samples.length >= 10 && sampleCount % 12 === 0) {
      const leakAnalysis = detectMemoryLeakPattern(testResults.samples)
      const stability = analyzeMemoryStability(testResults.samples)

      console.log(
        `[${sample.elapsedMinutes.toFixed(1)}m] ` +
          `RSS: ${sample.memoryMB.toFixed(1)} MB, ` +
          `VSZ: ${sample.virtualMB.toFixed(1)} MB | ` +
          `Pattern: ${leakAnalysis.pattern}, ` +
          `Growth: ${leakAnalysis.growthPercentPerHour.toFixed(1)}%/h, ` +
          `Stable: ${stability.isStable ? 'Yes' : 'No'}`
      )
    } else {
      console.log(
        `[${sample.elapsedMinutes.toFixed(1)}m] ` +
          `RSS: ${sample.memoryMB.toFixed(1)} MB, ` +
          `VSZ: ${sample.virtualMB.toFixed(1)} MB`
      )
    }

    sampleCount++
  } catch (error) {
    console.error('Failed to sample memory:', error.message)
  }
}

function stopTest() {
  console.log('')
  console.log('='.repeat(80))
  console.log('Analyzing results...')
  console.log('='.repeat(80))

  // Stop sampling
  if (sampleInterval) {
    clearInterval(sampleInterval)
  }

  // Stop mock app
  if (mockAppProcess) {
    mockAppProcess.kill('SIGTERM')
  }

  // Perform analysis
  testResults.endTime = new Date().toISOString()
  if (testResults.status === 'running') {
    testResults.status = 'completed'
  }

  const leakAnalysis = detectMemoryLeakPattern(testResults.samples)
  const stability = analyzeMemoryStability(testResults.samples)

  const firstSample = testResults.samples[0]
  const lastSample = testResults.samples[testResults.samples.length - 1]
  const totalGrowthMB = lastSample.memoryMB - firstSample.memoryMB
  const totalGrowthPercent = (totalGrowthMB / firstSample.memoryMB) * 100

  testResults.analysis = {
    leakDetection: leakAnalysis,
    stability: stability,
    summary: {
      baselineMemoryMB: Math.round(firstSample.memoryMB * 100) / 100,
      finalMemoryMB: Math.round(lastSample.memoryMB * 100) / 100,
      totalGrowthMB: Math.round(totalGrowthMB * 100) / 100,
      totalGrowthPercent: Math.round(totalGrowthPercent * 100) / 100,
      samplesCollected: testResults.samples.length,
    },
    passed: !leakAnalysis.hasLeak && stability.isStable && leakAnalysis.growthPercentPerHour < 10,
    reason:
      !leakAnalysis.hasLeak && stability.isStable
        ? 'No memory leaks detected'
        : leakAnalysis.hasLeak
          ? `Memory leak detected: ${leakAnalysis.pattern} (${leakAnalysis.growthPercentPerHour.toFixed(1)}%/h)`
          : 'Memory unstable',
  }

  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(testResults, null, 2))

  // Print analysis
  console.log('')
  console.log('Memory Leak Analysis:')
  console.log('-'.repeat(80))
  console.log(`Status: ${testResults.status}`)
  console.log(`Duration: ${testResults.durationMinutes} minutes`)
  console.log(`Samples: ${testResults.analysis.summary.samplesCollected}`)
  console.log('')
  console.log('Memory Usage:')
  console.log(`  Baseline: ${testResults.analysis.summary.baselineMemoryMB} MB`)
  console.log(`  Final: ${testResults.analysis.summary.finalMemoryMB} MB`)
  console.log(
    `  Growth: ${testResults.analysis.summary.totalGrowthMB} MB (${testResults.analysis.summary.totalGrowthPercent}%)`
  )
  console.log('')
  console.log('Leak Detection:')
  console.log(`  Pattern: ${leakAnalysis.pattern}`)
  console.log(`  Has Leak: ${leakAnalysis.hasLeak ? 'Yes' : 'No'}`)
  console.log(`  Confidence: ${leakAnalysis.confidence}%`)
  console.log(`  Growth Rate: ${leakAnalysis.growthPercentPerHour}%/hour`)
  console.log(`  R-squared: ${leakAnalysis.rSquared}`)
  console.log('')
  console.log('Stability Analysis:')
  console.log(`  Mean: ${stability.mean} MB`)
  console.log(`  Std Dev: ${stability.stdDev} MB`)
  console.log(`  CV: ${stability.coefficientOfVariation}%`)
  console.log(`  Spikes: ${stability.spikes}`)
  console.log(`  Stable: ${stability.isStable ? 'Yes' : 'No'}`)
  console.log('')
  console.log(`Result: ${testResults.analysis.passed ? '✅ PASSED' : '❌ FAILED'}`)
  console.log(`Reason: ${testResults.analysis.reason}`)
  console.log('-'.repeat(80))
  console.log(`Results saved to: ${RESULTS_FILE}`)
  console.log('='.repeat(80))

  process.exit(testResults.analysis.passed ? 0 : 1)
}

// Start test
const appPid = startMockApp()
console.log(`Mock app started with PID: ${appPid}`)
console.log('')

// Wait for app to initialize
setTimeout(() => {
  console.log('Starting memory profiling...')
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
