/**
 * Recover Account Component
 *
 * Allows users to recover their account using a 24-word recovery phrase.
 * This is used when a user forgets their password.
 *
 * Flow:
 * 1. User enters 24-word recovery phrase
 * 2. System validates the phrase
 * 3. User sets a new password
 * 4. System derives master key from phrase and re-encrypts with new password
 */

import React, { useState } from 'react'
import './RecoverAccount.css'

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
    // For now, simulate validation
    setTimeout(() => {
      setIsValidating(false)
      setStep('password')
    }, 1000)
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
    // For now, simulate recovery
    setIsValidating(true)
    setTimeout(() => {
      setIsValidating(false)
      onRecoveryComplete()
    }, 1500)
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
    <div className="recover-account">
      <div className="recover-header">
        <h2>Recover Your Account</h2>
        <p className="recover-subtitle">Enter your 24-word recovery key to reset your password</p>
      </div>

      {step === 'phrase' && (
        <form onSubmit={handlePhraseSubmit} className="recover-form">
          <div className="form-section">
            <label htmlFor="recovery-phrase" className="form-label">
              Recovery Key (24 words)
            </label>
            <textarea
              id="recovery-phrase"
              className="recovery-phrase-input"
              value={recoveryPhrase}
              onChange={handlePhraseChange}
              placeholder="Enter your 24-word recovery key separated by spaces..."
              rows={6}
              autoFocus
            />
            <div className="word-counter">
              <span className={wordCount === 24 ? 'valid' : wordCount > 24 ? 'error' : ''}>
                {wordCount} / 24 words
              </span>
            </div>
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
              className="secondary-button"
              onClick={onCancel}
              disabled={isValidating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={wordCount !== 24 || isValidating}
            >
              {isValidating ? 'Validating...' : 'Continue'}
            </button>
          </div>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="recover-form">
          <div className="success-message">
            <span className="success-icon">✓</span>
            <span>Recovery key validated successfully</span>
          </div>

          <div className="form-section">
            <label htmlFor="new-password" className="form-label">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              className="password-input"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 8 characters)"
              autoFocus
            />
          </div>

          <div className="form-section">
            <label htmlFor="confirm-password" className="form-label">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              className="password-input"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
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
              className="secondary-button"
              onClick={() => setStep('phrase')}
              disabled={isValidating}
            >
              Back
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!newPassword || !confirmPassword || isValidating}
            >
              {isValidating ? 'Recovering...' : 'Reset Password'}
            </button>
          </div>
        </form>
      )}

      <div className="recover-help">
        <h4>Need Help?</h4>
        <ul>
          <li>Your recovery key is the 24-word phrase you saved during account setup</li>
          <li>Make sure to enter all 24 words in the correct order</li>
          <li>Words should be separated by spaces</li>
          <li>If you've lost your recovery key, your encrypted data cannot be recovered</li>
        </ul>
      </div>
    </div>
  )
}
