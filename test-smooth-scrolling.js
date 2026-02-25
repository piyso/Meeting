/**
 * Task 18.5: Smooth Scrolling Test
 *
 * Simulates a 10-minute meeting with continuous transcript updates
 * to verify smooth scrolling performance.
 *
 * Test Requirements:
 * - Simulate 10-minute meeting (600 seconds)
 * - Add transcript segments every 2-3 seconds (realistic frequency)
 * - Generate 200+ transcript segments
 * - Verify smooth auto-scroll without lag or jank
 * - Monitor scroll performance and frame rate
 * - Document test results
 */

class SmoothScrollingTest {
  constructor() {
    this.isRunning = false
    this.startTime = null
    this.segmentCount = 0
    this.scrollEvents = 0
    this.renderTimes = []
    this.frameRates = []
    this.testDuration = 600 // 10 minutes in seconds
    this.updateInterval = null
    this.transcriptInterval = null
    this.metricsInterval = null
    this.lastFrameTime = performance.now()
    this.frameCount = 0

    // Sample transcript texts for realistic simulation
    this.sampleTexts = [
      "Let's start by reviewing the quarterly results and discussing our key performance indicators.",
      'I think we should focus on improving customer satisfaction scores in the next quarter.',
      'The development team has made significant progress on the new feature set.',
      'We need to allocate more resources to the marketing campaign for the product launch.',
      'Can someone provide an update on the budget allocation for this project?',
      "I agree with that approach. Let's schedule a follow-up meeting to discuss the details.",
      'The data shows a 15% increase in user engagement over the past month.',
      'We should consider implementing the feedback from our beta testers.',
      "I'll send out the meeting notes and action items by end of day.",
      "Let's move on to the next agenda item regarding the timeline.",
      'The client has requested some changes to the initial proposal.',
      'We need to ensure all stakeholders are aligned on the project goals.',
      'I recommend we conduct a thorough analysis before making a final decision.',
      'The team has done an excellent job meeting the tight deadlines.',
      'We should schedule a demo for the executive team next week.',
      'I have some concerns about the current approach and would like to discuss alternatives.',
      "Let's table this discussion for now and revisit it in our next meeting.",
      'The preliminary results look promising, but we need more data to confirm.',
      "I'll coordinate with the other departments to ensure smooth implementation.",
      'We need to prioritize the critical issues identified in the last sprint.',
      'The feedback from the focus group was overwhelmingly positive.',
      'I suggest we create a detailed roadmap for the next six months.',
      'We should celebrate this milestone achievement with the entire team.',
      "Let's ensure we have proper documentation for all the processes.",
      "I'll follow up with the vendor regarding the delivery timeline.",
      "We need to address the technical debt that's been accumulating.",
      'The market research indicates strong demand for this product category.',
      'I recommend we invest in additional training for the team members.',
      "Let's schedule regular check-ins to monitor progress on these initiatives.",
      'We should consider the long-term implications of this decision.',
    ]

    this.speakers = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']

    this.initializeElements()
    this.attachEventListeners()
    this.startFrameRateMonitoring()
  }

  initializeElements() {
    this.elements = {
      startBtn: document.getElementById('startBtn'),
      stopBtn: document.getElementById('stopBtn'),
      clearBtn: document.getElementById('clearBtn'),
      jumpBtn: document.getElementById('jumpBtn'),
      transcriptContainer: document.getElementById('transcriptContainer'),
      duration: document.getElementById('duration'),
      segmentCount: document.getElementById('segmentCount'),
      scrollPerf: document.getElementById('scrollPerf'),
      fps: document.getElementById('fps'),
      progress: document.getElementById('progress'),
      progressBar: document.getElementById('progressBar'),
      scrollEvents: document.getElementById('scrollEvents'),
      renderTime: document.getElementById('renderTime'),
      memoryUsage: document.getElementById('memoryUsage'),
      logContainer: document.getElementById('logContainer'),
      statusIndicator: document.getElementById('statusIndicator'),
    }
  }

  attachEventListeners() {
    this.elements.startBtn.addEventListener('click', () => this.startTest())
    this.elements.stopBtn.addEventListener('click', () => this.stopTest())
    this.elements.clearBtn.addEventListener('click', () => this.clearTranscripts())
    this.elements.jumpBtn.addEventListener('click', () => this.jumpToTime(300))

    // Monitor scroll events
    this.elements.transcriptContainer.addEventListener('scroll', () => {
      this.scrollEvents++
    })
  }

  startTest() {
    if (this.isRunning) return

    this.isRunning = true
    this.startTime = Date.now()
    this.segmentCount = 0
    this.scrollEvents = 0
    this.renderTimes = []
    this.frameRates = []

    this.elements.startBtn.disabled = true
    this.elements.stopBtn.disabled = false
    this.elements.statusIndicator.classList.remove('stopped')
    this.elements.statusIndicator.classList.add('running')

    this.clearTranscripts()
    this.log('Test started - simulating 10-minute meeting', 'success')

    // Add transcript segments every 2-3 seconds
    this.transcriptInterval = setInterval(
      () => {
        this.addTranscriptSegment()
      },
      this.getRandomInterval(2000, 3000)
    )

    // Update metrics every 100ms
    this.metricsInterval = setInterval(() => {
      this.updateMetrics()
    }, 100)

    // Update duration every second
    this.updateInterval = setInterval(() => {
      this.updateDuration()
    }, 1000)
  }

  stopTest() {
    if (!this.isRunning) return

    this.isRunning = false

    clearInterval(this.transcriptInterval)
    clearInterval(this.metricsInterval)
    clearInterval(this.updateInterval)

    this.elements.startBtn.disabled = false
    this.elements.stopBtn.disabled = true
    this.elements.statusIndicator.classList.remove('running')
    this.elements.statusIndicator.classList.add('stopped')

    const duration = (Date.now() - this.startTime) / 1000
    this.log(
      `Test stopped after ${duration.toFixed(1)}s - ${this.segmentCount} segments added`,
      'warning'
    )
    this.generateTestReport()
  }

  addTranscriptSegment() {
    const startRender = performance.now()

    const elapsed = (Date.now() - this.startTime) / 1000
    const text = this.sampleTexts[Math.floor(Math.random() * this.sampleTexts.length)]
    const speaker = this.speakers[Math.floor(Math.random() * this.speakers.length)]
    const confidence = 0.7 + Math.random() * 0.3 // 70-100%

    const segment = this.createSegmentElement(elapsed, speaker, text, confidence)
    this.elements.transcriptContainer.appendChild(segment)

    this.segmentCount++

    // Auto-scroll to bottom
    this.elements.transcriptContainer.scrollTop = this.elements.transcriptContainer.scrollHeight

    const renderTime = performance.now() - startRender
    this.renderTimes.push(renderTime)

    // Keep only last 100 render times
    if (this.renderTimes.length > 100) {
      this.renderTimes.shift()
    }

    // Check if we've reached 10 minutes
    if (elapsed >= this.testDuration) {
      this.stopTest()
      this.log('✅ 10-minute test completed successfully!', 'success')
    }
  }

  createSegmentElement(time, speaker, text, confidence) {
    const segment = document.createElement('div')
    segment.className = 'transcript-segment'

    const header = document.createElement('div')
    header.className = 'segment-header'

    const timeSpan = document.createElement('span')
    timeSpan.className = 'segment-time'
    timeSpan.textContent = this.formatTime(time)

    const speakerSpan = document.createElement('span')
    speakerSpan.className = 'segment-speaker'
    speakerSpan.textContent = `👤 ${speaker}`

    const confidenceSpan = document.createElement('span')
    confidenceSpan.className = `segment-confidence ${this.getConfidenceClass(confidence)}`
    confidenceSpan.textContent = `${(confidence * 100).toFixed(0)}%`

    header.appendChild(timeSpan)
    header.appendChild(speakerSpan)
    header.appendChild(confidenceSpan)

    const textDiv = document.createElement('div')
    textDiv.className = 'segment-text'
    textDiv.textContent = text

    segment.appendChild(header)
    segment.appendChild(textDiv)

    return segment
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  getConfidenceClass(confidence) {
    if (confidence >= 0.9) return 'high'
    if (confidence >= 0.7) return 'medium'
    return 'low'
  }

  getRandomInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  updateDuration() {
    if (!this.isRunning) return

    const elapsed = (Date.now() - this.startTime) / 1000
    this.elements.duration.textContent = this.formatTime(elapsed)

    // Update progress
    const progress = Math.min((elapsed / this.testDuration) * 100, 100)
    this.elements.progress.textContent = `${progress.toFixed(1)}%`
    this.elements.progressBar.style.width = `${progress}%`
  }

  updateMetrics() {
    if (!this.isRunning) return

    // Update segment count
    this.elements.segmentCount.textContent = this.segmentCount

    // Update scroll events per second
    const elapsed = (Date.now() - this.startTime) / 1000
    const scrollEventsPerSec = (this.scrollEvents / elapsed).toFixed(1)
    this.elements.scrollEvents.textContent = scrollEventsPerSec

    // Update average render time
    if (this.renderTimes.length > 0) {
      const avgRenderTime = this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length
      this.elements.renderTime.textContent = `${avgRenderTime.toFixed(2)}ms`

      // Update scroll performance indicator
      if (avgRenderTime < 5) {
        this.elements.scrollPerf.textContent = 'Excellent'
        this.elements.scrollPerf.className = 'stat-value good'
      } else if (avgRenderTime < 16) {
        this.elements.scrollPerf.textContent = 'Good'
        this.elements.scrollPerf.className = 'stat-value good'
      } else if (avgRenderTime < 33) {
        this.elements.scrollPerf.textContent = 'Fair'
        this.elements.scrollPerf.className = 'stat-value warning'
      } else {
        this.elements.scrollPerf.textContent = 'Poor'
        this.elements.scrollPerf.className = 'stat-value bad'
      }
    }

    // Update memory usage if available
    if (performance.memory) {
      const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)
      const totalMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1)
      this.elements.memoryUsage.textContent = `${usedMB} / ${totalMB} MB`
    }
  }

  startFrameRateMonitoring() {
    const measureFPS = () => {
      const now = performance.now()
      const delta = now - this.lastFrameTime
      const fps = 1000 / delta

      this.frameRates.push(fps)
      if (this.frameRates.length > 60) {
        this.frameRates.shift()
      }

      if (this.isRunning && this.frameRates.length > 0) {
        const avgFPS = this.frameRates.reduce((a, b) => a + b, 0) / this.frameRates.length
        this.elements.fps.textContent = `${avgFPS.toFixed(0)} FPS`

        if (avgFPS >= 55) {
          this.elements.fps.className = 'stat-value good'
        } else if (avgFPS >= 30) {
          this.elements.fps.className = 'stat-value warning'
        } else {
          this.elements.fps.className = 'stat-value bad'
        }
      }

      this.lastFrameTime = now
      requestAnimationFrame(measureFPS)
    }

    requestAnimationFrame(measureFPS)
  }

  clearTranscripts() {
    this.elements.transcriptContainer.innerHTML = ''
    this.segmentCount = 0
    this.scrollEvents = 0
    this.renderTimes = []
    this.elements.segmentCount.textContent = '0'
    this.log('Transcripts cleared', 'success')
  }

  jumpToTime(seconds) {
    if (!this.isRunning) {
      this.log('Start the test first before jumping to a time', 'warning')
      return
    }

    const targetSegments = Math.floor(seconds / 2.5) // Approximate segments for given time
    const currentSegments = this.segmentCount

    if (currentSegments >= targetSegments) {
      this.log(`Already past ${this.formatTime(seconds)}`, 'warning')
      return
    }

    this.log(`Fast-forwarding to ${this.formatTime(seconds)}...`, 'success')

    // Add segments rapidly to simulate time jump
    const segmentsToAdd = targetSegments - currentSegments
    for (let i = 0; i < segmentsToAdd; i++) {
      setTimeout(() => {
        this.addTranscriptSegment()
      }, i * 50) // Add one every 50ms
    }
  }

  log(message, type = 'info') {
    const entry = document.createElement('div')
    entry.className = `log-entry
 ${type}`
    const timestamp = new Date().toLocaleTimeString()
    entry.textContent = `[${timestamp}] ${message}`

    this.elements.logContainer.appendChild(entry)
    this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight

    // Keep only last 50 log entries
    while (this.elements.logContainer.children.length > 50) {
      this.elements.logContainer.removeChild(this.elements.logContainer.firstChild)
    }
  }

  generateTestReport() {
    const elapsed = (Date.now() - this.startTime) / 1000
    const avgRenderTime =
      this.renderTimes.length > 0
        ? this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length
        : 0
    const avgFPS =
      this.frameRates.length > 0
        ? this.frameRates.reduce((a, b) => a + b, 0) / this.frameRates.length
        : 0

    console.log('\n=== SMOOTH SCROLLING TEST REPORT ===')
    console.log(`Test Duration: ${elapsed.toFixed(1)}s / ${this.testDuration}s`)
    console.log(`Segments Added: ${this.segmentCount}`)
    console.log(`Average Render Time: ${avgRenderTime.toFixed(2)}ms`)
    console.log(`Average Frame Rate: ${avgFPS.toFixed(1)} FPS`)
    console.log(`Scroll Events: ${this.scrollEvents}`)
    console.log(`Scroll Events/sec: ${(this.scrollEvents / elapsed).toFixed(2)}`)

    if (performance.memory) {
      console.log(`Memory Used: ${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`)
    }

    console.log('\n=== PERFORMANCE ASSESSMENT ===')

    const assessments = []

    // Render time assessment
    if (avgRenderTime < 16) {
      assessments.push('✅ Render time excellent (<16ms, 60 FPS capable)')
    } else if (avgRenderTime < 33) {
      assessments.push('⚠️ Render time acceptable (16-33ms, 30-60 FPS)')
    } else {
      assessments.push('❌ Render time poor (>33ms, <30 FPS)')
    }

    // Frame rate assessment
    if (avgFPS >= 55) {
      assessments.push('✅ Frame rate excellent (≥55 FPS)')
    } else if (avgFPS >= 30) {
      assessments.push('⚠️ Frame rate acceptable (30-55 FPS)')
    } else {
      assessments.push('❌ Frame rate poor (<30 FPS)')
    }

    // Segment count assessment
    if (this.segmentCount >= 200) {
      assessments.push('✅ Segment count target met (≥200 segments)')
    } else {
      assessments.push(`⚠️ Segment count below target (${this.segmentCount}/200)`)
    }

    // Duration assessment
    if (elapsed >= this.testDuration * 0.9) {
      assessments.push('✅ Test duration target met (≥9 minutes)')
    } else {
      assessments.push(`⚠️ Test stopped early (${elapsed.toFixed(0)}s/${this.testDuration}s)`)
    }

    assessments.forEach(assessment => console.log(assessment))

    // Overall verdict
    const hasIssues = assessments.some(a => a.includes('❌'))
    const hasWarnings = assessments.some(a => a.includes('⚠️'))

    console.log('\n=== OVERALL VERDICT ===')
    if (!hasIssues && !hasWarnings) {
      console.log('✅ PASS - Smooth scrolling works perfectly!')
      this.log('✅ TEST PASSED - Smooth scrolling verified!', 'success')
    } else if (!hasIssues) {
      console.log('⚠️ PASS WITH WARNINGS - Minor performance issues detected')
      this.log('⚠️ TEST PASSED - Minor issues detected', 'warning')
    } else {
      console.log('❌ FAIL - Significant performance issues detected')
      this.log('❌ TEST FAILED - Performance issues detected', 'error')
    }

    console.log('=====================================\n')

    // Log summary to UI
    this.log(
      `Test completed: ${this.segmentCount} segments, ${avgRenderTime.toFixed(2)}ms avg render`,
      'success'
    )
  }
}

// Initialize test when page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 Task 18.5: Smooth Scrolling Test Initialized')
  console.log('This test simulates a 10-minute meeting with 200+ transcript segments')
  console.log('Click "Start 10-Minute Test" to begin\n')

  new SmoothScrollingTest()
})
