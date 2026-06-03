import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Key, AlertCircle } from 'lucide-react'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'

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

  const handleExportClick = useCallback(() => {
    setShowPasswordPrompt(true)
    setError('')
  }, [])

  const handlePasswordSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError('')
      setIsVerifying(true)

      try {
        if (password.length < 8) {
          setError('Invalid password')
          setIsVerifying(false)
          return
        }

        const res = await window.electronAPI?.auth?.generateRecoveryKey()

        if (!res?.success || !res.data?.phrase) {
          setError(res?.error?.message || 'Failed to generate recovery key')
          setIsVerifying(false)
          return
        }

        setRecoveryPhrase(res.data.phrase)
        setShowRecoveryKey(true)
        setShowPasswordPrompt(false)
        setPassword('')
      } catch (err) {
        log.error('Recovery key generation failed:', err)
        setError('An unexpected error occurred. Please try again.')
      } finally {
        setIsVerifying(false)
      }
    },
    [password]
  )

  const handleCopyToClipboard = useCallback(async () => {
    const phrase = recoveryPhrase.join(' ')
    try {
      await navigator.clipboard.writeText(phrase)
      setCopied(true)

      // Clear any existing timers so rapid clicking doesn't cause glitching
      timerRefs.current.forEach(clearTimeout)
      timerRefs.current = []

      const timer = setTimeout(() => setCopied(false), 3000)
      timerRefs.current.push(timer)
    } catch (error) {
      log.error('Failed to copy to clipboard:', error)
    }
  }, [recoveryPhrase])

  const handleSaveAsFile = useCallback(() => {
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
  }, [recoveryPhrase, userId])

  const handleClose = useCallback(() => {
    setShowRecoveryKey(false)
    setRecoveryPhrase([])
    setPassword('')
    setError('')
  }, [])

  const handleCancelPassword = useCallback(() => {
    setShowPasswordPrompt(false)
    setPassword('')
    setError('')
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex justify-between items-center pl-4 pr-2 mb-3">
          <div>
            <h4 className="text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Security
            </h4>
            <p className="text-[11px] text-[var(--color-text-quaternary)] mt-0.5">
              Manage your emergency account recovery phrase
            </p>
          </div>
        </div>

        <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
          <div className="flex flex-col gap-2">
            {!showPasswordPrompt && !showRecoveryKey && (
              <>
                <div className="px-6 py-5 border border-[var(--color-border-subtle)] bg-white/[0.01] hover:bg-white/[0.03] rounded-[var(--radius-xl)] flex items-center justify-between gap-4 transition-all duration-300 shadow-sm animate-slide-up">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-[var(--radius-lg)] shadow-inner bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      <Key size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-[var(--color-text-primary)]">
                        Recovery Key
                      </div>
                      <div className="text-[11px] text-[var(--color-text-tertiary)] mt-1 font-medium tracking-wider">
                        A 24-word phrase to recover your account if you forget your password.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Button variant="secondary" size="sm" onClick={handleExportClick}>
                      Export Key
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 px-6 py-4 rounded-[var(--radius-xl)] bg-amber-500/10 border border-amber-500/20 shadow-inner animate-slide-up mt-1">
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-[var(--radius-lg)] bg-amber-500/20 border border-amber-500/30 shadow-inner">
                    <AlertCircle size={18} className="text-amber-600 dark:text-amber-500" />
                  </div>
                  <div className="text-amber-600 dark:text-amber-500 text-[12px] leading-snug font-medium min-w-0 flex-1 pr-4">
                    Keep your recovery key safe. Anyone with access to it can recover your account.
                  </div>
                </div>
              </>
            )}

            {showPasswordPrompt && (
              <div className="p-6 border border-[var(--color-border-subtle)] bg-white/[0.02] rounded-[var(--radius-xl)] flex flex-col gap-4 overflow-hidden shadow-sm animate-slide-up">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                    <div className="p-1.5 bg-[var(--color-accent-primary)]/10 rounded-lg">
                      <Key size={16} className="text-[var(--color-accent-primary)]" />
                    </div>
                    Confirm Your Password
                  </h4>
                </div>

                <p className="text-[12px] text-[var(--color-text-secondary)]">
                  Enter your password to view your recovery key.
                </p>

                <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4 mt-2">
                  <div className="bg-black/40 border border-[var(--color-border-subtle)] rounded-xl p-1 flex items-center shadow-inner focus-within:border-[var(--color-accent-primary)] focus-within:ring-1 focus-within:ring-[var(--color-accent-primary)] transition-all">
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="flex-1 bg-transparent px-4 py-2.5 text-[13px] text-[var(--color-text-primary)] focus:outline-none placeholder:text-[var(--color-text-quaternary)] font-mono"
                      autoFocus
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12px]">
                      <AlertCircle size={14} />
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end items-center gap-2 mt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleCancelPassword}
                      disabled={isVerifying}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={!password || isVerifying}
                    >
                      {isVerifying ? 'Verifying...' : 'Confirm'}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {showRecoveryKey && recoveryPhrase.length > 0 && (
              <div className="p-6 border border-[var(--color-border-subtle)] bg-white/[0.02] rounded-[var(--radius-xl)] flex flex-col gap-5 overflow-hidden shadow-sm animate-slide-up">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                    <div className="p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <Key size={16} className="text-amber-500" />
                    </div>
                    Your Recovery Key
                  </h4>
                  <IconButton
                    icon={<span style={{ fontSize: 12 }}>✕</span>}
                    onClick={handleClose}
                    tooltip="Close"
                  />
                </div>

                <div className="flex items-start gap-4 px-6 py-5 rounded-[var(--radius-xl)] bg-amber-500/10 border border-amber-500/20 shadow-inner mt-1">
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-[var(--radius-lg)] bg-amber-500/20 border border-amber-500/30 shadow-inner">
                    <AlertCircle size={18} className="text-amber-600 dark:text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5 text-[12px] leading-relaxed">
                    <strong className="block mb-0.5 font-semibold text-amber-700 dark:text-amber-400">
                      Keep this safe!
                    </strong>
                    <span className="opacity-90 text-amber-700/80 dark:text-amber-500/80">
                      Anyone with this recovery key can access your encrypted data.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full mt-2">
                  {recoveryPhrase.map((word, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-black/40 border border-[var(--color-border-subtle)] px-4 py-2.5 rounded-xl font-mono text-[13px] shadow-inner"
                    >
                      <span className="text-[var(--color-text-quaternary)] text-[10px] select-none font-bold">
                        {(i + 1).toString().padStart(2, '0')}
                      </span>
                      <span className="text-[var(--color-text-secondary)] font-medium select-all tracking-wider">
                        {word}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 w-full mt-4">
                  <Button variant="secondary" size="sm" onClick={handleCopyToClipboard}>
                    {copied ? '✓ Copied!' : 'Copy to Clipboard'}
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleSaveAsFile}>
                    Save as File
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
