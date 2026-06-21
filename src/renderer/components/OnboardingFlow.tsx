import { useNavigationStore } from '../store/navigationStore'
import React, { useEffect, useRef, useState } from 'react'
import { useMotionValue, useMotionTemplate } from 'framer-motion'

import { Button } from './ui/Button'
import { PricingView } from './settings/PricingView'
import { GhostMeetingTutorial } from './meeting/GhostMeetingTutorial'
import { OnboardingAuthPanel } from './onboarding/OnboardingAuthPanel'
import { OnboardingSetupPanel, HardwareTierInfo } from './onboarding/OnboardingSetupPanel'
import { OnboardingRecoveryPanel } from './onboarding/OnboardingRecoveryPanel'
import { OnboardingArtPanel } from './onboarding/OnboardingArtPanel'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('Onboarding')

export type OnboardingStep = 'auth' | 'setup' | 'recovery-key' | 'plan-selection' | 'ghost-meeting'

export const OnboardingFlow: React.FC = () => {
  const [step, setStep] = useState<OnboardingStep>('auth')
  const [themeColor, setThemeColor] = useState<'emerald' | 'amber' | 'violet' | 'sky'>('emerald')
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
      'Sovereign Recovery Key',
      '=========================',
      '',
      'Keep this secure. If you lose your password, you will need this key to recover your encrypted data. It is PERMANENTLY UNRECOVERABLE if you lose your password.',
      '',
      'Recovery Key:',
      recoveryPhrase.join(' '),
      '',
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sovereign-recovery-${Date.now()}.txt`
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
    useNavigationStore.getState().navigate('meeting-list')
  }

  return (
    <div
      className="w-full h-full flex bg-[#020617] text-[var(--color-text-primary)] relative"
      onPointerMove={handlePointerMove}
    >
      {/* Left Visual Art Panel (Hidden on mobile, and hidden during wide steps) */}
      {step !== 'plan-selection' && step !== 'ghost-meeting' && (
        <OnboardingArtPanel
          step={step}
          authMode={authMode}
          spotlightBackground={spotlightBackground}
          themeColor={themeColor}
          setThemeColor={setThemeColor}
        />
      )}

      {/* Right Control Panel (Form) */}
      <div
        className={`w-full ${step === 'plan-selection' || step === 'ghost-meeting' ? '' : 'lg:w-5/12 xl:w-2/5'} h-full flex items-center justify-center p-8 relative overflow-y-auto pt-[env(titlebar-area-height,32px)]`}
      >
        {/* Subtle global noise texture for right side too */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-[#02040a] to-[#02040a]" />

        <div className="w-full flex flex-col items-center justify-center my-auto relative z-10">
          {step === 'auth' && (
            <OnboardingAuthPanel
              authMode={authMode}
              setAuthMode={setAuthMode}
              authEmail={authEmail}
              setAuthEmail={setAuthEmail}
              authPass={authPass}
              setAuthPass={setAuthPass}
              authError={authError}
              setAuthError={setAuthError}
              authLoading={authLoading}
              handleAuth={handleAuth}
            />
          )}

          {step === 'setup' && (
            <OnboardingSetupPanel
              isDownloading={isDownloading}
              tierInfo={tierInfo}
            />
          )}

          {step === 'recovery-key' && (
            <OnboardingRecoveryPanel
              keySaved={keySaved}
              recoveryError={recoveryError}
              setRecoveryError={setRecoveryError}
              recoveryPhrase={recoveryPhrase}
              setRecoveryPhrase={setRecoveryPhrase}
              keyCopied={keyCopied}
              handleCopyKey={handleCopyKey}
              handleDownloadKey={handleDownloadKey}
              onComplete={() => setStep('plan-selection')}
            />
          )}

          {step === 'plan-selection' && (
            <div className="w-full max-w-[1200px] flex flex-col items-center relative z-10 pt-10 pb-20">
              <div className="flex flex-col items-center mb-12 animate-fade-in">
                <h2 className="text-[2rem] font-light tracking-[0.2em] uppercase text-white mb-4 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                  Cognitive Capacity
                </h2>
                <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent mb-6"></div>
                <p className="text-slate-400 font-light tracking-wider text-[0.9rem] max-w-lg text-center leading-relaxed">
                  Provision your local node and configure networked synchronization capabilities.
                </p>
              </div>
              <PricingView onPlanSelect={() => setStep('ghost-meeting')} />
              <Button
                variant="primary"
                size="lg"
                onClick={() => setStep('ghost-meeting')}
                className="w-full max-w-md mt-12 py-5 rounded-2xl bg-white text-slate-950 font-bold tracking-widest uppercase text-[0.8rem] hover:bg-slate-200 border-none transition-all duration-500 shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.3)] hover:-translate-y-1"
              >
                Initialize Architecture
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
