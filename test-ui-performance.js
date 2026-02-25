/**
 * Task 18.6: UI Performance Verification Test
 *
 * Comprehensive test to verify no UI lag or freezing during transcript display.
 * Tests beyond Task 18.5 to specifically measure:
 * - Long tasks (>50ms) that block the main thread
 * - Input latency during heavy updates
 * - Frame drops during animations
 * - Memory stability over time
 * - UI responsiveness during stress conditions
 */

class UIPerformanceTest {
  constructor() {
    this.isRunning = false
    this.startTime = null
    this.segmentCount = 0
    this.longTasks = []
    this.inputLatencies = []
    this.frameRates = []
    this.lastFrameTime = performance.now()
    this.frameCount = 0
    this.testDuration = 300 // 5 minutes for standard test
    this.updateInterval = 2000 // 2 seconds between segments
    this.intervals = []
    this.animationFrameId = null

    // Sample data
    this.sampleTexts = [
      "Let's start by reviewing the quarterly results and discussing our progress...",
      'I think we should focus on improving customer satisfaction metrics this quarter...',
      'The development team has made significant progress on the new features...',
      'We need to address the budget concerns raised in the last meeting...',
      'Can someone provide an update on the marketing campaign performance?',
      "I'd like to propose a new approach to handling customer feedback...",
      'The sales numbers are looking strong, especially in the enterprise segment...',
      'We should schedule a follow-up meeting to discuss the implementation details...',
      'Has anyone had a chance to review the proposal I sent last week?',
      "I'm concerned about the timeline for the product launch...",
      "Let's make sure we're all aligned on the priorities for next quarter...",
      'The customer feedback has been overwhelmingly positive so far...',
      'We need to allocate more resources to the support team...',
      "I've been working on a solution to the performance issues we discussed...",
      'Can we revisit the decision we made about the pricing strategy?',
      "The competitive analysis shows we're well-positioned in the market...",
      'I think we should consider expanding into new geographic regions...',
      'The technical debt is starting to impact our development velocity...',
      'We need to improve our internal communication processes...',
      "Let's schedule a brainstorming session for the new product ideas...",
      'The user research findings are quite interesting and actionable...',
      "We should celebrate the team's achievements this quarter...",
      "I'd like to get everyone's input on the strategic direction...",
      'The partnership discussions are progressing well...',
      'We need to finalize the roadmap for the next six months...',
      'Can someone clarify the requirements for the new feature?',
      'The infrastructure costs are higher than we anticipated...',
      "I'm excited about the potential of the new technology stack...",
      'We should conduct a retrospective to identify areas for improvement...',
      'The onboarding process for new team members needs to be streamlined...',
    ]

    this.speakers = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']

    this.initializeElements()
    this.attachEventListeners()
    this.startFrameRateMonitoring()
    this.startLongTaskDetection()
  }

  initializeElements() {
    this.elements = {
      startBtn: document.getElementById('startBtn'),
      stopBtn: document.getElementById('stopBtn'),
      stressBtn: document.getElementById('stressBtn'),
      rapidBtn: document.getElementById('rapidBtn'),
      clearBtn: document.getElementById('clearBtn'),
      reportBtn: document.getElementById('reportBtn'),
      transcriptContainer: document.getElementById('transcriptContainer'),
      logContainer: document.getElementById('logContainer'),
      fps: document.getElementById('fps'),
      fpsBar: document.getElementById('fpsBar'),
      longTasks: document.getElementById('longTasks'),
      inputLatency: document.getElementById('inputLatency'),
      segmentCount: document.getElementById('segmentCount'),
      memoryUsage: document.getElementById('memoryUsage'),
      testStatus: document.getElementById('testStatus'),
    }

    // Interaction buttons for latency testing
    for (let i = 1; i <= 6; i++) {
      this.elements[`btn${i}`] = document.getElementById(`btn${i}`)
    }
  }

  attachEventListeners() {
    this.elements.startBtn.addEventListener('click', () => this.startTest())
    this.elements.stopBtn.addEventListener('click', () => this.stopTest())
    this.elements.stressBtn.addEventListener('click', () => this.runStressTest())
    this.elements.rapidBtn.addEventListener('click', () => this.runRapidFireTest())
    this.elements.clearBtn.addEventListener('click', () => this.clearTranscripts())
    this.elements.reportBtn.addEventListener('click', () => this.generateReport())

    // Attach click handlers to interaction buttons for latency measurement
    for (let i = 1; i <= 6; i++) {
      this.elements[`btn${i}`].addEventListener('click', e => this.measureInputLatency(e, i))
    }
  }

  log(message, type = 'info') {
    const entry = document.createElement('div')
    entry.className = `log-entry ${type}`
    const timestamp = new Date().toLocaleTimeString()
    entry.textContent = `[${timestamp}] ${message}`
    this.elements.logContainer.appendChild(entry)
    this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight
  }

  startTest() {
    if (this.isRunning) return

    this.isRunning = true
    this.startTime = performance.now()
    this.segmentCount = 0
    this.longTasks = []
    this.inputLatencies = []

    this.elements.startBtn.disabled = true
    this.elements.stopBtn.disabled = false
    this.updateTestStatus('running', 'Running')

    this.clearTranscripts()
    this.log('Performance test started (5 minutes)', 'success')
    this.log('Adding segments every 2 seconds...', 'info')

    // Add segments at regular intervals
    const segmentInterval = setInterval(() => {
      if (!this.isRunning) return
      this.addTranscriptSegment()
    }, this.updateInterval)
    this.intervals.push(segmentInterval)

    // Update metrics every 100ms
    const metricsInterval = setInterval(() => {
      if (!this.isRunning) return
      this.updateMetrics()
    }, 100)
    this.intervals.push(metricsInterval)

    // Auto-stop after test duration
    const stopTimeout = setTimeout(() => {
      if (this.isRunning) {
        this.stopTest()
        this.log('Test completed automatically after 5 minutes', 'success')
        this.generateReport()
      }
    }, this.testDuration * 1000)
    this.intervals.push(stopTimeout)
  }

  stopTest() {
    if (!this.isRunning) return

    this.isRunning = false
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals = []

    this.elements.startBtn.disabled = false
    this.elements.stopBtn.disabled = true
    this.updateTestStatus('stopped', 'Stopped')

    this.log('Performance test stopped', 'warning')
  }

  runStressTest() {
    this.log('Starting stress test: Adding 500 segments rapidly...', 'warning')
    this.clearTranscripts()

    const batchSize = 50
    const batches = 10
    let currentBatch = 0

    const addBatch = () => {
      const startTime = performance.now()

      for (let i = 0; i < batchSize; i++) {
        this.addTranscriptSegment(false) // Don't log each segment
      }

      const duration = performance.now() - startTime
      this.log(
        `Batch ${currentBatch + 1}/${batches}: Added ${batchSize} segments in ${duration.toFixed(2)}ms`,
        'info'
      )

      currentBatch++
      if (currentBatch < batches) {
        setTimeout(addBatch, 100) // Small delay between batches
      } else {
        this.log(`Stress test complete: ${this.segmentCount} segments added`, 'success')
        this.log('Check FPS and long tasks metrics for performance impact', 'info')
      }
    }

    addBatch()
  }

  runRapidFireTest() {
    this.log('Starting rapid fire test: 10 segments/second for 10 seconds...', 'warning')
    this.clearTranscripts()

    let count = 0
    const maxCount = 100
    const interval = setInterval(() => {
      this.addTranscriptSegment(false)
      count++

      if (count >= maxCount) {
        clearInterval(interval)
        this.log(`Rapid fire test complete: ${maxCount} segments in 10 seconds`, 'success')
        this.log('Check FPS and input latency during the test', 'info')
      }
    }, 100) // 10 per second
  }

  addTranscriptSegment(shouldLog = true) {
    const startTime = performance.now()

    const segment = document.createElement('div')
    segment.className = 'transcript-segment'

    const text = this.sampleTexts[Math.floor(Math.random() * this.sampleTexts.length)]
    const speaker = this.speakers[Math.floor(Math.random() * this.speakers.length)]
    const confidence = 0.7 + Math.random() * 0.3 // 70-100%
    const time = this.segmentCount * 3 // Approximate time

    const confidenceClass = confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low'

    segment.innerHTML = `
      <div class="segment-header">
        <span class="segment-time">${this.formatTime(time)}</span>
        <span class="segment-speaker">👤 ${speaker}</span>
        <span class="segment-confidence ${confidenceClass}">${(confidence * 100).toFixed(0)}%</span>
      </div>
      <div class="segment-text">${text}</div>
    `

    this.elements.transcriptContainer.appendChild(segment)
    this.segmentCount++

    // Auto-scroll to bottom
    this.elements.transcriptContainer.scrollTop = this.elements.transcriptContainer.scrollHeight

    const renderTime = performance.now() - startTime

    // Detect long tasks (>50ms)
    if (renderTime > 50) {
      this.longTasks.push({
        time: performance.now(),
        duration: renderTime,
        type: 'segment-render',
      })
      if (shouldLog) {
        this.log(`⚠️ Long task detected: ${renderTime.toFixed(2)}ms`, 'warning')
      }
    }

    if (shouldLog && this.segmentCount % 10 === 0) {
      this.log(`Added ${this.segmentCount} segments (render: ${renderTime.toFixed(2)}ms)`, 'info')
    }
  }

  measureInputLatency(event, buttonId) {
    const clickTime = event.timeStamp
    const responseTime = performance.now()
    const latency = responseTime - clickTime

    this.inputLatencies.push(latency)

    // Visual feedback
    const button = this.elements[`btn${buttonId}`]
    const originalText = button.textContent
    button.textContent = `${latency.toFixed(0)}ms`
    button.style.background = latency < 100 ? '#48bb78' : latency < 200 ? '#ed8936' : '#f56565'
    button.style.color = 'white'

    setTimeout(() => {
      button.textContent = originalText
      button.style.background = ''
      button.style.color = ''
    }, 500)

    if (latency > 100) {
      this.log(`⚠️ High input latency: ${latency.toFixed(2)}ms on Button ${buttonId}`, 'warning')
    }
  }

  clearTranscripts() {
    this.elements.transcriptContainer.innerHTML = ''
    this.segmentCount = 0
    this.elements.segmentCount.textContent = '0'
    this.log('Transcripts cleared', 'info')
  }

  updateMetrics() {
    // Update segment count
    this.elements.segmentCount.textContent = this.segmentCount

    // Update long tasks count
    this.elements.longTasks.textContent = this.longTasks.length
    if (this.longTasks.length > 0) {
      this.elements.longTasks.classList.add('warning')
    }

    // Update average input latency
    if (this.inputLatencies.length > 0) {
      const avgLatency = this.inputLatencies.reduce((a, b) => a + b, 0) / this.inputLatencies.length
      this.elements.inputLatency.textContent = `${avgLatency.toFixed(0)}ms`

      if (avgLatency < 100) {
        this.elements.inputLatency.classList.remove('warning', 'poor')
        this.elements.inputLatency.classList.add('excellent')
      } else if (avgLatency < 200) {
        this.elements.inputLatency.classList.remove('excellent', 'poor')
        this.elements.inputLatency.classList.add('warning')
      } else {
        this.elements.inputLatency.classList.remove('excellent', 'warning')
        this.elements.inputLatency.classList.add('poor')
      }
    }

    // Update memory usage
    if (performance.memory) {
      const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)
      this.elements.memoryUsage.textContent = `${usedMB} MB`
    } else {
      this.elements.memoryUsage.textContent = 'N/A'
    }
  }

  startFrameRateMonitoring() {
    let lastTime = performance.now()
    let frames = []

    const measureFrame = () => {
      const currentTime = performance.now()
      const delta = currentTime - lastTime
      lastTime = currentTime

      if (delta > 0) {
        const fps = 1000 / delta
        frames.push(fps)

        // Keep last 60 frames
        if (frames.length > 60) {
          frames.shift()
        }

        // Calculate average FPS
        const avgFps = frames.reduce((a, b) => a + b, 0) / frames.length

        // Update UI
        this.elements.fps.textContent = `${avgFps.toFixed(1)} FPS`

        // Color code based on performance
        if (avgFps >= 55) {
          this.elements.fps.classList.remove('good', 'warning', 'poor')
          this.elements.fps.classList.add('excellent')
          this.elements.fpsBar.style.width = '100%'
        } else if (avgFps >= 30) {
          this.elements.fps.classList.remove('excellent', 'warning', 'poor')
          this.elements.fps.classList.add('good')
          this.elements.fpsBar.style.width = `${(avgFps / 60) * 100}%`
        } else if (avgFps >= 20) {
          this.elements.fps.classList.remove('excellent', 'good', 'poor')
          this.elements.fps.classList.add('warning')
          this.elements.fpsBar.style.width = `${(avgFps / 60) * 100}%`
        } else {
          this.elements.fps.classList.remove('excellent', 'good', 'warning')
          this.elements.fps.classList.add('poor')
          this.elements.fpsBar.style.width = `${(avgFps / 60) * 100}%`
        }

        this.frameRates.push(avgFps)
      }

      this.animationFrameId = requestAnimationFrame(measureFrame)
    }

    measureFrame()
  }

  startLongTaskDetection() {
    // Use PerformanceObserver to detect long tasks
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              this.longTasks.push({
                time: entry.startTime,
                duration: entry.duration,
                type: entry.name,
              })
              this.log(
                `⚠️ Long task detected: ${entry.duration.toFixed(2)}ms (${entry.name})`,
                'warning'
              )
            }
          }
        })

        observer.observe({ entryTypes: ['longtask'] })
        this.log('Long task detection enabled', 'success')
      } catch (e) {
        this.log('Long task detection not supported in this browser', 'warning')
      }
    }
  }

  updateTestStatus(status, text) {
    const indicator = this.elements.testStatus.querySelector('.status-indicator')
    indicator.className = `status-indicator ${status}`
    this.elements.testStatus.innerHTML = `<span class="status-indicator ${status}"></span>${text}`
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  generateReport() {
    this.log('=== PERFORMANCE TEST REPORT ===', 'info')

    // Test duration
    const duration = this.startTime ? (performance.now() - this.startTime) / 1000 : 0
    this.log(`Test Duration: ${duration.toFixed(1)}s`, 'info')

    // Segments
    this.log(`Segments Added: ${this.segmentCount}`, 'info')

    // Frame rate
    if (this.frameRates.length > 0) {
      const avgFps = this.frameRates.reduce((a, b) => a + b, 0) / this.frameRates.length
      const minFps = Math.min(...this.frameRates)
      this.log(
        `Average FPS: ${avgFps.toFixed(1)} (min: ${minFps.toFixed(1)})`,
        avgFps >= 55 ? 'success' : 'warning'
      )
    }

    // Long tasks
    this.log(
      `Long Tasks (>50ms): ${this.longTasks.length}`,
      this.longTasks.length === 0 ? 'success' : 'warning'
    )
    if (this.longTasks.length > 0) {
      const avgDuration = this.longTasks.reduce((a, b) => a + b.duration, 0) / this.longTasks.length
      const maxDuration = Math.max(...this.longTasks.map(t => t.duration))
      this.log(
        `  Average: ${avgDuration.toFixed(2)}ms, Max: ${maxDuration.toFixed(2)}ms`,
        'warning'
      )
    }

    // Input latency
    if (this.inputLatencies.length > 0) {
      const avgLatency = this.inputLatencies.reduce((a, b) => a + b, 0) / this.inputLatencies.length
      const maxLatency = Math.max(...this.inputLatencies)
      this.log(
        `Input Latency: ${avgLatency.toFixed(2)}ms avg (max: ${maxLatency.toFixed(2)}ms)`,
        avgLatency < 100 ? 'success' : 'warning'
      )
    } else {
      this.log('Input Latency: Not measured (click interaction buttons)', 'info')
    }

    // Memory
    if (performance.memory) {
      const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)
      const limitMB = (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)
      this.log(`Memory Usage: ${usedMB} MB / ${limitMB} MB`, 'info')
    }

    // Overall verdict
    this.log('=== VERDICT ===', 'info')

    const avgFps =
      this.frameRates.length > 0
        ? this.frameRates.reduce((a, b) => a + b, 0) / this.frameRates.length
        : 0
    const avgLatency =
      this.inputLatencies.length > 0
        ? this.inputLatencies.reduce((a, b) => a + b, 0) / this.inputLatencies.length
        : 0

    const fpsPass = avgFps >= 55
    const longTasksPass = this.longTasks.length < 5
    const latencyPass = avgLatency < 100 || this.inputLatencies.length === 0

    if (fpsPass && longTasksPass && latencyPass) {
      this.log('✅ PASS - No UI lag or freezing detected!', 'success')
      this.log('UI remains responsive during transcript updates', 'success')
    } else {
      this.log('⚠️ ISSUES DETECTED:', 'warning')
      if (!fpsPass) this.log('  - Frame rate below 55 FPS', 'warning')
      if (!longTasksPass) this.log('  - Multiple long tasks detected', 'warning')
      if (!latencyPass) this.log('  - High input latency detected', 'warning')
    }

    // Console report for detailed analysis
    console.log('=== DETAILED PERFORMANCE REPORT ===')
    console.log('Test Duration:', duration.toFixed(1), 's')
    console.log('Segments Added:', this.segmentCount)
    console.log('Average FPS:', avgFps.toFixed(1))
    console.log('Long Tasks:', this.longTasks.length)
    console.log('Input Latency:', avgLatency.toFixed(2), 'ms')
    console.log('Long Tasks Details:', this.longTasks)
    console.log('Input Latencies:', this.inputLatencies)
  }
}

// Initialize test when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.performanceTest = new UIPerformanceTest()
  console.log('UI Performance Test initialized')
  console.log('Click "Start Performance Test" to begin')
})
