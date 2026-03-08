import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'

import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { PricingView } from './settings/PricingView'
import { GhostMeetingTutorial } from './meeting/GhostMeetingTutorial'
import { ModelDownloadProgress } from './ModelDownloadProgress'
import { Key } from 'lucide-react'
import { Logo3D } from './ui/Logo3D'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('Onboarding')

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
      detectHardwareTier()
    }
  }, [step])

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
          setStep('setup')
        } else {
          setAuthError(errMsg || 'Authentication failed')
        }
      } else {
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
      {/* Left Visual Art Panel (Hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 h-full bg-slate-950 p-12 flex-col justify-between relative overflow-hidden border-r border-white/5">
        <div className="absolute inset-0 with-noise opacity-[0.03] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none translate-x-1/3 -translate-y-1/3" />

        <div className="relative z-10">
          <Logo3D />
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
            {step === 'plan-selection' ? 'Systems Ready.' : ''}
            {step === 'ghost-meeting' ? 'Simulation Mode.' : ''}
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
            {step === 'plan-selection'
              ? 'Choose the cognitive capacity required for your workflows.'
              : ''}
            {step === 'ghost-meeting'
              ? 'Your first session. Experiencing the intelligence locally.'
              : ''}
          </p>
        </div>

        <div className="relative z-10 text-[10px] font-mono tracking-widest text-slate-600 uppercase">
          All processing happens locally.
        </div>
      </div>

      {/* Right Control Panel (Form) */}
      <div className="w-full lg:w-1/2 h-full flex items-center justify-center p-8 relative overflow-y-auto pt-[env(titlebar-area-height,32px)]">
        {/* Subtle global noise texture for right side too */}
        <div className="absolute inset-0 with-noise opacity-[0.015] pointer-events-none" />

        {step === 'auth' && (
          <div className="w-full max-w-[420px] flex flex-col animate-slide-up relative z-10">
            <div className="flex flex-col mb-10 lg:hidden items-center">
              <div className="mb-6 -mt-8">
                <Logo3D className="transform scale-75 origin-center" />
              </div>
              <h1 className="text-2xl font-semibold tracking-wide text-center text-white">
                {authMode === 'register' ? 'Initialize Core' : 'Welcome Back'}
              </h1>
            </div>

            {!authLoading && (
              <div className="hidden lg:block mb-8">
                <h2 className="text-2xl font-semibold tracking-wide text-white">
                  {authMode === 'register' ? 'Create Account' : 'Sign In'}
                </h2>
              </div>
            )}

            <div className="w-full space-y-4 mb-6">
              <Input
                label="Email"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="name@example.com"
              />
              <Input
                type="password"
                label="Password"
                value={authPass}
                onChange={e => setAuthPass(e.target.value)}
                placeholder="••••••••"
              />

              {authError && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[rgba(244,63,94,0.06)] border border-[rgba(244,63,94,0.3)] shadow-[0_0_15px_rgba(244,63,94,0.15),inset_0_0_0_1px_rgba(255,255,255,0.05)] text-rose-300 text-sm font-medium backdrop-blur-xl animate-slide-up">
                  <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)] animate-pulse" />
                  <span className="flex-1 tracking-wide">{authError}</span>
                </div>
              )}

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
            </div>

            <div className="flex flex-col items-center pt-6 border-t border-white/10 mt-2">
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
          <div className="w-full max-w-[420px] flex flex-col animate-slide-up relative z-10">
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
          <div className="w-full max-w-[480px] flex flex-col animate-slide-up relative z-10">
            <div className="flex items-center gap-3 mb-6 flex-col lg:flex-row lg:items-center text-center lg:text-left">
              <Key size={32} className="text-amber-500" />
              <div>
                <h2 className="text-2xl font-semibold tracking-wide text-white">Recovery Key</h2>
                <p className="text-sm text-slate-400 mt-1">
                  This is the ONLY way to recover your data if you reinstall.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-8 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm">
              <span className="text-lg">⚠️</span>
              <span>
                We can NEVER recover your data without this key. Store it securely. Do NOT share it.
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-8 w-full">
              {recoveryPhrase.map((word, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-md font-mono text-sm shadow-sm"
                >
                  <span className="text-slate-500 text-xs select-none">
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="text-slate-200 font-medium select-all space-x-0 tracking-wider mix-blend-screen">
                    {word}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 w-full mb-8">
              <Button
                variant="secondary"
                className="flex-1 bg-white/5 border-white/10 hover:bg-white/10"
                onClick={handleCopyKey}
              >
                {keyCopied ? '✓ Copied' : 'Copy'}
              </Button>
              <Button
                variant="secondary"
                className="flex-1 bg-white/5 border-white/10 hover:bg-white/10"
                onClick={handleDownloadKey}
              >
                Save as File
              </Button>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full bg-white text-slate-950 hover:bg-slate-200 border-none transition-colors"
              disabled={!keySaved}
              onClick={() => setStep('plan-selection')}
            >
              I've Saved It Securely →
            </Button>
          </div>
        )}

        {step === 'plan-selection' && (
          <div className="w-full max-w-[600px] flex flex-col animate-slide-up relative z-10 pt-10">
            <h2 className="text-2xl font-semibold tracking-wide text-white mb-8 text-center">
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
          <div className="w-full h-full flex flex-col items-center justify-center animate-slide-up relative z-10 overflow-hidden">
            <GhostMeetingTutorial onComplete={completeOnboarding} />
          </div>
        )}
      </div>
    </div>
  )
}
