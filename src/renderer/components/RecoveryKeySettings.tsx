/**
 * Recovery Key Settings Component
 *
 * Allows users to view and export their recovery key from settings.
 * Requires password confirmation before displaying the recovery key.
 */

import React, { useState } from 'react'
import './RecoveryKeySettings.css'

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

  const handleExportClick = () => {
    setShowPasswordPrompt(true)
    setError('')
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsVerifying(true)

    // In production, this would verify the password and retrieve the recovery phrase
    // For now, simulate verification
    setTimeout(() => {
      if (password.length < 8) {
        setError('Invalid password')
        setIsVerifying(false)
        return
      }

      // Mock recovery phrase (in production, retrieve from keytar or regenerate)
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
  }

  const handleCopyToClipboard = async () => {
    const phrase = recoveryPhrase.join(' ')
    try {
      await navigator.clipboard.writeText(phrase)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      alert('Failed to copy to clipboard. Please copy manually.')
    }
  }

  const handleSaveAsFile = () => {
    const phrase = recoveryPhrase.join(' ')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `piyapi-notes-recovery-key-${timestamp}.txt`

    const content = `PiyAPI Notes Recovery Key
Generated: ${new Date().toISOString()}
User ID: ${userId}

⚠️ CRITICAL: Store this recovery key in a safe place!
Without this key, your encrypted data is PERMANENTLY UNRECOVERABLE if you lose your password.

Recovery Key:
${phrase}

Instructions:
1. Write this recovery key on paper and store it securely
2. Never share this key with anyone
3. Keep multiple copies in different secure locations
4. Do not store this key digitally (email, cloud storage, etc.)

To recover your account:
1. Open PiyAPI Notes
2. Click "Forgot Password"
3. Enter this 24-word recovery key
4. Set a new password
`

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

  // Format words into 3 columns of 8 rows
  const formatWords = () => {
    const columns: string[][] = [[], [], []]
    recoveryPhrase.forEach((word, index) => {
      const col = Math.floor(index / 8)
      columns[col]!.push(word)
    })
    return columns
  }

  return (
    <div className="recovery-key-settings">
      {!showPasswordPrompt && !showRecoveryKey && (
        <div className="recovery-key-info">
          <h3>Recovery Key</h3>
          <p className="info-text">
            Your recovery key is a 24-word phrase that can be used to recover your account if you
            forget your password.
          </p>
          <div className="warning-box">
            <span className="warning-icon">⚠️</span>
            <span>
              Keep your recovery key safe. Anyone with access to it can recover your account.
            </span>
          </div>
          <button className="export-button" onClick={handleExportClick}>
            Export Recovery Key
          </button>
        </div>
      )}

      {showPasswordPrompt && (
        <div className="password-prompt">
          <h3>Confirm Your Password</h3>
          <p className="prompt-text">Enter your password to view your recovery key</p>

          <form onSubmit={handlePasswordSubmit}>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="password-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
              />
            </div>

            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={handleCancelPassword}
                disabled={isVerifying}
              >
                Cancel
              </button>
              <button type="submit" className="confirm-button" disabled={!password || isVerifying}>
                {isVerifying ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showRecoveryKey && recoveryPhrase.length > 0 && (
        <div className="recovery-key-display">
          <div className="display-header">
            <h3>Your Recovery Key</h3>
            <button className="close-button" onClick={handleClose}>
              ✕
            </button>
          </div>

          <div className="warning-banner">
            <span className="warning-icon">⚠️</span>
            <div className="warning-content">
              <strong>Keep this safe!</strong>
              <p>Anyone with this recovery key can access your encrypted data.</p>
            </div>
          </div>

          <div className="recovery-phrase-grid">
            {formatWords().map((column, colIndex) => (
              <div key={colIndex} className="recovery-column">
                {column.map((word, rowIndex) => {
                  const wordNumber = colIndex * 8 + rowIndex + 1
                  return (
                    <div key={wordNumber} className="recovery-word">
                      <span className="word-number">{wordNumber}.</span>
                      <span className="word-text">{word}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="recovery-actions">
            <button
              className={`action-button copy-button ${copied ? 'success' : ''}`}
              onClick={handleCopyToClipboard}
            >
              {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
            </button>
            <button className="action-button save-button" onClick={handleSaveAsFile}>
              💾 Save as File
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
