import React, { useState, useRef, useEffect } from 'react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Badge } from './ui/Badge'
import { KeyRound, ShieldCheck } from 'lucide-react'

export interface RecoverAccountProps {
  onRecoveryComplete: () => void
  onCancel: () => void
}

export const RecoverAccount: React.FC<RecoverAccountProps> = ({ onRecoveryComplete, onCancel }) => {
  const [step, setStep] = useState<'phrase' | 'password'>('phrase')
  const [recoveryPhrase, setRecoveryPhrase] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([])

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timerRefs.current
    return () => {
      timers.forEach(clearTimeout)
    }
  }, [])

  const handlePhraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsValidating(true)

    // Validate recovery phrase format
    const words = recoveryPhrase.trim().split(/\s+/)
    if (words.length !== 24) {
      setError(`Recovery phrase must contain exactly 24 words (found ${words.length})`)
      setIsValidating(false)
      return
    }

    // In production, this would call RecoveryPhraseService.verifyRecoveryPhrase()
    const timer = setTimeout(() => {
      setIsValidating(false)
      setStep('password')
    }, 1000)
    timerRefs.current.push(timer)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Validate password strength
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    // In production, this would call RecoveryPhraseService.recoverAccount()
    setIsValidating(true)
    const timer = setTimeout(() => {
      setIsValidating(false)
      onRecoveryComplete()
    }, 1500)
    timerRefs.current.push(timer)
  }

  const handlePhraseChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRecoveryPhrase(e.target.value)
    setError('')
  }

  const wordCount = recoveryPhrase
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length

  return (
    <div className="w-full flex justify-center py-10 px-4">
      <div className="w-full max-w-[500px] surface-glass-premium p-8 rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] flex flex-col shadow-2xl animate-slide-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-glass)] border border-[var(--color-border-subtle)] flex items-center justify-center mb-4">
            {step === 'phrase' ? (
              <KeyRound size={24} className="text-[var(--color-text-primary)]" />
            ) : (
              <ShieldCheck size={24} className="text-[var(--color-emerald)]" />
            )}
          </div>
          <h2 className="text-2xl font-semibold tracking-wide text-[var(--color-text-primary)]">
            Recover Your Account
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2 text-center">
            {step === 'phrase'
              ? 'Enter your 24-word recovery key to reset your password.'
              : 'Securely encrypted. Set a strong new password.'}
          </p>
        </div>

        {step === 'phrase' && (
          <form onSubmit={handlePhraseSubmit} className="flex flex-col space-y-6">
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center px-1">
                <label
                  htmlFor="recovery-phrase"
                  className="text-sm font-medium text-[var(--color-text-secondary)]"
                >
                  Recovery Key (24 words)
                </label>
                <div
                  className={`text-xs font-mono font-medium ${wordCount === 24 ? 'text-[var(--color-emerald)]' : wordCount > 24 ? 'text-rose-400' : 'text-slate-500'}`}
                >
                  {wordCount} / 24
                </div>
              </div>
              <textarea
                id="recovery-phrase"
                className="w-full surface-glass-premium bg-transparent border border-[var(--color-border-subtle)] rounded-xl p-4 text-[var(--color-text-primary)] text-sm font-mono leading-relaxed focus:outline-none focus:border-[var(--color-violet)] focus:shadow-[0_0_0_1px_var(--color-glow-violet)] transition-all resize-none"
                value={recoveryPhrase}
                onChange={handlePhraseChange}
                placeholder="abandon ability able about above absent absorb abstract absurd abuse access accident..."
                rows={6}
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                <Badge variant="error" className="border-none bg-transparent px-0 w-4 h-4">
                  !
                </Badge>
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={isValidating}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={wordCount !== 24 || isValidating}
                className="flex-1"
              >
                {isValidating ? 'Validating...' : 'Continue'}
              </Button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col space-y-6">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-2">
              <span>✓</span>
              <span>Recovery key validated successfully</span>
            </div>

            <Input
              type="password"
              label="New Password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              autoFocus
            />

            <Input
              type="password"
              label="Confirm Password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                <Badge variant="error" className="border-none bg-transparent px-0 w-4 h-4">
                  !
                </Badge>
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('phrase')}
                disabled={isValidating}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!newPassword || !confirmPassword || isValidating}
                className="flex-[2]"
              >
                {isValidating ? 'Recovering...' : 'Reset Password'}
              </Button>
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-[var(--color-border-subtle)] text-xs text-[var(--color-text-tertiary)] flex flex-col gap-2">
          <p className="font-medium text-[var(--color-text-secondary)]">Security Note</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Your recovery key is the ONLY way to access encrypted data.</li>
            <li>Maintain exact spacing between the 24 words.</li>
            <li>Lost keys cannot be recovered under any circumstances.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
