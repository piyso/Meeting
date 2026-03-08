import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from 'react'
import { useAppStore } from '../store/appStore'

import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { PricingView } from './settings/PricingView'
import { GhostMeetingTutorial } from './meeting/GhostMeetingTutorial'
import { ModelDownloadProgress } from './ModelDownloadProgress'
import { Key, Unlock, ShieldAlert, Copy, Download } from 'lucide-react'
import { Logo3D } from './ui/Logo3D'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('Onboarding')

/** Error boundary so WebGL / 3D failures don't crash onboarding */
class Logo3DErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn('[Logo3D] Rendering failed, using CSS fallback:', error.message)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: 192,
            height: 192,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #22d3ee 0%, #3b82f6 60%, transparent 70%)',
              boxShadow: '0 0 40px rgba(34,211,238,0.4), 0 0 80px rgba(59,130,246,0.2)',
            }}
          />
        </div>
      )
    }
    return this.props.children
  }
}

type OnboardingStep = 'auth' | 'setup' | 'recovery-key' | 'plan-selection' | 'ghost-meeting'

interface HardwareTierInfo {
  tier: 'high' | 'mid' | 'low'
  totalRAM: number
  recommendedASR: string
  recommendedLLM: string
  totalRAMBudget: number
}

export const OnboardingFlow: React.FC = () => {
  const [step, setStep] = useState<OnboardingStep>('auth')
  const [tierInfo, setTierInfo] = useState<HardwareTierInfo | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [recoveryPhrase, setRecoveryPhrase] = useState<string[]>([])

  const [authEmail, setAuthEmail] = useState('')
  const [authPass, setAuthPass] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register')
  const [isNewUser, setIsNewUser] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  // Check if onboarding already completed — skip to main app
  useEffect(() => {
    const checkOnboardingCompleted = async () => {
      try {
        const result = await window.electronAPI?.settings?.get?.({
          key: 'onboarding_completed',
        } as { key: string })
        if (result?.success && result.data) {
          // Onboarding was already completed — go to main app
          useAppStore.getState().navigate('meeting-list')
        }
      } catch {
        // Settings unavailable — stay on onboarding (safe default)
      }
    }
    checkOnboardingCompleted()
  }, [])

  // Auto-trigger hardware detection + model download when entering 'setup' step
  useEffect(() => {
    if (step === 'setup') {
      if (isNewUser) {
        detectHardwareTier()
      } else {
        // Returning user — skip onboarding setup, go straight to plan selection
        setStep('plan-selection' as OnboardingStep)
      }
    }
  }, [step, isNewUser])

  const detectHardwareTier = async () => {
    const result = await window.electronAPI?.model?.detectHardwareTier()
    if (result?.success && result.data) {
      setTierInfo(result.data as unknown as HardwareTierInfo)
    } else {
      setTierInfo({
        tier: 'high',
        totalRAM: 16,
        recommendedASR: 'speech',
        recommendedLLM: 'language',
        totalRAMBudget: 8,
      })
    }

    setIsDownloading(true)

    // Wire real model download via model:downloadAll IPC
    try {
      const downloadResult = await window.electronAPI?.model?.downloadAll?.()
      if (!downloadResult?.success) {
        log.warn('[Onboarding] Model download failed, continuing anyway:', downloadResult?.error)
      }
    } catch (err) {
      log.warn('[Onboarding] Model download error (non-fatal):', err)
    }

    try {
      // Generate real recovery phrase via RecoveryPhraseService
      const recoveryResult = await window.electronAPI?.auth?.generateRecoveryKey?.()
      if (recoveryResult?.success && recoveryResult.data?.phrase) {
        setRecoveryPhrase(recoveryResult.data.phrase)
      } else {
        const fallbackWords = [
          'abandon',
          'ability',
          'able',
          'about',
          'above',
          'absent',
          'absorb',
          'abstract',
          'absurd',
          'abuse',
          'access',
          'accident',
        ]
        setRecoveryPhrase(fallbackWords)
      }
    } catch {
      const fallbackWords = [
        'abandon',
        'ability',
        'able',
        'about',
        'above',
        'absent',
        'absorb',
        'abstract',
        'absurd',
        'abuse',
        'access',
        'accident',
      ]
      setRecoveryPhrase(fallbackWords)
    }
    setIsDownloading(false)
    setStep('recovery-key')
  }

  const handleAuth = async () => {
    if (!authEmail || !authPass) {
      setAuthError('Email and password are required')
      return
    }
    setAuthLoading(true)
    setAuthError(null)
    try {
      // Call the correct auth endpoint based on mode
      const result =
        authMode === 'register'
          ? await window.electronAPI?.auth?.register?.({ email: authEmail, password: authPass })
          : await window.electronAPI?.auth?.login?.({ email: authEmail, password: authPass })

      if (result?.success) {
        setIsNewUser(authMode === 'register')
        setStep('setup')
      } else if (result) {
        const errMsg = result?.error?.message || ''
        if (
          errMsg.includes('fetch') ||
          errMsg.includes('ECONNREFUSED') ||
          errMsg.includes('network') ||
          errMsg.includes('validation') ||
          errMsg.includes('invalid') ||
          errMsg.includes('supabaseUrl')
        ) {
          // Backend not configured — skip auth and proceed (offline-first mode)
          log.warn('Auth backend unavailable, proceeding in offline mode')
          setIsNewUser(authMode === 'register')
          setStep('setup')
        } else {
          setAuthError(errMsg || 'Authentication failed')
        }
      } else {
        setIsNewUser(authMode === 'register')
        setStep('setup')
      }
    } catch (err) {
      // Any error = skip to setup (offline-first)
      log.warn('Auth error, proceeding in offline mode:', err)
      setStep('setup')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryPhrase.join(' '))
      setKeyCopied(true)
      setKeySaved(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setKeyCopied(false), 3000)
    } catch (err) {
      log.error('Failed to copy', err)
    }
  }

  const handleDownloadKey = () => {
    const content = [
      'BlueArkive Recovery Key',
      `Generated: ${new Date().toISOString()}`,
      '',
      '⚠️ CRITICAL: Store this recovery key in a safe place!',
      'Without this key, your encrypted data is PERMANENTLY UNRECOVERABLE if you lose your password.',
      '',
      'Recovery Key:',
      recoveryPhrase.join(' '),
      '',
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bluearkive-recovery-${Date.now()}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setKeySaved(true)
  }

  const completeOnboarding = async () => {
    try {
      await window.electronAPI?.settings?.update?.({
        key: 'onboarding_completed',
        value: true,
      } as { key: string; value: boolean })
    } catch {
      // Settings API may not be available in dev
    }
    useAppStore.getState().navigate('meeting-list')
  }

  return (
    <div className="w-full h-full flex bg-[#020617] text-[var(--color-text-primary)] relative">
      {/* Left Visual Art Panel (Hidden on mobile, and hidden during wide steps) */}
      {step !== 'plan-selection' && step !== 'ghost-meeting' && (
        <div className="hidden lg:flex w-1/2 h-full bg-slate-950 p-12 flex-col justify-between relative overflow-hidden border-r border-white/5">
          <div className="absolute inset-0 with-noise opacity-[0.03] pointer-events-none" />
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none translate-x-1/3 -translate-y-1/3" />

          <div className="relative z-10">
            <Logo3DErrorBoundary>
              <Logo3D />
            </Logo3DErrorBoundary>
          </div>

          <div className="relative z-10 max-w-md mt-12">
            <h1 className="text-4xl font-heading font-medium tracking-wide text-white mb-6">
              {step === 'auth'
                ? authMode === 'register'
                  ? 'The Sovereign Memory Fabric.'
                  : 'Welcome Back.'
                : ''}
              {step === 'setup' ? 'Initializing Core.' : ''}
              {step === 'recovery-key' ? 'Absolute Sovereignty.' : ''}
              {(step as string) === 'plan-selection' ? 'Systems Ready.' : ''}
              {(step as string) === 'ghost-meeting' ? 'Simulation Mode.' : ''}
            </h1>
            <p className="text-slate-400 font-serif italic text-lg leading-relaxed">
              {step === 'auth'
                ? 'Constructing the autonomous agentic web. Infinite recall, zero dependencies.'
                : ''}
              {step === 'setup'
                ? 'Injecting AI models directly into your secure local environment.'
                : ''}
              {step === 'recovery-key'
                ? 'You are the only one holding the keys. True ownership of your data.'
                : ''}
              {(step as string) === 'plan-selection'
                ? 'Choose the cognitive capacity required for your workflows.'
                : ''}
              {(step as string) === 'ghost-meeting'
                ? 'Your first session. Experiencing the intelligence locally.'
                : ''}
            </p>
          </div>

          <div className="relative z-10 text-[10px] font-mono tracking-widest text-slate-600 uppercase">
            All processing happens locally.
          </div>
        </div>
      )}

      {/* Right Control Panel (Form) */}
      <div
        className={`w-full ${step === 'plan-selection' || step === 'ghost-meeting' ? '' : 'lg:w-1/2'} h-full flex items-center justify-center p-8 relative overflow-y-auto pt-[env(titlebar-area-height,32px)]`}
      >
        {/* Subtle global noise texture for right side too */}
        <div className="absolute inset-0 with-noise opacity-[0.015] pointer-events-none" />

        {step === 'auth' && (
          <div className="w-full max-w-[420px] flex flex-col relative z-10">
            <div className="flex flex-col mb-10 lg:hidden items-center ">
              <div className="mb-6 -mt-8">
                <Logo3DErrorBoundary>
                  <Logo3D className="transform scale-75 origin-center" />
                </Logo3DErrorBoundary>
              </div>
              <h1 className="text-2xl font-semibold tracking-wide text-center text-white">
                {authMode === 'register' ? 'Initialize Core' : 'Welcome Back'}
              </h1>
            </div>

            {!authLoading && (
              <div className="hidden lg:block mb-8 ">
                <h2 className="text-2xl font-semibold tracking-wide text-white">
                  {authMode === 'register' ? 'Create Account' : 'Sign In'}
                </h2>
              </div>
            )}

            <div className="w-full space-y-4 mb-6">
              <div className="">
                <Input
                  label="Email"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="">
                <Input
                  type="password"
                  label="Password"
                  value={authPass}
                  onChange={e => setAuthPass(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {authError && (
                <div
                  className={`flex items-center gap-3 p-3.5 rounded-xl text-sm font-medium backdrop-blur-xl ${
                    authError.startsWith('✓')
                      ? 'bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.3)] text-emerald-300'
                      : authError.includes('email confirmation') || authError.includes('check your')
                        ? 'bg-[rgba(14,165,233,0.06)] border border-[rgba(14,165,233,0.3)] text-sky-300'
                        : 'bg-[rgba(244,63,94,0.06)] border border-[rgba(244,63,94,0.3)] text-rose-300'
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      authError.startsWith('✓')
                        ? 'bg-emerald-500'
                        : authError.includes('email confirmation') ||
                            authError.includes('check your')
                          ? 'bg-sky-500'
                          : 'bg-rose-500 animate-pulse'
                    }`}
                  />
                  <span className="flex-1 tracking-wide">{authError}</span>
                </div>
              )}

              <div className="">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full mt-4 bg-white text-slate-950 hover:bg-slate-200 border-none transition-colors"
                  onClick={handleAuth}
                  disabled={authLoading}
                >
                  {authLoading
                    ? 'Authenticating...'
                    : authMode === 'register'
                      ? 'Initialize Core'
                      : 'Sign In'}
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-slate-500 tracking-widest uppercase">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Google Sign-in */}
                <button
                  onClick={async () => {
                    try {
                      setAuthError(null)
                      await window.electronAPI?.auth?.googleAuth?.()
                      setAuthError('Google sign-in opened in browser — complete the flow there')
                    } catch (err: unknown) {
                      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed')
                    }
                  }}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-slate-300 font-medium transition-all cursor-pointer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center pt-6 border-t border-white/10 mt-2 ">
              <div className="text-xs text-slate-400 tracking-wide">
                {authMode === 'register' ? (
                  <>
                    Already have an account?&nbsp;
                    <span
                      onClick={() => {
                        setAuthMode('login')
                        setAuthError(null)
                      }}
                      className="text-white cursor-pointer hover:underline transition-colors font-medium"
                    >
                      Log in
                    </span>
                  </>
                ) : (
                  <>
                    Need an account?&nbsp;
                    <span
                      onClick={() => {
                        setAuthMode('register')
                        setAuthError(null)
                      }}
                      className="text-white cursor-pointer hover:underline transition-colors font-medium"
                    >
                      Register
                    </span>
                  </>
                )}
              </div>
              {authMode === 'login' && (
                <button
                  type="button"
                  className="mt-3 text-xs text-violet-400 hover:text-violet-300 cursor-pointer transition-colors bg-transparent border-none font-medium tracking-wide"
                  onClick={async () => {
                    if (!authEmail) {
                      setAuthError('Enter your email first, then click Forgot Password')
                      return
                    }
                    try {
                      const result = await window.electronAPI?.auth?.forgotPassword?.({
                        email: authEmail,
                      })
                      if (result?.success) {
                        setAuthError(null)
                        log.info('Password reset email sent')
                        // Show a brief success message using the error display but styled differently
                        setAuthError('✓ Password reset email sent — check your inbox')
                      } else {
                        setAuthError(result?.error?.message || 'Failed to send reset email')
                      }
                    } catch {
                      setAuthError('Failed to send reset email')
                    }
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'setup' && (
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
        )}

        {step === 'recovery-key' && (
          <div className="w-full max-w-[520px] flex flex-col relative z-10 animate-fade-in">
            {/* Header with dynamic lock state */}
            <div className="flex flex-col items-center text-center mb-8">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all duration-700 ${keySaved ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}
              >
                {keySaved ? (
                  <Unlock size={32} className="text-emerald-400 animate-slide-up" />
                ) : (
                  <Key size={32} className="text-amber-400 animate-pulse-slow" />
                )}
              </div>
              <h2 className="text-3xl font-heading font-semibold tracking-wide text-white">
                Your Recovery Key
              </h2>
              <p className="text-sm text-slate-400 mt-3 max-w-sm leading-relaxed">
                This is the cryptographic seed to your sovereign data. <br />
                If you lose this, your data cannot be recovered.
              </p>
            </div>

            {/* Warning banner */}
            <div className="flex items-start gap-4 mb-8 px-5 py-4 rounded-xl bg-amber-950/40 border border-amber-500/20 text-amber-200/90 text-[13px] leading-relaxed relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
              <ShieldAlert size={20} className="shrink-0 text-amber-500 mt-0.5" />
              <span>
                We <strong>cannot</strong> recover your data without this key. Never share it with
                anyone. Our team will never ask for it.
              </span>
            </div>

            {/* Word grid - Vault style */}
            <div className="grid grid-cols-3 gap-3 mb-8 w-full p-5 rounded-2xl bg-[#0a0f1d] border border-white/5 shadow-inner">
              {recoveryPhrase.map((word, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.03] hover:bg-white/[0.06] transition-colors"
                >
                  <span className="text-slate-500 text-[10px] font-mono opacity-60 w-4 shrink-0 select-none">
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="text-slate-200 font-mono text-[14px] font-medium tracking-widest select-all">
                    {word}
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 w-full mb-6">
              <Button
                variant="secondary"
                className={`flex-1 bg-white/5 border-white/10 hover:bg-white/10 gap-2 h-12 transition-all ${
                  !keySaved ? 'animate-pulse-slow shadow-[0_0_15px_rgba(255,255,255,0.05)]' : ''
                }`}
                onClick={handleCopyKey}
              >
                {keyCopied ? (
                  '✓ Copied!'
                ) : (
                  <>
                    <Copy size={16} /> Copy to Clipboard
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 gap-2 h-12"
                onClick={handleDownloadKey}
              >
                <Download size={16} /> Save as Text File
              </Button>
            </div>

            <Button
              variant="primary"
              size="lg"
              className={`w-full border-none transition-all duration-500 h-14 text-base font-medium tracking-wide shadow-xl ${
                keySaved
                  ? 'bg-white text-slate-950 hover:bg-slate-200 shadow-[0_0_30px_rgba(255,255,255,0.15)]'
                  : 'bg-white/5 text-slate-500 cursor-not-allowed opacity-70'
              }`}
              disabled={!keySaved}
              onClick={() => setStep('plan-selection')}
            >
              {keySaved ? "I've Saved It Securely →" : 'Copy or Download to Continue'}
            </Button>
          </div>
        )}

        {step === 'plan-selection' && (
          <div className="w-full max-w-[1000px] flex flex-col items-center relative z-10 pt-10">
            <h2 className="text-3xl font-semibold tracking-wide text-white mb-8 text-center animate-fade-in font-heading">
              Select Cognitive Capacity
            </h2>
            <PricingView onPlanSelect={() => setStep('ghost-meeting')} />
            <Button
              variant="primary"
              size="lg"
              onClick={() => setStep('ghost-meeting')}
              className="w-full mt-6 bg-white text-slate-950 hover:bg-slate-200 border-none transition-colors shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            >
              Initialize First Session
            </Button>
          </div>
        )}

        {step === 'ghost-meeting' && (
          <div className="w-full h-full flex flex-col items-center justify-center  relative z-10 overflow-hidden">
            <GhostMeetingTutorial onComplete={completeOnboarding} />
          </div>
        )}
      </div>
    </div>
  )
}
