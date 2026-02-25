let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let animationId = 0
let isRecording = false
let currentLevel = 0

const numBars = 5
const barWidth = 3
const gap = 2
let startX = 0
let centerY = 0

const currentHeights = new Array(numBars).fill(4)

function draw() {
  if (!ctx || !canvas) return
  
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  const targetHeight = isRecording 
    ? Math.max(4, currentLevel * 28) 
    : 4 + Math.sin(Date.now() / 500) * 1
    
  for (let i = 0; i < numBars; i++) {
    const offset = Math.sin(Date.now() / 200 + i) * (isRecording ? 4 : 0)
    const specificTarget = Math.max(4, targetHeight + offset)
    
    currentHeights[i] += (specificTarget - currentHeights[i]) * 0.2
    const h = currentHeights[i]
    
    ctx.fillStyle = isRecording ? '#10b981' : '#6b7280'
    ctx.beginPath()
    ctx.roundRect(startX + (i * (barWidth + gap)), centerY - h/2, barWidth, h, 2)
    ctx.fill()
  }
  
  animationId = requestAnimationFrame(draw)
}

self.onmessage = (e) => {
  if (e.data.type === 'init') {
    canvas = e.data.canvas
    ctx = canvas!.getContext('2d')
    const totalWidth = (numBars * barWidth) + ((numBars - 1) * gap)
    startX = (canvas!.width - totalWidth) / 2
    centerY = canvas!.height / 2
    draw()
  } else if (e.data.type === 'update') {
    isRecording = e.data.isRecording
    currentLevel = e.data.audioLevel
  }
}
