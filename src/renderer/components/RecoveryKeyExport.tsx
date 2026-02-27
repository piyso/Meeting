/**
 * Recovery Key Export Component
 *
 * Displays 24-word recovery phrase during onboarding with:
 * - Warning banner with ⚠️ icon
 * - Recovery phrase in grid layout (3 columns x 8 rows)
 * - "Copy to Clipboard" button
 * - "Save as File" button
 * - Confirmation checkbox: "I have saved my recovery key"
 * - Disabled "Continue" button until checkbox is checked
 *
 * This is a CRITICAL step that CANNOT be skipped.
 */

import React, { useState, useRef, useEffect } from 'react'
import './RecoveryKeyExport.css'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('RecoveryExport')

export interface RecoveryKeyExportProps {
  recoveryPhrase: string[] // 24 words
  userId: string
  onContinue: () => void
}

export const RecoveryKeyExport: React.FC<RecoveryKeyExportProps> = ({
  recoveryPhrase,
  userId,
  onContinue,
}) => {
  const [hasConfirmed, setHasConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopyToClipboard = async () => {
    const phrase = recoveryPhrase.join(' ')
    try {
      await navigator.clipboard.writeText(phrase)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 3000)
    } catch (error) {
      log.error('Failed to copy to clipboard:', error)
      alert('Failed to copy to clipboard. Please copy manually.')
    }
  }

  const handleSaveAsFile = () => {
    const phrase = recoveryPhrase.join(' ')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `bluearkive-recovery-key-${timestamp}.txt`

    const content = `BlueArkive Recovery Key
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
1. Open BlueArkive
2. Click "Forgot Password"
3. Enter this 24-word recovery key
4. Set a new password
`

    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setSaved(true)
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasConfirmed(e.target.checked)
  }

  const handleContinue = () => {
    if (hasConfirmed) {
      onContinue()
    }
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

  const columns = formatWords()

  return (
    <div className="recovery-key-export">
      <div className="recovery-header">
        <h2>Save Your Recovery Key</h2>
        <p className="recovery-subtitle">
          This is the ONLY way to recover your encrypted data if you lose your password
        </p>
      </div>

      {/* Critical Warning Banner */}
      <div className="warning-banner critical">
        <span className="warning-icon">⚠️</span>
        <div className="warning-content">
          <h3>Store this somewhere safe — we can NEVER recover your encrypted data without it.</h3>
          <p>
            Without this recovery key, your encrypted meeting data is permanently unrecoverable if
            you lose your password.
          </p>
        </div>
      </div>

      {/* Recovery Phrase Grid */}
      <div className="recovery-phrase-container">
        <div className="recovery-phrase-grid">
          {columns.map((column, colIndex) => (
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
      </div>

      {/* Action Buttons */}
      <div className="recovery-actions">
        <button
          className={`action-button copy-button ${copied ? 'success' : ''}`}
          onClick={handleCopyToClipboard}
        >
          {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
        </button>
        <button
          className={`action-button save-button ${saved ? 'success' : ''}`}
          onClick={handleSaveAsFile}
        >
          {saved ? '✓ Saved!' : '💾 Save as File'}
        </button>
      </div>

      {/* Confirmation Checkbox */}
      <div className="recovery-confirmation">
        <label className="confirmation-checkbox">
          <input
            type="checkbox"
            checked={hasConfirmed}
            onChange={handleCheckboxChange}
            className="checkbox-input"
          />
          <span className="checkbox-label">I have saved my recovery key in a secure location</span>
        </label>
      </div>

      {/* Cannot Skip Warning */}
      <div className="skip-warning">
        <span className="skip-icon">⚠️</span>
        <span className="skip-text">You cannot skip this step</span>
      </div>

      {/* Continue Button */}
      <div className="recovery-footer">
        <button
          className="continue-button"
          onClick={handleContinue}
          disabled={!hasConfirmed}
          title={!hasConfirmed ? 'Please confirm you have saved your recovery key' : ''}
        >
          Continue
        </button>
      </div>

      {/* Additional Security Tips */}
      <div className="security-tips">
        <h4>Security Best Practices:</h4>
        <ul>
          <li>✓ Write the recovery key on paper and store it in a safe place</li>
          <li>✓ Keep multiple copies in different secure locations</li>
          <li>✓ Never share your recovery key with anyone</li>
          <li>✗ Do not store it in email, cloud storage, or screenshots</li>
          <li>✗ Do not store it on your computer or phone</li>
        </ul>
      </div>
    </div>
  )
}
