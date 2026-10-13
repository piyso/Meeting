import React, { useState, useEffect, useCallback } from 'react'
import { Unlock, Key, ShieldAlert, Copy, Download, RotateCcw, Loader2 } from 'lucide-react'
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
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = useCallback(async () => {
    setIsRetrying(true)
    setRecoveryError(false)
    try {
      const res = await window.electronAPI?.auth?.generateRecoveryKey?.()
      if (res?.success && res.data?.phrase && res.data.phrase.length > 0) {
        setRecoveryPhrase(res.data.phrase)
        setRecoveryError(false)
      } else {
        setRecoveryError(true)
      }
    } catch {
      setRecoveryError(true)
    } finally {
      setIsRetrying(false)
    }
  }, [setRecoveryError, setRecoveryPhrase])

  useEffect(() => {
    if (recoveryPhrase.length === 0 && !recoveryError) {
      handleRetry()
    }
  }, [recoveryPhrase.length, recoveryError, handleRetry])

  return (
    <div className="w-full max-w-[460px] mx-auto flex flex-col items-center relative z-10 animate-fade-in px-2 sm:px-4 py-1 sm:py-2">
      {/* Header Section */}
      <div className="flex flex-col items-center text-center mb-4 sm:mb-6">
        <div
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-700 ${
            keySaved
              ? 'bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
              : 'bg-amber-500/10 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
          }`}
        >
          {keySaved ? (
            <Unlock size={22} className="text-emerald-400" />
          ) : (
            <Key size={22} className="text-amber-400 animate-pulse-slow" />
          )}
        </div>
        <h2 className="text-xl sm:text-2xl font-heading font-semibold tracking-wide text-white">
          Your Recovery Key
        </h2>
        <p className="text-xs sm:text-[13px] text-slate-400 mt-1 max-w-[280px] sm:max-w-xs leading-relaxed">
          The cryptographic seed to your sovereign data.
          <br />
          <span className="text-slate-300 font-medium">Lose this — lose everything.</span>
        </p>
      </div>

      {/* Warning Notice Banner */}
      {!recoveryError && (
        <div className="w-full flex items-start sm:items-center gap-2.5 mb-3 sm:mb-4 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-amber-950/25 border border-amber-500/20 text-amber-200/90 text-xs sm:text-[12px] leading-relaxed relative overflow-hidden shadow-sm">
          <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-amber-400 to-amber-600" />
          <ShieldAlert size={15} className="shrink-0 text-amber-400 mt-0.5 sm:mt-0 ml-0.5" />
          <span>
            We <strong className="text-amber-300 font-semibold">cannot</strong> recover your data
            without this key. Never share it with anyone.
          </span>
        </div>
      )}

      {/* Error Card OR Recovery Phrase Grid */}
      {recoveryError ? (
        <div className="w-full p-5 sm:p-6 rounded-2xl bg-rose-950/25 border border-rose-500/20 shadow-xl flex flex-col items-center text-center mb-4 sm:mb-5">
          <div className="p-2.5 sm:p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 mb-3">
            <ShieldAlert size={24} className="text-rose-400" />
          </div>
          <h4 className="text-sm font-semibold text-rose-200 mb-1">Key Generation Failed</h4>
          <p className="text-xs sm:text-[13px] text-rose-300/80 leading-relaxed max-w-[280px] sm:max-w-xs mb-4">
            Your data cannot be securely protected without a valid key.
          </p>
          <Button
            variant="secondary"
            className="bg-rose-500/15 border-rose-500/30 hover:bg-rose-500/25 text-rose-200 px-5 sm:px-6 h-9 sm:h-10 rounded-xl text-xs sm:text-sm font-medium transition-all gap-2 shadow-sm"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            <span>{isRetrying ? 'Generating Key...' : 'Retry Key Generation'}</span>
          </Button>
        </div>
      ) : (
        <div className="w-full relative mb-3 sm:mb-4 rounded-xl sm:rounded-2xl overflow-hidden">
          <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-[#060a14] border border-white/[0.06] shadow-inner max-h-[260px] sm:max-h-[300px] overflow-y-auto">
            {recoveryPhrase.map((word, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08] transition-colors group min-w-0"
              >
                <span className="text-[10px] font-mono text-slate-500 font-semibold w-4 shrink-0 select-none tabular-nums group-hover:text-slate-400 transition-colors">
                  {(i + 1).toString().padStart(2, '0')}
                </span>
                <span className="text-xs sm:text-[13px] font-mono text-slate-300 font-medium tracking-wide truncate select-all group-hover:text-white transition-colors">
                  {word}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons: Copy / Download */}
      {!recoveryError && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 mb-3 sm:mb-4">
          <Button
            variant="secondary"
            className={`w-full bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] gap-1.5 h-10 sm:h-11 rounded-xl text-xs sm:text-[13px] font-medium transition-all ${
              !keySaved && !recoveryError
                ? 'animate-pulse-slow shadow-[0_0_15px_rgba(255,255,255,0.04)]'
                : ''
            }`}
            onClick={handleCopyKey}
            disabled={recoveryError || recoveryPhrase.length === 0}
          >
            {keyCopied ? (
              <span className="text-emerald-400 font-semibold tracking-wide">✓ Copied!</span>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy to Clipboard</span>
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            className="w-full bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] gap-1.5 h-10 sm:h-11 rounded-xl text-xs sm:text-[13px] font-medium"
            onClick={handleDownloadKey}
            disabled={recoveryError || recoveryPhrase.length === 0}
          >
            <Download size={14} />
            <span>Save as Text File</span>
          </Button>
        </div>
      )}

      {/* Final Confirmation / Action Button */}
      <Button
        variant="primary"
        size="lg"
        className={`w-full transition-all duration-300 h-10 sm:h-11 text-xs sm:text-sm font-semibold tracking-wide rounded-xl ${
          recoveryError
            ? 'bg-white/[0.04] text-slate-500 border border-white/[0.05] cursor-not-allowed'
            : keySaved
              ? 'bg-white text-slate-950 hover:bg-slate-100 shadow-[0_0_25px_rgba(255,255,255,0.1)] border-none'
              : 'bg-white/[0.04] text-slate-400 border border-white/[0.05] cursor-not-allowed'
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
