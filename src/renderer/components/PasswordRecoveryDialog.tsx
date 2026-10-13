import React, { useEffect, useState } from 'react'
import { Dialog } from './ui/Dialog'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { useToast } from '../hooks/useToast'

/**
 * Completes "Forgot password": opening the emailed link brings the app to the
 * front and fires `auth:passwordRecovery`; this dialog collects the new
 * password. Mounted at the app root so it works from onboarding as well as
 * from a signed-in session.
 */
export const PasswordRecoveryDialog: React.FC = () => {
  const { toast } = useToast()
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsubscribe = window.electronAPI?.auth?.onPasswordRecovery?.(data => {
      if (data?.error || !data?.email) {
        toast('error', 'Password reset link could not be used', data?.error)
        return
      }
      setPassword('')
      setConfirm('')
      setError(null)
      setEmail(data.email)
    })
    return () => unsubscribe?.()
  }, [toast])

  const close = () => {
    if (saving) return
    setEmail(null)
    setPassword('')
    setConfirm('')
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await window.electronAPI?.auth?.updatePassword?.({ password })
      if (result?.success) {
        setEmail(null)
        setPassword('')
        setConfirm('')
        toast('success', 'Password updated', 'You are signed in with your new password.')
      } else {
        setError(result?.error?.message || 'Could not update password')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={email !== null} onClose={close} title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Set a new password for <strong>{email}</strong>.
        </p>
        <Input
          type="password"
          label="New password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={event => setPassword(event.target.value)}
          disabled={saving}
        />
        <Input
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={event => setConfirm(event.target.value)}
          error={error ?? undefined}
          disabled={saving}
        />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Meetings already synced to the cloud were encrypted with your old password and stay
          readable only with it. Everything on this device is unaffected.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={saving}>
            Update password
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
