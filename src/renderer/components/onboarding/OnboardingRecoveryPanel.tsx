import React from 'react'
import { Unlock, Key, ShieldAlert, Copy, Download } from 'lucide-react'
import { Button } from '../ui/Button'

interface OnboardingRecoveryPanelProps {
  keySaved: boolean
  recoveryError: boolean
  setRecoveryError: (val: boolean) => void
  recoveryPhrase: string[]
  setRecoveryPhrase: (phrase: string[]) => void
  keyCopied: boolean
  handleCopyKey: () => void
  handleDownloadKey: () => void
  onComplete: () => void
}

export const OnboardingRecoveryPanel: React.FC<OnboardingRecoveryPanelProps> = ({
  keySaved,
  recoveryError,
  setRecoveryError,
  recoveryPhrase,
  setRecoveryPhrase,
  keyCopied,
  handleCopyKey,
  handleDownloadKey,
  onComplete,
}) => {
  return (
    <div className="w-full max-w-[620px] flex flex-col relative z-10 animate-fade-in pt-4">
      <div className="flex flex-col items-center text-center mb-10">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-700 ${keySaved ? 'bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-amber-500/10 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]'}`}
        >
          {keySaved ? (
            <Unlock size={26} className="text-emerald-400" />
          ) : (
            <Key size={26} className="text-amber-400 animate-pulse-slow" />
          )}
        </div>
        <h2 className="text-2xl font-heading font-semibold tracking-wide text-white">
          Your Recovery Key
        </h2>
        <p className="text-[13px] text-slate-500 mt-2 max-w-xs leading-relaxed">
          The cryptographic seed to your sovereign data.
          <br />
          <span className="text-slate-400 font-medium">Lose this — lose everything.</span>
        </p>
      </div>

      {!recoveryError && (
        <div className="flex items-center gap-3 mb-8 px-5 py-3.5 rounded-xl bg-amber-950/30 border border-amber-500/15 text-amber-200/80 text-[13px] leading-relaxed relative overflow-hidden shadow-lg">
          <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-amber-400 to-amber-600" />
          <ShieldAlert size={18} className="shrink-0 text-amber-500 ml-1" />
          <span>
            We <strong className="text-amber-300">cannot</strong> recover your data without
            this key. Never share it. Our team will never ask for it.
          </span>
        </div>
      )}

      {recoveryError ? (
        <div className="flex flex-col items-center gap-5 mb-10 w-full p-10 rounded-3xl bg-rose-950/20 border border-rose-500/20 shadow-2xl">
          <div className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20">
            <ShieldAlert size={32} className="text-rose-400" />
          </div>
          <p className="text-rose-300 text-[15px] text-center leading-[1.8] max-w-sm">
            Recovery key generation failed. Your data cannot be securely protected without a
            valid key.
          </p>
          <Button
            variant="secondary"
            className="bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20 text-rose-300 mt-2 px-8 h-12 rounded-xl transition-colors font-medium tracking-wide"
            onClick={async () => {
              setRecoveryError(false)
              try {
                const res = await window.electronAPI?.auth?.generateRecoveryKey?.()
                if (res?.success && res.data?.phrase) {
                  setRecoveryPhrase(res.data.phrase)
                } else {
                  setRecoveryError(true)
                }
              } catch {
                setRecoveryError(true)
              }
            }}
          >
            Retry Key Generation
          </Button>
        </div>
      ) : (
        <div className="relative mb-10 w-full rounded-2xl overflow-hidden">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-6 rounded-2xl bg-[#060a14] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            {recoveryPhrase.map((word, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06] hover:border-white/[0.08] transition-all duration-200 group"
              >
                <span className="text-[11px] font-mono text-slate-600 w-5 shrink-0 select-none tabular-nums group-hover:text-slate-400 transition-colors">
                  {(i + 1).toString().padStart(2, '0')}
                </span>
                <span className="text-[14px] font-mono text-slate-300 font-medium tracking-wide select-all group-hover:text-white transition-colors">
                  {word}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!recoveryError && (
        <div className="flex gap-5 w-full mb-8">
          <Button
            variant="secondary"
            className={`flex-1 bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] gap-2 h-14 rounded-xl text-[14px] font-medium transition-all ${
              !keySaved && !recoveryError
                ? 'animate-pulse-slow shadow-[0_0_15px_rgba(255,255,255,0.05)]'
                : ''
            }`}
            onClick={handleCopyKey}
            disabled={recoveryError || recoveryPhrase.length === 0}
          >
            {keyCopied ? (
              <span className="text-emerald-400 font-semibold tracking-wide">
                ✓ Copied!
              </span>
            ) : (
              <>
                <Copy size={16} /> Copy to Clipboard
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] gap-2 h-14 rounded-xl text-[14px] font-medium"
            onClick={handleDownloadKey}
            disabled={recoveryError || recoveryPhrase.length === 0}
          >
            <Download size={16} /> Save as Text File
          </Button>
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        className={`w-full border-none transition-all duration-500 h-14 text-[15px] font-semibold tracking-wide shadow-xl rounded-xl ${
          keySaved && !recoveryError
            ? 'bg-white text-slate-950 hover:bg-slate-100 shadow-[0_0_30px_rgba(255,255,255,0.12)]'
            : 'bg-white/[0.04] text-slate-600 cursor-not-allowed'
        }`}
        disabled={!keySaved || recoveryError}
        onClick={onComplete}
      >
        {recoveryError
          ? 'Recovery Key Required'
          : keySaved
            ? "I've Saved It Securely →"
            : 'Copy or Download to Continue'}
      </Button>
    </div>
  )
}
