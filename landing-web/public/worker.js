/**
 * Web Worker for Off-Main-Thread Metrics Computation
 *
 * Runs the Impossible Metric counter logic entirely separated
 * from the UI thread, ensuring 120 FPS scrolling regardless of math load.
 */

self.onmessage = function (e) {
  const { id, targetValue, duration, frameRate, decimals } = e.data

  const startValue = 0
  const totalFrames = Math.round(duration / frameRate)
  let currentFrame = 0

  const easeOutQuad = t => t * (2 - t)

  function compute() {
    currentFrame++
    const progress = easeOutQuad(currentFrame / totalFrames)
    const currentValue = startValue + (targetValue - startValue) * progress

    if (currentFrame < totalFrames) {
      self.postMessage({ id, value: currentValue.toFixed(decimals), done: false })

      // Simulate rAF in worker using strict timeouts based on frameRate (16ms)
      setTimeout(compute, frameRate)
    } else {
      self.postMessage({ id, value: targetValue.toFixed(decimals), done: true })
    }
  }

  compute()
}
