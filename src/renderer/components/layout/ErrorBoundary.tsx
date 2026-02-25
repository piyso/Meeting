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
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-[var(--radius-md)] p-[var(--space-16)] flex flex-col items-start gap-4">
          <div className="flex items-center gap-3 text-[var(--color-amber)]">
            <AlertTriangle size={24} />
            <h3 className="text-[var(--text-sm)] font-medium text-white">Something went wrong</h3>
          </div>
          {this.state.error && (
            <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)] max-w-md font-mono break-all bg-black/50 p-2 rounded">
              {this.state.error.message}
            </p>
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
