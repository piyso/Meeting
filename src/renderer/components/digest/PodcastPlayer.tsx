import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Play, Pause, RotateCcw, Download, Copy, Check, Volume2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface PodcastPlayerProps {
  script: string
  ssmlScript?: string
  weekRange: string
  meetingCount: number
  totalHours: number
}

export const PodcastPlayer: React.FC<PodcastPlayerProps> = ({
  script,
  weekRange,
  meetingCount,
  totalHours,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0)
  const [progress, setProgress] = useState<number>(0)
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0)
  const [copied, setCopied] = useState<boolean>(false)
  const [hoverTimeSec, setHoverTimeSec] = useState<number | null>(null)

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0)
  const waveformRef = useRef<HTMLDivElement | null>(null)

  const sentences = useMemo(() => {
    return script
      .split(/(?<=[.?!])\s+/)
      .map(s => s.trim())
      .filter(Boolean)
  }, [script])

  const totalDurationSec = Math.max(15, Math.ceil(script.length / (14.5 * playbackSpeed)))

  const currentSentenceIdx = Math.min(
    sentences.length - 1,
    Math.floor((progress / 100) * sentences.length)
  )

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  const startPlayback = () => {
    if (!window.speechSynthesis) return

    window.speechSynthesis.cancel()

    const utter = new SpeechSynthesisUtterance(script)
    utter.rate = playbackSpeed
    utter.pitch = 1.0

    const voices = window.speechSynthesis.getVoices()
    const premiumVoice = voices.find(
      v =>
        (v.name.includes('Natural') ||
          v.name.includes('Siri') ||
          v.name.includes('Samantha') ||
          v.name.includes('Google') ||
          v.name.includes('Daniel') ||
          v.name.includes('Karen')) &&
        v.lang.startsWith('en')
    )
    if (premiumVoice) utter.voice = premiumVoice

    utter.onstart = () => {
      setIsPlaying(true)
      startTimeRef.current = Date.now() - pausedTimeRef.current
      trackProgress()
    }

    utter.onend = () => {
      setIsPlaying(false)
      setProgress(100)
      setCurrentTimeSec(totalDurationSec)
      pausedTimeRef.current = 0
    }

    utter.onerror = () => {
      setIsPlaying(false)
    }

    utteranceRef.current = utter
    window.speechSynthesis.speak(utter)
  }

  const togglePlay = () => {
    if (isPlaying) {
      if (window.speechSynthesis) window.speechSynthesis.pause()
      setIsPlaying(false)
      pausedTimeRef.current = Date.now() - startTimeRef.current
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    } else {
      if (window.speechSynthesis && window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
        setIsPlaying(true)
        startTimeRef.current = Date.now() - pausedTimeRef.current
        trackProgress()
      } else {
        startPlayback()
      }
    }
  }

  const restartPlayback = () => {
    pausedTimeRef.current = 0
    setProgress(0)
    setCurrentTimeSec(0)
    startPlayback()
  }

  const trackProgress = () => {
    const elapsedMs = Date.now() - startTimeRef.current
    const elapsedSec = elapsedMs / 1000
    const calculatedDuration = totalDurationSec

    if (elapsedSec <= calculatedDuration) {
      setCurrentTimeSec(Math.min(calculatedDuration, Math.floor(elapsedSec)))
      setProgress(Math.min(100, (elapsedSec / calculatedDuration) * 100))
      animFrameRef.current = requestAnimationFrame(trackProgress)
    } else {
      setIsPlaying(false)
      setProgress(100)
      setCurrentTimeSec(calculatedDuration)
    }
  }

  const changeSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0]
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
    const nextSpeed = speeds[nextIdx] ?? 1.0
    setPlaybackSpeed(nextSpeed)

    if (isPlaying) {
      pausedTimeRef.current = Date.now() - startTimeRef.current
      startPlayback()
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return
    const rect = waveformRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, clickX / rect.width))
    const seekSec = percent * totalDurationSec

    setCurrentTimeSec(Math.floor(seekSec))
    setProgress(percent * 100)
    pausedTimeRef.current = seekSec * 1000

    if (isPlaying) {
      startPlayback()
    }
  }

  const handleWaveformMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return
    const rect = waveformRef.current.getBoundingClientRect()
    const hoverX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, hoverX / rect.width))
    setHoverTimeSec(Math.floor(percent * totalDurationSec))
  }

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      useAppStore.getState().addToast({
        type: 'success',
        title: 'Script Copied',
        message: 'Briefing transcript copied to clipboard.',
        duration: 2000,
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const downloadScript = () => {
    const blob = new Blob([script], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bluearkive-briefing-${weekRange.replace(/[^a-zA-Z0-9]/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 36 compact waveform bar heights
  const waveformBars = useMemo(() => {
    return Array.from({ length: 36 }).map((_, i) => {
      const base = Math.sin(i * 0.45) * 5 + Math.cos(i * 0.8) * 3 + 8
      return Math.max(3, Math.min(14, Math.round(base)))
    })
  }, [])

  return (
    <div className="flex flex-col gap-1.5 mb-4">
      {/* 42px Slim Single-Row Media Strip */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[rgba(18,18,24,0.6)] border border-white/[0.04] backdrop-blur-xl hover:border-white/[0.08] transition-all shadow-sm">
        {/* Left: Play/Pause Button & Title */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={togglePlay}
            className="w-7 h-7 rounded-full bg-white text-black hover:bg-zinc-200 flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={12} fill="currentColor" />
            ) : (
              <Play size={12} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <div
            className="flex items-center gap-1.5 text-xs font-medium text-white/90"
            title={`Briefing for ${weekRange}: ${meetingCount} meetings, ${totalHours}h synthesized`}
          >
            <Volume2 size={13} className="text-violet-400" />
            <span>Spoken Briefing</span>
            <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
              ({formatTime(totalDurationSec)})
            </span>
          </div>
        </div>

        {/* Center: Interactive Waveform Scrubber */}
        <div
          ref={waveformRef}
          onClick={handleWaveformClick}
          onMouseMove={handleWaveformMouseMove}
          onMouseLeave={() => setHoverTimeSec(null)}
          className="relative flex-1 max-w-sm h-6 flex items-center justify-between gap-[2px] px-2 bg-black/20 hover:bg-black/30 rounded-lg cursor-pointer transition-colors select-none"
        >
          {waveformBars.map((height, i) => {
            const barPercent = (i / waveformBars.length) * 100
            const isPassed = barPercent <= progress

            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-all duration-150"
                style={{
                  height: isPlaying
                    ? `${Math.max(3, height + Math.sin(i * 0.6 + Date.now() * 0.008) * 3)}px`
                    : `${height}px`,
                  backgroundColor: isPassed ? '#a78bfa' : 'rgba(255, 255, 255, 0.08)',
                }}
              />
            )
          })}

          {hoverTimeSec !== null && (
            <div className="absolute -top-6 px-1.5 py-0.5 rounded bg-zinc-900 border border-white/[0.06] text-white text-[9px] font-mono shadow pointer-events-none transform -translate-x-1/2">
              {formatTime(hoverTimeSec)}
            </div>
          )}
        </div>

        {/* Right: Timecode, Speed, Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
            <span className="text-violet-300 font-semibold">{formatTime(currentTimeSec)}</span> /{' '}
            {formatTime(totalDurationSec)}
          </span>

          <button
            onClick={restartPlayback}
            className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
            title="Restart"
          >
            <RotateCcw size={11} />
          </button>

          <button
            onClick={changeSpeed}
            className="px-1.5 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.06] text-[10px] font-mono font-medium text-zinc-400 hover:text-white transition-colors"
            title="Speed"
          >
            {playbackSpeed}x
          </button>

          <div className="w-[1px] h-3.5 bg-white/[0.06] mx-0.5" />

          <button
            onClick={copyScript}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
            title="Copy Text"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>

          <button
            onClick={downloadScript}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
            title="Download Script"
          >
            <Download size={12} />
          </button>
        </div>
      </div>

      {/* Synchronized Live Subtitle Bar — Only shown when playing */}
      {isPlaying && sentences.length > 0 && (
        <div className="px-3 py-1.5 rounded-lg bg-[rgba(18,18,24,0.4)] border border-white/[0.03] text-[11px] text-zinc-300 italic truncate animate-fade-in">
          "{sentences[currentSentenceIdx] || sentences[0]}"
        </div>
      )}
    </div>
  )
}
