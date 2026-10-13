import React, { useState, useEffect, useRef } from 'react'
import { LoudnessRadar } from './LoudnessRadar'
import { PhaseScope } from './PhaseScope'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Mic, Radio } from 'lucide-react'

export const AudioStudioDiagnostics: React.FC = () => {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isCapturing, setIsCapturing] = useState<boolean>(false)
  const [activeSource, setActiveSource] = useState<'mic' | 'system' | 'tone'>('mic')
  const [error, setError] = useState<string | null>(null)
  const oscCtxRef = useRef<AudioContext | null>(null)
  // The live stream, readable from the unmount cleanup (state there is stale)
  const streamRef = useRef<MediaStream | null>(null)
  // Bumped by every start/stop so a getUserMedia() that resolves late is discarded
  const requestIdRef = useRef(0)

  const startStream = async (sourceType: 'mic' | 'system' | 'tone') => {
    stopStream()
    const requestId = ++requestIdRef.current
    setError(null)

    if (sourceType === 'tone') {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AudioCtx({ sampleRate: 48000 })
        oscCtxRef.current = ctx

        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, ctx.currentTime) // 440Hz Concert A

        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.2, ctx.currentTime) // -14 LUFS equivalent gain

        const dest = ctx.createMediaStreamDestination()
        osc.connect(gain)
        gain.connect(dest)
        osc.start()

        streamRef.current = dest.stream
        setStream(dest.stream)
        setIsCapturing(true)
        setActiveSource('tone')
      } catch (err) {
        setError(
          `Failed to generate test tone: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      return
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2,
        },
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      if (requestId !== requestIdRef.current) {
        // Stopped, switched source or left Settings while the permission
        // prompt was open — don't leave the microphone running.
        mediaStream.getTracks().forEach(t => t.stop())
        return
      }
      streamRef.current = mediaStream
      setStream(mediaStream)
      setIsCapturing(true)
      setActiveSource(sourceType)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(
        `Audio access failed: ${err instanceof Error ? err.message : String(err)}. Please grant microphone permission.`
      )
    }
  }

  const stopStream = () => {
    requestIdRef.current++
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setStream(null)
    if (oscCtxRef.current && oscCtxRef.current.state !== 'closed') {
      oscCtxRef.current.close().catch(() => {})
      oscCtxRef.current = null
    }
    setIsCapturing(false)
  }

  // The microphone is opened only when the user asks for it (never just by
  // visiting Settings) and is always released when the panel goes away.
  useEffect(() => {
    return () => {
      // These refs hold plain values (not DOM nodes): reading them at cleanup
      // time is exactly what is wanted — the *current* stream must be stopped.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestIdRef.current++
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (oscCtxRef.current && oscCtxRef.current.state !== 'closed') {
        oscCtxRef.current.close().catch(() => {})
        oscCtxRef.current = null
      }
    }
  }, [])

  return (
    <div className="flex flex-col gap-8">
      {/* Header & Source Control */}
      <div>
        <div className="flex items-center justify-between pl-4 mb-3">
          <h4 className="text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
            Studio Calibration & DSP Analysis
          </h4>
          <Badge variant={isCapturing ? 'success' : 'outline'}>
            {isCapturing ? (activeSource === 'tone' ? 'Test tone' : 'Microphone live') : 'Off'}
          </Badge>
        </div>

        <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Button
                variant={activeSource === 'mic' && isCapturing ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => startStream('mic')}
              >
                <Mic size={14} className="mr-1.5" />
                Live Microphone
              </Button>
              <Button
                variant={activeSource === 'tone' && isCapturing ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => startStream('tone')}
              >
                <Radio size={14} className="mr-1.5" />
                440Hz Test Tone
              </Button>
              {isCapturing && (
                <Button variant="danger" size="sm" onClick={stopStream}>
                  Stop
                </Button>
              )}
            </div>

            <div className="text-xs text-white/50">
              {isCapturing
                ? 'Level preview only — nothing is recorded or saved.'
                : 'Start the microphone or a test tone to check your input levels.'}
            </div>
          </div>

          {error && (
            <div className="p-3 mb-5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}

          {/* Metering Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <LoudnessRadar stream={stream} isActive={isCapturing} targetLufs={-14.0} />
            </div>
            <div className="lg:col-span-1">
              <PhaseScope stream={stream} isActive={isCapturing} width={220} height={220} />
            </div>
          </div>

          {/* DSP Specifications Footer */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] grid grid-cols-3 gap-4 text-center">
            <div>
              <span className="text-[10px] uppercase font-mono text-white/40">Target Loudness</span>
              <p className="text-sm font-semibold text-emerald-400 font-mono">-14.0 LUFS</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-white/40">
                True-Peak Ceiling
              </span>
              <p className="text-sm font-semibold text-white font-mono">-1.0 dBTP</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-white/40">
                Phase Correlation
              </span>
              <p className="text-sm font-semibold text-violet-400 font-mono">
                ρ ≥ 0.75 (Stereo Invariant)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
