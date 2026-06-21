import React from 'react'
import { ModelDownloadProgress } from '../ModelDownloadProgress'

export interface HardwareTierInfo {
  tier: 'low' | 'medium' | 'high'
  totalRAM: number
  recommendedASR: 'speech' | 'distil-whisper' | 'whisper-base'
  recommendedLLM: 'language' | 'qwen-0.5b' | 'qwen-1.5b' | 'qwen-4b'
  totalRAMBudget: number
}

interface OnboardingSetupPanelProps {
  isDownloading: boolean
  tierInfo: HardwareTierInfo | null
}

export const OnboardingSetupPanel: React.FC<OnboardingSetupPanelProps> = ({
  isDownloading,
  tierInfo,
}) => {
  return (
    <div className="w-full max-w-[420px] flex flex-col  relative z-10">
      <h2 className="text-2xl font-semibold tracking-wide text-white mb-8 text-center lg:text-left">
        Initializing System...
      </h2>
      <ModelDownloadProgress />
      <ul className="space-y-4 text-sm font-mono mt-6">
        <li className="flex items-start gap-3 text-emerald-400">
          <span>[OK]</span> Account authenticated
        </li>
        <li
          className={`flex items-start gap-3 ${isDownloading ? 'text-white' : 'text-slate-500'}`}
        >
          <span className={isDownloading ? 'animate-pulse text-emerald-400' : ''}>
            {isDownloading ? '[..]' : '[  ]'}
          </span>
          <div>
            <div>Downloading AI models...</div>
            {tierInfo && (
              <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">
                Sovereign AI Runtime Active
              </div>
            )}
          </div>
        </li>
        <li className="flex items-start gap-3 text-slate-500">
          <span>[ ]</span> Ready local database
        </li>
      </ul>
    </div>
  )
}
