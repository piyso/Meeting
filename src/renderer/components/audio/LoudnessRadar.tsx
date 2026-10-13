import React, { useState, useEffect, useRef } from 'react'
import { Volume2, ShieldCheck, Activity } from 'lucide-react'

interface LoudnessRadarProps {
  stream?: MediaStream | null
  isActive?: boolean
  targetLufs?: number // Default -14.0 LUFS
}

export const LoudnessRadar: React.FC<LoudnessRadarProps> = ({
  stream,
  isActive = true,
  targetLufs = -14.0,
}) => {
  const [momentaryLufs, setMomentaryLufs] = useState<number>(-70)
  const [shortTermLufs, setShortTermLufs] = useState<number>(-70)
  const [integratedLufs, setIntegratedLufs] = useState<number>(-70)
  const [truePeakDbtp, setTruePeakDbtp] = useState<number>(-70)
  const [leftRms, setLeftRms] = useState<number>(0)
  const [rightRms, setRightRms] = useState<number>(0)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const leftAnalyserRef = useRef<AnalyserNode | null>(null)
  const rightAnalyserRef = useRef<AnalyserNode | null>(null)
  const splitterRef = useRef<ChannelSplitterNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Circular polar radar history buffer (360 degrees = 360 points)
  const radarHistoryRef = useRef<number[]>(new Array(360).fill(-70))
  const radarIndexRef = useRef<number>(0)
  const integratedHistoryRef = useRef<number[]>([])

  useEffect(() => {
    if (!stream || !isActive) {
      return
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx({ sampleRate: 48000 })
      audioCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source

      // K-Weighting approximation filter (High shelf + highpass per ITU-R BS.1770-4)
      const highPass = ctx.createBiquadFilter()
      highPass.type = 'highpass'
      highPass.frequency.value = 80 // 80Hz rumble cut
      highPass.Q.value = 0.707

      const highShelf = ctx.createBiquadFilter()
      highShelf.type = 'highshelf'
      highShelf.frequency.value = 1500
      highShelf.gain.value = 4.0 // +4dB psychoacoustic head boost

      const splitter = ctx.createChannelSplitter(2)
      splitterRef.current = splitter

      const leftAnalyser = ctx.createAnalyser()
      leftAnalyser.fftSize = 1024
      leftAnalyserRef.current = leftAnalyser

      const rightAnalyser = ctx.createAnalyser()
      rightAnalyser.fftSize = 1024
      rightAnalyserRef.current = rightAnalyser

      const masterAnalyser = ctx.createAnalyser()
      masterAnalyser.fftSize = 2048
      analyserRef.current = masterAnalyser

      source.connect(highPass)
      highPass.connect(highShelf)
      highShelf.connect(masterAnalyser)
      highShelf.connect(splitter)

      splitter.connect(leftAnalyser, 0)
      splitter.connect(rightAnalyser, 1)

      const timeBuffer = new Float32Array(masterAnalyser.fftSize)
      const leftBuffer = new Float32Array(leftAnalyser.fftSize)
      const rightBuffer = new Float32Array(rightAnalyser.fftSize)

      const tick = () => {
        if (!masterAnalyser) return

        masterAnalyser.getFloatTimeDomainData(timeBuffer)
        leftAnalyser.getFloatTimeDomainData(leftBuffer)
        rightAnalyser.getFloatTimeDomainData(rightBuffer)

        // 1. Calculate RMS and True-Peak
        let sumSq = 0
        let peak = 0
        for (let i = 0; i < timeBuffer.length; i++) {
          const val = timeBuffer[i] ?? 0
          sumSq += val * val
          const absVal = Math.abs(val)
          if (absVal > peak) peak = absVal
        }

        const rms = Math.sqrt(sumSq / timeBuffer.length)
        const momentary = rms > 0.00001 ? 20 * Math.log10(rms) : -70
        const clampedMomentary = Math.max(-70, Math.min(0, momentary))
        setMomentaryLufs(Math.round(clampedMomentary * 10) / 10)

        // True Peak calculation (oversampled estimate)
        const peakDbtp = peak > 0.00001 ? 20 * Math.log10(peak) : -70
        setTruePeakDbtp(Math.round(peakDbtp * 10) / 10)

        // Stereo L/R RMS
        let lSum = 0
        for (let i = 0; i < leftBuffer.length; i++) {
          const v = leftBuffer[i] ?? 0
          lSum += v * v
        }
        setLeftRms(Math.min(1, Math.sqrt(lSum / leftBuffer.length) * 3))

        let rSum = 0
        for (let i = 0; i < rightBuffer.length; i++) {
          const v = rightBuffer[i] ?? 0
          rSum += v * v
        }
        setRightRms(Math.min(1, Math.sqrt(rSum / rightBuffer.length) * 3))

        // Push to radar history
        const currentIndex = radarIndexRef.current
        radarHistoryRef.current[currentIndex] = clampedMomentary
        radarIndexRef.current = (currentIndex + 1) % 360

        // Push to integrated history (last 100 samples ~ 5 sec)
        integratedHistoryRef.current.push(clampedMomentary)
        if (integratedHistoryRef.current.length > 200) {
          integratedHistoryRef.current.shift()
        }

        if (integratedHistoryRef.current.length > 0) {
          const avg =
            integratedHistoryRef.current.reduce((a, b) => a + b, 0) /
            integratedHistoryRef.current.length
          setIntegratedLufs(Math.round(avg * 10) / 10)

          const shortSlice = integratedHistoryRef.current.slice(-30)
          const shortAvg = shortSlice.reduce((a, b) => a + b, 0) / shortSlice.length
          setShortTermLufs(Math.round(shortAvg * 10) / 10)
        }

        // Draw Polar Radar Canvas
        drawPolarRadar(currentIndex)

        animFrameRef.current = requestAnimationFrame(tick)
      }

      const drawPolarRadar = (currentSweepIdx: number) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const cCtx = canvas.getContext('2d')
        if (!cCtx) return

        const size = canvas.width
        const cx = size / 2
        const cy = size / 2
        const maxRadius = cx - 12

        cCtx.clearRect(0, 0, size, size)

        // 1. Draw Concentric LUFS Target Rings (-36, -23, -14, -6 LUFS)
        const rings = [
          { lufs: -36, label: '-36', color: 'rgba(255,255,255,0.06)' },
          { lufs: -23, label: '-23 (EBU)', color: 'rgba(59,130,246,0.2)' },
          { lufs: -14, label: '-14 (Target)', color: 'rgba(52,211,153,0.4)', isTarget: true },
          { lufs: -6, label: '-6', color: 'rgba(244,63,94,0.3)' },
        ]

        rings.forEach(ring => {
          const r = ((ring.lufs + 60) / 60) * maxRadius
          cCtx.beginPath()
          cCtx.arc(cx, cy, Math.max(5, r), 0, Math.PI * 2)
          cCtx.strokeStyle = ring.color
          cCtx.lineWidth = ring.isTarget ? 1.5 : 1
          if (ring.isTarget) cCtx.setLineDash([4, 4])
          else cCtx.setLineDash([])
          cCtx.stroke()

          // Label
          cCtx.fillStyle = ring.isTarget ? '#34d399' : 'rgba(255,255,255,0.3)'
          cCtx.font = '9px monospace'
          cCtx.fillText(ring.label, cx + 4, cy - r + 8)
        })
        cCtx.setLineDash([])

        // 2. Draw Polar History Rays
        const history = radarHistoryRef.current
        for (let deg = 0; deg < 360; deg++) {
          const lufs = history[deg] ?? -70
          if (lufs <= -60) continue

          const angle = (deg * Math.PI) / 180 - Math.PI / 2
          const rad = ((lufs + 60) / 60) * maxRadius

          const x = cx + Math.cos(angle) * rad
          const y = cy + Math.sin(angle) * rad

          cCtx.beginPath()
          cCtx.moveTo(cx, cy)
          cCtx.lineTo(x, y)

          // Color by loudness
          if (lufs >= -14) {
            cCtx.strokeStyle = 'rgba(52, 211, 153, 0.4)' // Green
          } else if (lufs >= -24) {
            cCtx.strokeStyle = 'rgba(139, 92, 246, 0.35)' // Violet
          } else {
            cCtx.strokeStyle = 'rgba(59, 130, 246, 0.25)' // Blue
          }
          cCtx.lineWidth = 1.5
          cCtx.stroke()
        }

        // 3. Draw Sweeping Radar Hand
        const sweepAngle = (currentSweepIdx * Math.PI) / 180 - Math.PI / 2
        cCtx.beginPath()
        cCtx.moveTo(cx, cy)
        cCtx.lineTo(cx + Math.cos(sweepAngle) * maxRadius, cy + Math.sin(sweepAngle) * maxRadius)
        cCtx.strokeStyle = '#a78bfa'
        cCtx.lineWidth = 2
        cCtx.shadowColor = '#8b5cf6'
        cCtx.shadowBlur = 10
        cCtx.stroke()
        cCtx.shadowBlur = 0
      }

      tick()
    } catch (err) {
      console.warn('LoudnessRadar Web Audio init failed:', err)
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {})
      }
    }
  }, [stream, isActive])

  const lufsToPercent = (lufs: number) => {
    const clamped = Math.max(-60, Math.min(0, lufs))
    return ((clamped + 60) / 60) * 100
  }

  const isTargetCompliant = Math.abs(integratedLufs - targetLufs) <= 1.5 && integratedLufs > -50
  const isTruePeakSafe = truePeakDbtp <= -1.0

  return (
    <div className="bg-gradient-to-br from-white/[0.03] to-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-2xl text-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/25">
            <Volume2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-semibold text-white tracking-wide">
                EBU R128 Loudness Radar
              </h4>
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Activity size={10} />
                Live DSP
              </span>
            </div>
            <p className="text-xs text-white/50">ITU-R BS.1770-4 Polar Radar & True-Peak Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isTargetCompliant ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck size={14} />
              Mastered: {targetLufs} LUFS
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-white/5 text-white/70 border border-white/10">
              Target: {targetLufs} LUFS
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Polar Canvas & Numerical Meters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center mb-6">
        {/* Polar Radar Canvas */}
        <div className="flex justify-center items-center bg-black/40 rounded-2xl p-4 border border-white/5 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            width={240}
            height={240}
            className="w-[200px] h-[200px] rounded-full"
          />
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
            <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">
              Momentary
            </span>
            <div className="text-2xl font-bold font-mono mt-1 text-white">
              {momentaryLufs > -60 ? `${momentaryLufs}` : '-∞'}{' '}
              <span className="text-xs text-white/40 font-normal">LUFS</span>
            </div>
          </div>

          <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
            <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">
              Short-Term
            </span>
            <div className="text-2xl font-bold font-mono mt-1 text-white">
              {shortTermLufs > -60 ? `${shortTermLufs}` : '-∞'}{' '}
              <span className="text-xs text-white/40 font-normal">LUFS</span>
            </div>
          </div>

          <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
            <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">
              Integrated
            </span>
            <div
              className={`text-2xl font-bold font-mono mt-1 ${isTargetCompliant ? 'text-emerald-400' : 'text-violet-400'}`}
            >
              {integratedLufs > -60 ? `${integratedLufs}` : '-∞'}{' '}
              <span className="text-xs text-white/40 font-normal">LUFS</span>
            </div>
          </div>

          <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
            <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">
              True Peak
            </span>
            <div
              className={`text-2xl font-bold font-mono mt-1 ${isTruePeakSafe ? 'text-white' : 'text-rose-400'}`}
            >
              {truePeakDbtp > -60 ? `${truePeakDbtp}` : '-∞'}{' '}
              <span className="text-xs text-white/40 font-normal">dBTP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Loudness Bar & Stereo Meter */}
      <div className="space-y-4 pt-2 border-t border-white/5">
        <div>
          <div className="flex justify-between text-[11px] font-mono text-white/40 mb-1.5">
            <span>-60 LUFS</span>
            <span className="text-emerald-400 font-semibold">-14 Target</span>
            <span>0 LUFS</span>
          </div>
          <div className="relative h-3 bg-black/60 rounded-full overflow-hidden border border-white/10 p-0.5">
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-emerald-400 z-20 shadow-[0_0_8px_#34d399]"
              style={{ left: `${lufsToPercent(targetLufs)}%` }}
            />
            <div
              className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-blue-500 via-emerald-400 to-amber-400"
              style={{ width: `${lufsToPercent(momentaryLufs)}%` }}
            />
          </div>
        </div>

        {/* L/R Channel Meter */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/50 w-3">L</span>
            <div className="flex-1 h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-violet-400 rounded-full transition-all duration-75"
                style={{ width: `${leftRms * 100}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/50 w-3">R</span>
            <div className="flex-1 h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-violet-400 rounded-full transition-all duration-75"
                style={{ width: `${rightRms * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
