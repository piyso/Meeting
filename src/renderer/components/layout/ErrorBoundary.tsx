import React, { Component, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, Copy, Mail } from 'lucide-react'
import { Button } from '../ui/Button'
import { rendererLog } from '../../utils/logger'

const log = rendererLog.create('ErrorBoundary')

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  /** Optional view name for identifying which view crashed in logs and UI. */
  viewName?: string
  /** If true, renders a full-screen fatal error UI. */
  isGlobal?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    copied: false,
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    log.error(
      `ErrorBoundary caught in ${this.props.viewName || 'unknown view'}:`,
      error.message,
      'Stack:',
      error.stack
    )
    log.error('Component stack:', errorInfo.componentStack)
    try {
      // Report to main process crash handler/logger
      window.electronAPI?.ipcRenderer?.send('error', {
        source: 'ErrorBoundary',
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      })
    } catch {
      // Ignore IPC send fail
    }
  }

  private handleRetry = () => {
    if (this.props.isGlobal) {
      window.location.reload()
    } else {
      this.setState({ hasError: false, error: null, copied: false })
    }
  }

  private handleCopyReport = () => {
    const error = this.state.error
    const report = [
      '═══ BlueArkive Error Report ═══',
      '',
      `View: ${this.props.viewName || 'Unknown'}`,
      `Error: ${error?.message || 'Unknown error'}`,
      '',
      '─── Stack Trace ───',
      error?.stack || 'No stack trace available',
      '',
      '─── Environment ───',
      `Platform: ${navigator.platform}`,
      `UserAgent: ${navigator.userAgent}`,
      `URL: ${window.location.href}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join('\n')

    navigator.clipboard
      .writeText(report)
      .then(() => {
        this.setState({ copied: true })
        setTimeout(() => this.setState({ copied: false }), 2000)
      })
      .catch(() => {})
  }

  private handleEmailSupport = () => {
    const error = this.state.error
    const subject = `BlueArkive Error: ${error?.message?.slice(0, 60) || 'Application Error'}`
    const body = `Error: ${error?.message || 'Unknown'}\n\nPlatform: ${navigator.platform}\nTimestamp: ${new Date().toISOString()}`
    window.electronAPI?.shell?.openExternal(
      `mailto:support@bluearkive.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    )
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      if (this.props.isGlobal) {
        return (
          <div className="fixed inset-0 flex items-center justify-center bg-transparent z-[9999] animate-fade-in p-6">
            <div className="surface-glass-premium p-8 max-w-lg w-full text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-rose)]/10 text-[var(--color-rose)] flex items-center justify-center mb-6">
                <AlertTriangle size={32} />
              </div>

              <h1 className="text-2xl font-bold mb-3">Something went wrong</h1>
              <p className="text-[var(--color-text-secondary)] mb-6 leading-relaxed">
                We've encountered an unexpected error. Your local data is safe and persisted. Please
                reload the application to recover.
              </p>

              <div className="bg-black/30 rounded-lg p-4 mb-6 w-full overflow-x-auto text-left border border-white/5">
                <pre className="text-[11px] text-[var(--color-rose)] font-mono whitespace-pre-wrap break-words">
                  {this.state.error?.message || 'Unknown error occurred in React tree'}
                </pre>
              </div>

              <div className="flex flex-col gap-2 w-full">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={this.handleRetry}
                  className="w-full justify-center"
                >
                  <RefreshCw size={16} className="mr-2" />
                  Reload Application
                </Button>
                <div className="flex gap-2 w-full">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={this.handleCopyReport}
                    className="flex-1 justify-center"
                  >
                    <Copy size={14} className="mr-1.5" />
                    {this.state.copied ? 'Copied!' : 'Copy Report'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={this.handleEmailSupport}
                    className="flex-1 justify-center"
                  >
                    <Mail size={14} className="mr-1.5" />
                    Email Support
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="ui-error-boundary-card">
          <div className="ui-error-boundary-header">
            <AlertTriangle size={24} />
            <h3 className="ui-error-boundary-title">
              {this.props.viewName
                ? `${this.props.viewName} failed to load`
                : 'Something went wrong'}
            </h3>
          </div>
          {this.state.error && (
            <p className="ui-error-boundary-message">{this.state.error.message}</p>
          )}
          <div className="flex gap-2 mt-2">
            <Button variant="secondary" size="sm" onClick={this.handleRetry}>
              Retry View
            </Button>
            <Button variant="ghost" size="sm" onClick={this.handleCopyReport}>
              <Copy size={12} className="mr-1" />
              {this.state.copied ? 'Copied!' : 'Copy Report'}
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
