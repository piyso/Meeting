import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from 'react'
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion'
import { useAppStore } from '../store/appStore'

import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { PricingView } from './settings/PricingView'
import { GhostMeetingTutorial } from './meeting/GhostMeetingTutorial'
import { ModelDownloadProgress } from './ModelDownloadProgress'
import {
  Key,
  Unlock,
  ShieldAlert,
  Copy,
  Download,
  GitMerge,
  Activity,
  Layers,
  Landmark,
} from 'lucide-react'
import { Logo3D } from './ui/Logo3D'
import { Logo } from './ui/Logo'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('Onboarding')

/** Error boundary so WebGL / 3D failures don't crash onboarding */
class Logo3DErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    rendererLog.create('Logo3D').warn('Rendering failed, using CSS fallback:', error.message)
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
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const handlePointerMove = (e: React.PointerEvent) => {
    mouseX.set(e.clientX)
    mouseY.set(e.clientY)
  }

  const spotlightBackground = useMotionTemplate`radial-gradient(800px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.04), transparent 40%)`

  const [tierInfo, setTierInfo] = useState<HardwareTierInfo | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [recoveryPhrase, setRecoveryPhrase] = useState<string[]>([])
  const [recoveryError, setRecoveryError] = useState(false)

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

  // NOTE: Onboarding completion check is handled exclusively by AppLayout.tsx
  // to avoid a double-IPC race condition. If this component is mounted, onboarding is needed.

  // Listen for Google OAuth callback from main process deeplink handler
  useEffect(() => {
    const unsubSuccess = window.electronAPI?.auth?.onOAuthSuccess?.(data => {
      log.info('Google OAuth callback received', { email: data?.user?.email })
      setAuthError(null)
      setIsNewUser(false) // Google users are treated as returning users
      setStep('setup')
    })
    const unsubError = window.electronAPI?.auth?.onOAuthError?.(data => {
      log.warn('Google OAuth callback error:', data?.error)
      setAuthError(data?.error || 'Google sign-in failed')
    })
    return () => {
      unsubSuccess?.()
      unsubError?.()
    }
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
        setRecoveryError(false)
      } else {
        // SECURITY: Never present a fake/hardcoded key — block the user instead
        log.error('Recovery key generation failed — no phrase returned')
        setRecoveryError(true)
      }
    } catch (err) {
      log.error('Recovery key generation threw an exception:', err)
      setRecoveryError(true)
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
          errMsg.includes('supabaseUrl') ||
          errMsg.includes('supabase_not_configured')
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
    <div
      className="w-full h-full flex bg-[#020617] text-[var(--color-text-primary)] relative"
      onPointerMove={handlePointerMove}
    >
      {/* Left Visual Art Panel (Hidden on mobile, and hidden during wide steps) */}
      {step !== 'plan-selection' && step !== 'ghost-meeting' && (
        <div className="hidden lg:flex w-1/2 h-full bg-slate-950 p-12 flex-col relative overflow-hidden border-r border-white/[0.04]">
          <div className="absolute inset-0 with-noise opacity-[0.03] pointer-events-none z-0" />
          <motion.div
            className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-300 opacity-60"
            style={{
              background: spotlightBackground,
            }}
          />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-slate-800/30 blur-[130px] rounded-full pointer-events-none translate-x-1/4 -translate-y-1/4 z-0" />
          <div className="absolute bottom-10 left-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none -translate-x-1/4 translate-y-1/4 z-0" />

          <div className="relative z-10 pb-8">
            <Logo3DErrorBoundary>
              <Logo3D />
            </Logo3DErrorBoundary>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step + (step === 'auth' ? authMode : '')}
              initial={{ opacity: 0, y: 15, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -15, filter: 'blur(6px)' }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative z-10 max-w-xl mt-auto mb-auto"
            >
              <h1 className="text-[2.75rem] leading-[1.15] font-heading font-medium tracking-tight text-white mb-6 drop-shadow-lg">
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
              <p className="text-slate-400 font-serif italic text-xl leading-[1.7] opacity-90">
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

              {step === 'auth' && (
                <div className="mt-12 grid grid-cols-2 gap-5 pr-8">
                  <div className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-violet-500/10 transition-all duration-300 overflow-hidden cursor-default">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Layers
                      className="text-violet-400 mb-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"
                      size={24}
                    />
                    <h3 className="text-slate-200 font-medium tracking-wide mb-1.5 text-[15px]">
                      Cognitive Substrate
                    </h3>
                    <p className="text-[13px] text-slate-500 leading-relaxed group-hover:text-slate-400 transition-colors">
                      100% offline inference with zero external telemetry.
                    </p>
                  </div>

                  <div className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-300 overflow-hidden cursor-default">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Activity
                      className="text-emerald-400 mb-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"
                      size={24}
                    />
                    <h3 className="text-slate-200 font-medium tracking-wide mb-1.5 text-[15px]">
                      Infinite Recall
                    </h3>
                    <p className="text-[13px] text-slate-500 leading-relaxed group-hover:text-slate-400 transition-colors">
                      Continuous background ingestion and ambient retrieval.
                    </p>
                  </div>

                  <div className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 overflow-hidden cursor-default">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <GitMerge
                      className="text-amber-400 mb-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"
                      size={24}
                    />
                    <h3 className="text-slate-200 font-medium tracking-wide mb-1.5 text-[15px]">
                      Agentic Action
                    </h3>
                    <p className="text-[13px] text-slate-500 leading-relaxed group-hover:text-slate-400 transition-colors">
                      Autonomous workflow synthesis executed on-device.
                    </p>
                  </div>

                  <div className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-sky-500/10 transition-all duration-300 overflow-hidden cursor-default">
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Landmark
                      className="text-sky-400 mb-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"
                      size={24}
                    />
                    <h3 className="text-slate-200 font-medium tracking-wide mb-1.5 text-[15px]">
                      Data Sovereignty
                    </h3>
                    <p className="text-[13px] text-slate-500 leading-relaxed group-hover:text-slate-400 transition-colors">
                      Cryptographically guaranteed single-tenant architecture.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>


        </div>
      )}

      {/* Right Control Panel (Form) */}
      <div
        className={`w-full ${step === 'plan-selection' || step === 'ghost-meeting' ? '' : 'lg:w-1/2'} h-full flex items-center justify-center p-8 relative overflow-y-auto pt-[env(titlebar-area-height,32px)]`}
      >
        {/* Subtle global noise texture for right side too */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-[#02040a] to-[#02040a]" />

        <div className="w-full flex flex-col items-center justify-center my-auto relative z-10">
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
                <div className="hidden lg:flex lg:flex-col lg:items-center mb-8">
                  <div className="mb-5">
                    <Logo size="lg" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-wide text-white">
                    {authMode === 'register' ? 'Create Account' : 'Sign In'}
                  </h2>
                </div>
              )}

              <form
                className="w-full space-y-5 mb-8"
                onSubmit={e => {
                  e.preventDefault()
                  handleAuth()
                }}
              >
                <div className="">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    label="Email"
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="">
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    label="Password"
                    value={authPass}
                    onChange={e => setAuthPass(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                    required
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
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full mt-6 h-13 text-[14px] bg-white text-slate-950 hover:bg-slate-200 border-none transition-colors"
                    disabled={authLoading}
                  >
                    {authLoading
                      ? 'Authenticating...'
                      : authMode === 'register'
                        ? 'Initialize Core'
                        : 'Sign In'}
                  </Button>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-7">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-slate-500 tracking-widest uppercase">or</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  {/* Google Sign-in */}
                  <button
                    onClick={async () => {
                      try {
                        setAuthError(null)
                        const res = await window.electronAPI?.auth?.googleAuth?.()
                        if (!res) {
                          setAuthError('Google sign-in is not available in this environment')
                        } else if (!res?.success) {
                          const msg = res.error?.message || 'Google sign-in failed'
                          if (
                            msg.includes('provider is not enabled') ||
                            msg.includes('Unsupported provider')
                          ) {
                            setAuthError(
                              'Google sign-in is not available yet. Please use email/password to sign in.'
                            )
                          } else {
                            setAuthError(msg)
                          }
                        } else {
                          setAuthError('Google sign-in opened in browser — complete the flow there')
                        }
                      } catch (err: unknown) {
                        setAuthError(err instanceof Error ? err.message : 'Google sign-in failed')
                      }
                    }}
                    className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[14px] text-slate-300 font-medium transition-all cursor-pointer h-13"
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
              </form>

              <div className="flex flex-col items-center pt-8 border-t border-white/10 mt-4">
                <div className="text-[13px] text-slate-400 tracking-wide">
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
            <div className="w-full max-w-[620px] flex flex-col relative z-10 animate-fade-in pt-4">
              {/* Header — icon + title + subtitle */}
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
                  <span className="text-slate-400 font-medium">
                    Lose this — lose everything.
                  </span>
                </p>
              </div>

              {/* Warning stripe */}
              <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-lg bg-amber-950/30 border border-amber-500/15 text-amber-200/80 text-[12px] leading-relaxed relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-amber-400 to-amber-600" />
                <ShieldAlert size={16} className="shrink-0 text-amber-500 ml-1" />
                <span>
                  We <strong className="text-amber-300">cannot</strong> recover your data without this
                  key. Never share it. Our team will never ask for it.
                </span>
              </div>

              {/* Word Grid — Vault container */}
              {recoveryError ? (
                <div className="flex flex-col items-center gap-4 mb-6 w-full p-8 rounded-2xl bg-rose-950/20 border border-rose-500/20">
                  <ShieldAlert size={36} className="text-rose-400" />
                  <p className="text-rose-300 text-sm text-center leading-relaxed max-w-sm">
                    Recovery key generation failed. Your data cannot be securely protected without a
                    valid key.
                  </p>
                  <Button
                    variant="secondary"
                    className="bg-white/5 border-white/10 hover:bg-white/10"
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
                  {/* Vault outer glow */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
                  <div className="grid grid-cols-4 gap-3 p-6 rounded-2xl bg-[#060a14] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
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

              {/* Action buttons */}
              <div className="flex gap-4 w-full mb-6">
                <Button
                  variant="secondary"
                  className={`flex-1 bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] gap-2 h-13 text-[14px] font-medium transition-all ${
                    !keySaved && !recoveryError
                      ? 'animate-pulse-slow shadow-[0_0_12px_rgba(255,255,255,0.04)]'
                      : ''
                  }`}
                  onClick={handleCopyKey}
                  disabled={recoveryError || recoveryPhrase.length === 0}
                >
                  {keyCopied ? (
                    <span className="text-emerald-400">✓ Copied!</span>
                  ) : (
                    <>
                      <Copy size={15} /> Copy to Clipboard
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1 bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] gap-2 h-13 text-[14px] font-medium"
                  onClick={handleDownloadKey}
                  disabled={recoveryError || recoveryPhrase.length === 0}
                >
                  <Download size={16} /> Save as Text File
                </Button>
              </div>

              <Button
                variant="primary"
                size="lg"
                className={`w-full border-none transition-all duration-500 h-14 text-[15px] font-semibold tracking-wide shadow-xl rounded-xl ${
                  keySaved && !recoveryError
                    ? 'bg-white text-slate-950 hover:bg-slate-100 shadow-[0_0_30px_rgba(255,255,255,0.12)]'
                    : 'bg-white/[0.04] text-slate-600 cursor-not-allowed'
                }`}
                disabled={!keySaved || recoveryError}
                onClick={() => setStep('plan-selection')}
              >
                {recoveryError
                  ? 'Recovery Key Required'
                  : keySaved
                    ? "I've Saved It Securely →"
                    : 'Copy or Download to Continue'}
              </Button>
            </div>
          )}

          {step === 'plan-selection' && (
            <div className="w-full max-w-[1100px] flex flex-col items-center relative z-10 pt-10 pb-20">
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
            <div className="w-full h-[600px] flex flex-col items-center justify-center relative z-10 overflow-hidden">
              <GhostMeetingTutorial onComplete={completeOnboarding} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
