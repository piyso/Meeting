import React, { useState, useEffect, useRef } from 'react'
import { Disc, ShieldAlert, CheckCircle2 } from 'lucide-react'

interface PhaseScopeProps {
  stream?: MediaStream | null
  isActive?: boolean
  width?: number
  height?: number
}

export const PhaseScope: React.FC<PhaseScopeProps> = ({
  stream,
  isActive = true,
  width = 220,
  height = 220,
}) => {
  const [correlation, setCorrelation] = useState<number>(1.0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!stream || !isActive || !canvasRef.current) return

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx({ sampleRate: 48000 })
      audioCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const splitter = ctx.createChannelSplitter(2)

      const leftAnalyser = ctx.createAnalyser()
      leftAnalyser.fftSize = 512
      const rightAnalyser = ctx.createAnalyser()
      rightAnalyser.fftSize = 512

      source.connect(splitter)
      splitter.connect(leftAnalyser, 0)
      splitter.connect(rightAnalyser, 1)

      const leftData = new Float32Array(leftAnalyser.fftSize)
      const rightData = new Float32Array(rightAnalyser.fftSize)

      const canvas = canvasRef.current
      const cCtx = canvas.getContext('2d')

      const draw = () => {
        if (!cCtx || !canvas) return

        leftAnalyser.getFloatTimeDomainData(leftData)
        rightAnalyser.getFloatTimeDomainData(rightData)

        // Compute Pearson correlation coefficient rho:
        // rho = sum(L * R) / sqrt(sum(L^2) * sum(R^2))
        let dotProduct = 0
        let sumSqL = 0
        let sumSqR = 0

        const len = leftData.length
        for (let i = 0; i < len; i++) {
          const l = leftData[i] ?? 0
          const r = rightData[i] ?? 0
          dotProduct += l * r
          sumSqL += l * l
          sumSqR += r * r
        }

        const denom = Math.sqrt(sumSqL * sumSqR)
        const rho = denom > 0.00001 ? dotProduct / denom : 1.0
        setCorrelation(Math.round(rho * 100) / 100)

        // Clear canvas with trail
        cCtx.fillStyle = 'rgba(10, 10, 15, 0.25)'
        cCtx.fillRect(0, 0, width, height)

        // Draw crosshairs
        const cx = width / 2
        const cy = height / 2
        cCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        cCtx.lineWidth = 1

        cCtx.beginPath()
        cCtx.moveTo(cx, 0)
        cCtx.lineTo(cx, height)
        cCtx.moveTo(0, cy)
        cCtx.lineTo(width, cy)
        cCtx.stroke()

        // Draw 45-degree M/S guidelines (Mid = L+R, Side = L-R)
        cCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
        cCtx.beginPath()
        cCtx.moveTo(0, height)
        cCtx.lineTo(width, 0)
        cCtx.moveTo(0, 0)
        cCtx.lineTo(width, height)
        cCtx.stroke()

        // Lissajous Phase plot (L+R on Y, L-R on X rotated 45 deg)
        cCtx.lineWidth = 1.5
        cCtx.strokeStyle =
          rho >= 0.75
            ? 'rgba(52, 211, 153, 0.8)' // Green mono compatible
            : rho >= 0
              ? 'rgba(251, 191, 36, 0.8)' // Amber wide stereo
              : 'rgba(244, 63, 94, 0.9)' // Red phase cancellation

        cCtx.beginPath()
        for (let i = 0; i < len; i += 2) {
          const l = (leftData[i] ?? 0) * (width * 0.45)
          const r = (rightData[i] ?? 0) * (height * 0.45)

          // Rotate 45 degrees: Mid = (L+R)/sqrt(2), Side = (L-R)/sqrt(2)
          const x = cx + (l - r) * 0.7071
          const y = cy - (l + r) * 0.7071

          if (i === 0) cCtx.moveTo(x, y)
          else cCtx.lineTo(x, y)
        }
        cCtx.stroke()

        animFrameRef.current = requestAnimationFrame(draw)
      }

      draw()
    } catch (err) {
      console.warn('PhaseScope init failed:', err)
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {})
      }
    }
  }, [stream, isActive, width, height])

  const isMonoCompatible = correlation >= 0.75

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] rounded-2xl p-5 backdrop-blur-xl text-white flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[rgba(16,185,129,0.15)] flex items-center justify-center text-emerald-400">
            <Disc size={16} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white tracking-wide">
              Lissajous Phase Scope
            </h4>
            <span className="text-[10px] text-white/50">Stereo Correlation & Mono Guard</span>
          </div>
        </div>

        <div>
          {isMonoCompatible ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[rgba(16,185,129,0.12)] text-emerald-400 border border-[rgba(16,185,129,0.25)]">
              <CheckCircle2 size={11} />ρ = {correlation}
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[rgba(244,63,94,0.12)] text-rose-400 border border-[rgba(244,63,94,0.25)]">
              <ShieldAlert size={11} />ρ = {correlation}
            </span>
          )}
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-inner bg-black/60">
        <canvas ref={canvasRef} width={width} height={height} className="block" />
        <div className="absolute top-2 left-2 text-[9px] font-mono text-white/30">SIDE -</div>
        <div className="absolute top-2 right-2 text-[9px] font-mono text-white/30">SIDE +</div>
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-white/30">
          MID +
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-white/30">
          MID -
        </div>
      </div>

      <div className="w-full mt-3 flex items-center justify-between text-[11px]">
        <span className="text-white/40 font-mono">-1.0 (Out of Phase)</span>
        <span className="text-white/40 font-mono">0.0</span>
        <span className="text-emerald-400 font-mono">+1.0 (Mono)</span>
      </div>
      <div className="w-full h-1.5 bg-black/50 rounded-full mt-1 overflow-hidden relative border border-white/5">
        <div
          className="absolute top-0 bottom-0 w-2 rounded-full transition-all duration-75"
          style={{
            left: `${((correlation + 1) / 2) * 100}%`,
            backgroundColor: isMonoCompatible ? '#34d399' : '#f43f5e',
            transform: 'translateX(-50%)',
          }}
        />
      </div>
    </div>
  )
}
