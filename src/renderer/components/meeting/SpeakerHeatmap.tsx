import React from 'react'

interface SpeakerHeatmapProps {
  segments: Array<{
    speakerColor: string
    startTime: number
    endTime: number
  }>
  totalDuration: number // ms
}

export const SpeakerHeatmap: React.FC<SpeakerHeatmapProps> = ({ segments, totalDuration }) => {
  if (totalDuration === 0)
    return <div className="h-2 w-full bg-[var(--color-bg-glass)] rounded-full" />

  return (
    <div className="relative w-full h-2 bg-[var(--color-bg-glass)] rounded-full overflow-hidden flex cursor-crosshair">
      {segments.map((seg, i) => {
        const width = ((seg.endTime - seg.startTime) / totalDuration) * 100
        if (width <= 0) return null

        return (
          <div
            key={i}
            className="h-full hover:scale-y-150 origin-bottom transition-transform"
            style={{
              width: `${width}%`,
              backgroundColor: `var(--color-${seg.speakerColor})`,
            }}
            title={`${seg.speakerColor} speaker: ${Math.round((seg.endTime - seg.startTime) / 1000)}s`}
          />
        )
      })}
    </div>
  )
}
