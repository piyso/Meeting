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
        <div className="hidden lg:flex w-1/2 h-full bg-slate-950 p-8 lg:p-12 flex-col relative overflow-y-auto sovereign-scrollbar border-r border-white/[0.04]">
          <div className="absolute inset-0 with-noise opacity-[0.03] pointer-events-none z-0" />
          <motion.div
            className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-300 opacity-60"
            style={{
              background: spotlightBackground,
            }}
          />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-slate-800/30 blur-[130px] rounded-full pointer-events-none translate-x-1/4 -translate-y-1/4 z-0" />
          <div className="absolute bottom-10 left-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none -translate-x-1/4 translate-y-1/4 z-0" />

          {/* Removed Logo3D to clean up visual layout */}

          <AnimatePresence mode="wait">
            <motion.div
              key={step + (step === 'auth' ? authMode : '')}
              initial={{ opacity: 0, y: 15, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -15, filter: 'blur(6px)' }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative z-10 w-full max-w-xl mt-auto mb-auto mx-auto"
            >
              <h1 className="text-4xl lg:text-[2.75rem] leading-[1.15] font-heading font-medium tracking-tight text-white mb-4 lg:mb-6 drop-shadow-lg">
                {step === 'auth'
                  ? authMode === 'register'
                    ? 'The Sovereign Memory Fabric.'
                    : 'Welcome Back.'
                  : ''}
                {step === 'setup' ? 'Initializing Core.' : ''}
                {step === 'recovery-key' && (
                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-emerald-300 via-emerald-100 to-amber-200 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                    Absolute Sovereignty.
                  </span>
                )}
                {(step as string) === 'plan-selection' ? 'Systems Ready.' : ''}
                {(step as string) === 'ghost-meeting' ? 'Simulation Mode.' : ''}
              </h1>
              <p className="text-slate-400 font-serif italic text-lg lg:text-xl leading-[1.7] opacity-90">
                {step === 'auth'
                  ? 'Constructing the autonomous agentic web. Infinite recall, zero dependencies.'
                  : ''}
                {step === 'setup'
                  ? 'Injecting AI models directly into your secure local environment.'
                  : ''}
                {step === 'recovery-key' && (
                  <span className="text-slate-300">
                    You are the only one holding the keys.{' '}
                    <span className="text-emerald-300/90 not-italic font-sans font-medium tracking-wide">
                      True ownership of your data.
                    </span>
                  </span>
                )}
                {(step as string) === 'plan-selection'
                  ? 'Choose the cognitive capacity required for your workflows.'
                  : ''}
                {(step as string) === 'ghost-meeting'
                  ? 'Your first session. Experiencing the intelligence locally.'
                  : ''}
              </p>

              {step === 'auth' && (
                <div className="mt-8 lg:mt-12 grid grid-cols-2 gap-4 lg:gap-5 pr-4 lg:pr-8 pb-12">
                  <div className="group relative p-5 lg:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-violet-500/10 transition-all duration-300 overflow-hidden cursor-default flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <div className="relative z-10 flex items-center gap-3.5 mb-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 group-hover:scale-110 group-hover:bg-violet-500/20 transition-all duration-300 shadow-[inset_0_0_15px_rgba(139,92,246,0.1)] shrink-0">
                        <Layers className="text-violet-400" size={18} />
                      </div>
                      <h3 className="text-slate-200 font-semibold tracking-wide text-[14.5px] leading-tight">
                        Cognitive Substrate
                      </h3>
                    </div>
                    <p className="relative z-10 text-[13px] text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors mt-auto">
                      100% offline inference with zero external telemetry.
                    </p>
                  </div>

                  <div className="group relative p-5 lg:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-300 overflow-hidden cursor-default flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <div className="relative z-10 flex items-center gap-3.5 mb-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-300 shadow-[inset_0_0_15px_rgba(16,185,129,0.1)] shrink-0">
                        <Activity className="text-emerald-400" size={18} />
                      </div>
                      <h3 className="text-slate-200 font-semibold tracking-wide text-[14.5px] leading-tight">
                        Infinite Recall
                      </h3>
                    </div>
                    <p className="relative z-10 text-[13px] text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors mt-auto">
                      Continuous background ingestion and ambient retrieval.
                    </p>
                  </div>

                  <div className="group relative p-5 lg:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 overflow-hidden cursor-default flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <div className="relative z-10 flex items-center gap-3.5 mb-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all duration-300 shadow-[inset_0_0_15px_rgba(245,158,11,0.1)] shrink-0">
                        <GitMerge className="text-amber-400" size={18} />
                      </div>
                      <h3 className="text-slate-200 font-semibold tracking-wide text-[14.5px] leading-tight">
                        Agentic Action
                      </h3>
                    </div>
                    <p className="relative z-10 text-[13px] text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors mt-auto">
                      Autonomous workflow synthesis executed on-device.
                    </p>
                  </div>

                  <div className="group relative p-5 lg:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-sky-500/10 transition-all duration-300 overflow-hidden cursor-default flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <div className="relative z-10 flex items-center gap-3.5 mb-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 group-hover:scale-110 group-hover:bg-sky-500/20 transition-all duration-300 shadow-[inset_0_0_15px_rgba(14,165,233,0.1)] shrink-0">
                        <Landmark className="text-sky-400" size={18} />
                      </div>
                      <h3 className="text-slate-200 font-semibold tracking-wide text-[14.5px] leading-tight">
                        Data Sovereignty
                      </h3>
                    </div>
                    <p className="relative z-10 text-[13px] text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors mt-auto">
                      Cryptographically guaranteed single-tenant architecture.
                    </p>
                  </div>
                </div>
              )}

              {step === 'recovery-key' && (
                <div
                  className="mt-10 lg:mt-12 w-full animate-fade-in pr-6 lg:pr-12"
                  style={{ animationDelay: '0.2s' }}
                >
                  {/* Premium Security Enclave Wrapper */}
                  <div className="relative p-[1px] rounded-3xl bg-gradient-to-b from-white/[0.12] to-transparent shadow-[0_0_80px_rgba(16,185,129,0.05)] group/enclave">
                    <div className="absolute inset-0 bg-[#040812] rounded-3xl z-0" />
                    <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.03] to-amber-500/[0.03] rounded-3xl z-0" />

                    {/* Inner content */}
                    <div className="relative z-10 p-8 lg:p-10 flex flex-col gap-12">
                      {/* Item 1 */}
                      <div className="flex items-start gap-6 relative group">
                        {/* Connecting line to next item */}
                        <div className="absolute left-[27px] top-[60px] bottom-[-50px] w-[2px] bg-gradient-to-b from-emerald-500/30 to-amber-500/30 group-hover/enclave:from-emerald-400/50 group-hover/enclave:to-amber-400/50 transition-colors duration-700" />

                        <div className="relative shrink-0">
                          <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                          <div className="relative w-14 h-14 rounded-2xl bg-[#060d1a] border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[inset_0_0_20px_rgba(16,185,129,0.1)] group-hover:border-emerald-400/50 transition-colors duration-500">
                            <Unlock size={22} />
                          </div>
                        </div>

                        <div className="pt-0.5">
                          <div className="flex items-center gap-3 mb-2.5">
                            <h3 className="text-slate-200 font-semibold tracking-wide text-[16px]">
                              Zero-Knowledge Architecture
                            </h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                              Active
                            </span>
                          </div>
                          <p className="text-[14px] text-slate-400 leading-[1.8] group-hover:text-slate-300 transition-colors">
                            Your vault is encrypted locally with{' '}
                            <span className="font-mono text-emerald-300/90 text-[12px] bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              XChaCha20-Poly1305
                            </span>
                            . The server never sees your raw data.
                          </p>
                        </div>
                      </div>

                      {/* Item 2 */}
                      <div className="flex items-start gap-6 relative group">
                        <div className="relative shrink-0">
                          <div className="absolute inset-0 bg-amber-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                          <div className="relative w-14 h-14 rounded-2xl bg-[#060d1a] border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[inset_0_0_20px_rgba(245,158,11,0.1)] group-hover:border-amber-400/50 transition-colors duration-500">
                            <Key size={22} />
                          </div>
                        </div>

                        <div className="pt-0.5">
                          <div className="flex items-center gap-3 mb-2.5">
                            <h3 className="text-slate-200 font-semibold tracking-wide text-[16px]">
                              Non-Custodial Design
                            </h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                              Offline
                            </span>
                          </div>
                          <p className="text-[14px] text-slate-400 leading-[1.8] group-hover:text-slate-300 transition-colors">
                            This cryptographic seed never leaves your device unencrypted. We cannot
                            reset it or recover it for you.
                          </p>
                        </div>
                      </div>
                    </div>
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
                        : authError.includes('email confirmation') ||
                            authError.includes('check your')
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
                  <span className="text-slate-400 font-medium">Lose this — lose everything.</span>
                </p>
              </div>

              {/* Warning stripe */}
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

              {/* Word Grid — Vault container */}
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
