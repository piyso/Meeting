import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  Copy,
  Check,
  Volume2,
  Sparkles,
  ChevronDown,
} from 'lucide-react'

interface PodcastPlayerProps {
  script: string
  summaryText?: string
  ssmlScript?: string
  weekRange: string
  meetingCount: number
  totalHours: number
}

export const PodcastPlayer: React.FC<PodcastPlayerProps> = ({
  script,
  summaryText,
  weekRange,
  meetingCount,
  totalHours,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isScrolledOutOfView, setIsScrolledOutOfView] = useState<boolean>(false)

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
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (entry) {
          setIsScrolledOutOfView(!entry.isIntersecting)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      pausedTimeRef.current = Date.now() - startTimeRef.current
      setIsPlaying(false)
    } else {
      if (window.speechSynthesis && window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
        startTimeRef.current = Date.now() - pausedTimeRef.current
        setIsPlaying(true)
        trackProgress()
      } else {
        startPlayback()
      }
    }
  }

  const trackProgress = () => {
    const update = () => {
      const elapsedMs = Date.now() - startTimeRef.current
      const elapsedSec = elapsedMs / 1000
      const currentProgress = Math.min(100, (elapsedSec / totalDurationSec) * 100)

      setCurrentTimeSec(Math.min(totalDurationSec, Math.floor(elapsedSec)))
      setProgress(currentProgress)

      if (currentProgress < 100 && isPlaying) {
        animFrameRef.current = requestAnimationFrame(update)
      }
    }
    animFrameRef.current = requestAnimationFrame(update)
  }

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return
    const rect = waveformRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, clickX / rect.width))

    const newTimeSec = percent * totalDurationSec
    setCurrentTimeSec(Math.floor(newTimeSec))
    setProgress(percent * 100)
    pausedTimeRef.current = newTimeSec * 1000

    if (isPlaying) {
      startPlayback()
    }
  }

  const handleWaveformMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return
    const rect = waveformRef.current.getBoundingClientRect()
    const moveX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, moveX / rect.width))
    setHoverTimeSec(Math.floor(percent * totalDurationSec))
  }

  const restartPlayback = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    setProgress(0)
    setCurrentTimeSec(0)
    pausedTimeRef.current = 0
    setIsPlaying(false)
  }

  const changeSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0]
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
    const nextSpeed = speeds[nextIdx] ?? 1.0
    setPlaybackSpeed(nextSpeed)
    if (isPlaying) {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      startPlayback()
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const copyScript = async () => {
    await navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
    <div
      ref={containerRef}
      className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-b from-white/[0.035] via-white/[0.015] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)] transition-all hover:border-white/[0.06]"
    >
      {/* Top Header Row inside Player */}
      <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-white/[0.025]">
        <div
          className="flex items-center gap-2"
          title={`Briefing for ${weekRange}: ${meetingCount} meetings, ${totalHours}h synthesized`}
        >
          <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
            <Volume2 size={13} />
          </div>
          <span className="text-xs font-semibold text-white tracking-tight">
            Executive Briefing
          </span>
          <span className="text-[10px] font-mono text-zinc-500 font-normal">
            ({formatTime(totalDurationSec)})
          </span>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 font-medium tracking-wider">
            Audio Intelligence
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={changeSpeed}
            className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-mono font-medium text-zinc-300 hover:text-white transition-colors"
            title="Playback Speed"
          >
            {playbackSpeed}x
          </button>

          <button
            type="button"
            onClick={restartPlayback}
            className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Restart Briefing"
          >
            <RotateCcw size={12} />
          </button>

          <button
            type="button"
            onClick={copyScript}
            className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Copy Transcript"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>

          <button
            type="button"
            onClick={downloadScript}
            className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Download Transcript"
          >
            <Download size={12} />
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title={isCollapsed ? 'Expand Summary' : 'Collapse Summary'}
          >
            <ChevronDown
              size={13}
              className={`transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
            />
          </button>
        </div>
      </div>

      {/* Briefing Text (Summary) */}
      {!isCollapsed && summaryText && (
        <p className="text-[13px] text-zinc-300 leading-relaxed font-normal mb-3.5 m-0">
          {summaryText}
        </p>
      )}

      {/* Main Playback Strip: Button + Waveform + Timecode */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-[0_2px_12px_rgba(124,58,237,0.35)] transition-all active:scale-95 shrink-0"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={13} fill="currentColor" />
          ) : (
            <Play size={13} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        {/* Waveform Scrubber */}
        <div
          ref={waveformRef}
          onClick={handleWaveformClick}
          onMouseMove={handleWaveformMouseMove}
          onMouseLeave={() => setHoverTimeSec(null)}
          className="relative flex-1 h-7 flex items-center justify-between gap-[2px] px-2.5 bg-white/[0.03] hover:bg-white/[0.05] rounded-xl cursor-pointer transition-colors select-none"
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
            <div className="absolute -top-7 px-1.5 py-0.5 rounded bg-zinc-900 border border-white/[0.08] text-white text-[9px] font-mono shadow pointer-events-none transform -translate-x-1/2">
              {formatTime(hoverTimeSec)}
            </div>
          )}
        </div>

        {/* Timecode */}
        <span className="text-xs font-mono text-zinc-400 tabular-nums shrink-0">
          <span className="text-violet-300 font-semibold">{formatTime(currentTimeSec)}</span> /{' '}
          {formatTime(totalDurationSec)}
        </span>
      </div>

      {/* Synchronized Live Subtitle Bar — Only shown when playing */}
      {isPlaying && sentences.length > 0 && (
        <div className="mt-3 px-3 py-1.5 rounded-lg bg-violet-500/[0.06] text-xs text-zinc-300 italic flex items-center gap-2 animate-fade-in">
          <Sparkles size={11} className="text-violet-400 shrink-0" />
          <span className="truncate">"{sentences[currentSentenceIdx] || sentences[0]}"</span>
        </div>
      )}

      {/* Persistent Floating Mini Player Pill — Appears when audio is playing and user scrolled down */}
      {isPlaying && isScrolledOutOfView && (
        <div className="fixed bottom-6 right-8 z-50 flex items-center gap-3 px-3.5 py-2 rounded-full bg-[#0d0d14]/95 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.85),0_0_24px_rgba(139,92,246,0.12)] animate-slide-up select-none transition-all">
          <button
            type="button"
            onClick={togglePlay}
            className="w-7 h-7 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-[0_2px_10px_rgba(124,58,237,0.4)] transition-all shrink-0 active:scale-95"
            aria-label="Pause"
          >
            <Pause size={11} fill="currentColor" />
          </button>

          <div className="flex flex-col max-w-[180px] sm:max-w-[260px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-white tracking-tight">
                Executive Briefing
              </span>
              <span className="text-[9px] font-mono text-violet-300">
                {formatTime(currentTimeSec)} / {formatTime(totalDurationSec)}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 truncate italic">
              "{sentences[currentSentenceIdx] || sentences[0]}"
            </span>
          </div>

          <button
            type="button"
            onClick={changeSpeed}
            className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-[10px] font-mono text-zinc-300 hover:text-white transition-colors"
            title="Playback Speed"
          >
            {playbackSpeed}x
          </button>

          <button
            type="button"
            onClick={() => {
              containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className="text-violet-300 hover:text-white text-[10.5px] font-medium transition-colors hover:underline shrink-0"
            title="Scroll to Briefing"
          >
            Top ↑
          </button>
        </div>
      )}
    </div>
  )
}
