import React, { Component, ErrorInfo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
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
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="ui-error-boundary-card">
          <div className="ui-error-boundary-header">
            <AlertTriangle size={24} />
            <h3 className="ui-error-boundary-title">Something went wrong</h3>
          </div>
          {this.state.error && (
            <p className="ui-error-boundary-message">{this.state.error.message}</p>
          )}
          <Button variant="secondary" size="sm" onClick={this.handleRetry}>
            Retry View
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
