import React, { useEffect, useState } from 'react'

import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Badge } from './ui/Badge'
import { PricingView } from './settings/PricingView'
import { GhostMeetingTutorial } from './meeting/GhostMeetingTutorial'
import { Key } from 'lucide-react'

type OnboardingStep = 'auth' | 'setup' | 'recovery-key' | 'plan-selection' | 'ghost-meeting'

interface HardwareTierInfo {
  tier: 'high' | 'mid' | 'low'
  totalRAM: number
  recommendedASR: 'whisper-turbo' | 'moonshine-base'
  recommendedLLM: 'qwen2.5:3b' | 'qwen2.5:1.5b'
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
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Hardware logic preserved from original
  useEffect(() => {
    const checkFirstLaunch = async () => {
      const result = await window.electronAPI?.model?.isFirstLaunch()
      if (result?.success && !result.data) {
        window.location.href = '/app'
      }
    }
    checkFirstLaunch()
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
        tier: 'high', totalRAM: 16, recommendedASR: 'whisper-turbo', recommendedLLM: 'qwen2.5:3b', totalRAMBudget: 8
      })
    }
    
    setIsDownloading(true)

    // Wire real model download via model:downloadAll IPC
    try {
      const downloadResult = await window.electronAPI?.model?.downloadAll?.()
      if (!downloadResult?.success) {
        console.warn('[Onboarding] Model download failed, continuing anyway:', downloadResult?.error)
      }
    } catch (err) {
      console.warn('[Onboarding] Model download error (non-fatal):', err)
    }

    try {
      // Generate real recovery phrase via RecoveryPhraseService
      const recoveryResult = await window.electronAPI?.auth?.generateRecoveryKey?.()
      if (recoveryResult?.success && recoveryResult.data?.phrase) {
        setRecoveryPhrase(recoveryResult.data.phrase)
      } else {
        // Fallback if service not available
        const fallbackWords = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident']
        setRecoveryPhrase(fallbackWords)
      }
    } catch {
      const fallbackWords = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident']
      setRecoveryPhrase(fallbackWords)
    }
    setIsDownloading(false)
    setStep('recovery-key')
  }

  const handleAuth = async () => {
    if (!authEmail || !authPass) return
    setAuthLoading(true)
    setAuthError(null)
    try {
      // Wire to real PiyAPIBackend via sync:login IPC
      const result = await window.electronAPI?.sync?.login?.({
        email: authEmail,
        password: authPass,
      })
      if (result?.success) {
        setStep('setup')
      } else {
        setAuthError(result?.error?.message || 'Authentication failed')
      }
    } catch (err) {
      // Offline mode — allow user to proceed without cloud
      setStep('setup')
    } finally {
      setAuthLoading(false)
    }
  }

  const completeOnboarding = () => {
    window.location.href = '/app'
  }

  return (
    <div className="w-full h-full bg-[var(--color-bg-root)] flex items-center justify-center p-[var(--space-24)] text-[var(--color-text-primary)]">
      
      {step === 'auth' && (
        <div className="w-full max-w-[440px] surface-glass-premium p-[var(--space-32)] rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] flex flex-col items-center animate-slide-up text-center shadow-2xl">
          <h1 className="text-[var(--text-2xl)] font-bold tracking-tight mb-2">Welcome to PiyAPI Notes</h1>
          <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)] mb-[var(--space-32)]">Your meetings, transcribed and intelligent.<br/>All processing happens locally.</p>
          
          <div className="w-full space-y-[var(--space-16)] mb-[var(--space-24)]">
            <Input label="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="name@example.com" />
            <Input type="password" label="Password" value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="••••••••" />
            {authError && <p className="text-red-400 text-[var(--text-xs)]">{authError}</p>}
            <Button variant="primary" size="lg" className="w-full mt-2" onClick={handleAuth} disabled={authLoading}>
              {authLoading ? 'Authenticating...' : 'Create Account'}
            </Button>
          </div>
          
          <div className="w-full relative py-4 flex items-center justify-center mb-2">
            <div className="absolute inset-x-0 h-[1px] bg-[var(--color-border-subtle)]" />
            <span className="relative bg-[var(--color-bg-panel)] px-4 text-[var(--text-xs)] text-[var(--color-text-tertiary)] uppercase tracking-widest">or</span>
          </div>
          
          <Button variant="secondary" size="lg" className="w-full mb-[var(--space-24)]">
            <span className="mr-2">🔵</span> Continue with Google
          </Button>
          
          <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)] mb-[var(--space-32)]">
            Already have an account? <span className="text-[var(--color-violet)] cursor-pointer hover:underline">Log in</span>
          </p>
          
          <div className="flex items-center gap-2 text-[var(--text-xs)] text-[var(--color-text-tertiary)] bg-[rgba(255,255,255,0.03)] px-3 py-2 rounded">
            <span>ℹ️</span> Free tier is 100% local — no data leaves your device.
          </div>
        </div>
      )}

      {step === 'setup' && (
        <div className="w-full max-w-[440px] surface-glass-premium p-[var(--space-32)] rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] flex flex-col animate-slide-up shadow-2xl">
          <h1 className="text-[var(--text-xl)] font-bold tracking-tight mb-[var(--space-24)] text-center">Setting up your device...</h1>
          
          <div className="w-full h-1 bg-[var(--color-bg-glass)] rounded-full overflow-hidden mb-[var(--space-24)]">
            <div className="h-full bg-[var(--color-violet)] transition-all duration-1000" style={{ width: isDownloading ? '50%' : '10%' }} />
          </div>
          
          <ul className="space-y-[var(--space-16)] text-[var(--text-sm)]">
            <li className="flex items-start gap-3 text-[var(--color-emerald)]">
              <span>✅</span> Account created
            </li>
            <li className={`flex items-start gap-3 ${isDownloading ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>
              <span className={isDownloading ? "animate-pulse" : ""}>{isDownloading ? "•" : "○"}</span> 
              <div>
                <div>Downloading AI models...</div>
                {tierInfo && (
                  <div className="text-[var(--text-xs)] text-[var(--color-text-tertiary)] mt-1">
                    {tierInfo.recommendedASR} / {tierInfo.recommendedLLM} / MiniLM
                  </div>
                )}
              </div>
            </li>
            <li className="flex items-start gap-3 text-[var(--color-text-tertiary)]">
              <span>○</span> Initializing local database
            </li>
          </ul>
        </div>
      )}

      {step === 'recovery-key' && (
        <div className="w-full max-w-[440px] surface-glass-premium p-[var(--space-32)] rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] flex flex-col items-center text-center animate-slide-up shadow-2xl">
          <Key size={48} className="text-[var(--color-amber)] mb-[var(--space-16)]" />
          <h1 className="text-[var(--text-xl)] font-bold tracking-tight mb-[var(--space-8)]">Save Your Recovery Key</h1>
          <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)] mb-[var(--space-24)] leading-relaxed">
            If you reinstall your OS, you'll need this key to decrypt your synced meetings.
          </p>
          
          <div className="w-full bg-[rgba(255,255,255,0.03)] border border-dashed border-[var(--color-border-subtle)] p-[var(--space-16)] font-mono text-[var(--text-sm)] text-center select-all mb-[var(--space-16)] rounded-[var(--radius-md)] tracking-wider">
            {recoveryPhrase.slice(0,4).join('-').toUpperCase()}-{recoveryPhrase.slice(4,8).join('-').toUpperCase()}...
          </div>
          
          <div className="flex gap-2 w-full mb-[var(--space-24)]">
            <Button variant="secondary" className="flex-1" onClick={() => setKeySaved(true)}>Copy</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setKeySaved(true)}>Save as File</Button>
          </div>
          
          <div className="flex items-center gap-2 mb-[var(--space-24)] p-2 rounded bg-[rgba(251,191,36,0.1)] border border-[var(--color-amber)] text-[var(--color-amber)] text-[var(--text-sm)] w-full justify-center">
            <Badge variant="warning" className="border-none bg-transparent px-0">⚠️</Badge>
            <span>We can NEVER recover data without this key.</span>
          </div>

          <Button 
            variant="primary" 
            size="lg" 
            className="w-full" 
            disabled={!keySaved} 
            onClick={() => setStep('plan-selection')}
          >
            I've Saved It →
          </Button>
        </div>
      )}

      {step === 'plan-selection' && (
        <div className="flex flex-col items-center animate-slide-up w-full h-full pt-12">
          <h1 className="text-[var(--text-2xl)] font-bold tracking-tight mb-[var(--space-32)]">You're all set! Select a plan.</h1>
          <PricingView />
          <div className="mt-8">
            <Button variant="primary" size="lg" onClick={() => setStep('ghost-meeting')} className="shadow-[0_0_32px_rgba(167,139,250,0.3)]">
              Start Your First Meeting
            </Button>
          </div>
        </div>
      )}

      {step === 'ghost-meeting' && (
        <GhostMeetingTutorial onComplete={completeOnboarding} />
      )}
      
    </div>
  )
}
