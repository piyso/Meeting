import React, { useState, useRef, useEffect } from 'react'
import { Key } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Badge } from './ui/Badge'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('RecoveryKey')

export interface RecoveryKeySettingsProps {
  userId: string
}

export const RecoveryKeySettings: React.FC<RecoveryKeySettingsProps> = ({ userId }) => {
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [recoveryPhrase, setRecoveryPhrase] = useState<string[]>([])
  const [showRecoveryKey, setShowRecoveryKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([])

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timerRefs.current
    return () => {
      timers.forEach(clearTimeout)
    }
  }, [])

  const handleExportClick = () => {
    setShowPasswordPrompt(true)
    setError('')
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsVerifying(true)

    // In production, this would verify the password and retrieve the recovery phrase
    const timer = setTimeout(() => {
      if (password.length < 8) {
        setError('Invalid password')
        setIsVerifying(false)
        return
      }

      // Mock recovery phrase
      const mockPhrase = [
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
        'account',
        'accuse',
        'achieve',
        'acid',
        'acoustic',
        'acquire',
        'across',
        'act',
        'action',
        'actor',
        'actress',
        'actual',
      ]

      setRecoveryPhrase(mockPhrase)
      setShowRecoveryKey(true)
      setShowPasswordPrompt(false)
      setPassword('')
      setIsVerifying(false)
    }, 1000)
    timerRefs.current.push(timer)
  }

  const handleCopyToClipboard = async () => {
    const phrase = recoveryPhrase.join(' ')
    try {
      await navigator.clipboard.writeText(phrase)
      setCopied(true)
      const timer = setTimeout(() => setCopied(false), 3000)
      timerRefs.current.push(timer)
    } catch (error) {
      log.error('Failed to copy to clipboard:', error)
    }
  }

  const handleSaveAsFile = () => {
    const phrase = recoveryPhrase.join(' ')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `bluearkive-recovery-key-${timestamp}.txt`

    const content = `BlueArkive Recovery Key\nGenerated: ${new Date().toISOString()}\nUser ID: ${userId}\n\n⚠️ CRITICAL: Store this recovery key in a safe place!\nWithout this key, your encrypted data is PERMANENTLY UNRECOVERABLE if you lose your password.\n\nRecovery Key:\n${phrase}\n`

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleClose = () => {
    setShowRecoveryKey(false)
    setRecoveryPhrase([])
    setPassword('')
    setError('')
  }

  const handleCancelPassword = () => {
    setShowPasswordPrompt(false)
    setPassword('')
    setError('')
  }

  return (
    <div className="w-full h-full flex flex-col pt-4">
      {!showPasswordPrompt && !showRecoveryKey && (
        <div className="w-full max-w-[600px] surface-glass-premium p-8 rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] flex flex-col animate-slide-up shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <Key size={28} className="text-[var(--color-text-primary)]" />
            <div>
              <h3 className="text-xl font-semibold tracking-wide text-[var(--color-text-primary)]">
                Recovery Key
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                Your recovery key is a 24-word phrase used to recover your account if you forget
                your password.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-8 p-3 rounded-lg bg-[rgba(251,191,36,0.1)] border border-[var(--color-amber)]/20 text-[var(--color-amber)] text-sm">
            <span className="text-lg">⚠️</span>
            <span>
              Keep your recovery key safe. Anyone with access to it can recover your account.
            </span>
          </div>

          <Button variant="primary" onClick={handleExportClick} className="self-start">
            Export Recovery Key
          </Button>
        </div>
      )}

      {showPasswordPrompt && (
        <div className="w-full max-w-[480px] surface-glass-premium p-8 rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] flex flex-col animate-slide-up shadow-2xl">
          <h3 className="text-xl font-semibold tracking-wide text-[var(--color-text-primary)] mb-2">
            Confirm Your Password
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Enter your password to view your recovery key.
          </p>

          <form onSubmit={handlePasswordSubmit} className="flex flex-col space-y-6">
            <Input
              type="password"
              label="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoFocus
            />

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
                onClick={handleCancelPassword}
                disabled={isVerifying}
                className="flex-1 bg-white/5 border-white/10 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!password || isVerifying}
                className="flex-1"
              >
                {isVerifying ? 'Verifying...' : 'Confirm'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {showRecoveryKey && recoveryPhrase.length > 0 && (
        <div className="w-full max-w-[600px] surface-glass-premium p-8 rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] flex flex-col animate-slide-up shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <Key size={28} className="text-[var(--color-amber)]" />
              <h3 className="text-xl font-semibold tracking-wide text-[var(--color-text-primary)]">
                Your Recovery Key
              </h3>
            </div>
            <button
              onClick={handleClose}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors bg-white/5 p-2 rounded-md hover:bg-white/10"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-3 mb-8 p-3 rounded-lg bg-[rgba(251,191,36,0.1)] border border-[var(--color-amber)]/20 text-[var(--color-amber)] text-sm leading-relaxed">
            <span className="text-lg">⚠️</span>
            <div>
              <strong className="block mb-1">Keep this safe!</strong>
              <span>Anyone with this recovery key can access your encrypted data.</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-8 w-full">
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

          <div className="flex gap-3 w-full">
            <Button
              variant="secondary"
              className="flex-1 bg-white/5 border-white/10 hover:bg-white/10"
              onClick={handleCopyToClipboard}
            >
              {copied ? '✓ Copied!' : 'Copy to Clipboard'}
            </Button>
            <Button
              variant="secondary"
              className="flex-1 bg-white/5 border-white/10 hover:bg-white/10"
              onClick={handleSaveAsFile}
            >
              Save as File
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
