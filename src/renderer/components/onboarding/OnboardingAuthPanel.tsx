import React from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { Logo3D, Logo3DErrorBoundary } from '../ui/Logo3D'
import { rendererLog } from '../../utils/logger'
const log = rendererLog.create('Onboarding')

interface OnboardingAuthPanelProps {
  authMode: 'register' | 'login'
  setAuthMode: (mode: 'register' | 'login') => void
  authEmail: string
  setAuthEmail: (val: string) => void
  authPass: string
  setAuthPass: (val: string) => void
  authError: string | null
  setAuthError: (err: string | null) => void
  authLoading: boolean
  handleAuth: () => void
}

export const OnboardingAuthPanel: React.FC<OnboardingAuthPanelProps> = ({
  authMode,
  setAuthMode,
  authEmail,
  setAuthEmail,
  authPass,
  setAuthPass,
  authError,
  setAuthError,
  authLoading,
  handleAuth,
}) => {
  return (
    <div className="w-full max-w-[420px] flex flex-col relative z-10">
      <div className="flex flex-col mb-10 lg:hidden items-center ">
        <div className="mb-6 -mt-8">
          <Logo3DErrorBoundary>
            <Logo3D className="transform scale-75 origin-center" />
          </Logo3DErrorBoundary>
        </div>
        <h1 className="text-2xl font-semibold tracking-wide text-center text-white">
          {authMode === 'register' ? 'Initialize Core' : 'Welcome Back'}
        </h1>
      </div>

      {!authLoading && (
        <div className="hidden lg:flex lg:flex-col lg:items-center mb-8">
          <div className="mb-5">
            <Logo size="lg" />
          </div>
          <h2 className="text-2xl font-semibold tracking-wide text-white">
            {authMode === 'register' ? 'Initialize Core' : 'Authenticate Session'}
          </h2>
        </div>
      )}

      <form
        className="w-full space-y-6 mb-8"
        onSubmit={e => {
          e.preventDefault()
          handleAuth()
        }}
      >
        <div className="">
          <Input
            id="email"
            name="email"
            type="email"
            label="Email"
            value={authEmail}
            onChange={e => setAuthEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="username"
            required
          />
        </div>
        <div className="">
          <Input
            id="password"
            name="password"
            type="password"
            label="Password"
            value={authPass}
            onChange={e => setAuthPass(e.target.value)}
            placeholder="••••••••"
            autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
            required
          />
        </div>

        {authError && (
          <div
            className={`flex items-center gap-3 p-3.5 rounded-xl text-sm font-medium backdrop-blur-xl ${
              authError.startsWith('✓')
                ? 'bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.3)] text-emerald-300'
                : authError.includes('email confirmation') || authError.includes('check your')
                  ? 'bg-[rgba(14,165,233,0.06)] border border-[rgba(14,165,233,0.3)] text-sky-300'
                  : 'bg-[rgba(244,63,94,0.06)] border border-[rgba(244,63,94,0.3)] text-rose-300'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                authError.startsWith('✓')
                  ? 'bg-emerald-500'
                  : authError.includes('email confirmation') || authError.includes('check your')
                    ? 'bg-sky-500'
                    : 'bg-rose-500 animate-pulse'
              }`}
            />
            <span className="flex-1 tracking-wide">{authError}</span>
          </div>
        )}

        <div className="">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-8 h-13 text-[14px] bg-white text-slate-950 hover:bg-slate-200 border-none transition-colors"
            disabled={authLoading}
          >
            {authLoading
              ? 'Authenticating...'
              : authMode === 'register'
                ? 'Initialize Core'
                : 'Authenticate Session'}
          </Button>

          <div className="flex items-center gap-3 my-8">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-slate-500 tracking-widest uppercase">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <button
            onClick={async () => {
              try {
                setAuthError(null)
                const res = await window.electronAPI?.auth?.googleAuth?.()
                if (!res) {
                  setAuthError('Google sign-in is not available in this environment')
                } else if (!res?.success) {
                  const msg = res.error?.message || 'Google sign-in failed'
                  if (
                    msg.includes('provider is not enabled') ||
                    msg.includes('Unsupported provider')
                  ) {
                    setAuthError(
                      'Google sign-in is not available yet. Please use email/password to sign in.'
                    )
                  } else {
                    setAuthError(msg)
                  }
                } else {
                  setAuthError('Google sign-in opened in browser — complete the flow there')
                }
              } catch (err: unknown) {
                setAuthError(err instanceof Error ? err.message : 'Google sign-in failed')
              }
            }}
            type="button"
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[14px] text-slate-300 font-medium transition-all cursor-pointer h-13"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </div>
      </form>

      <div className="flex flex-col items-center pt-8 border-t border-white/10 mt-4">
        <div className="text-[13px] text-slate-400 tracking-wide">
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
                Authenticate
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
                Initialize Core
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
  )
}
