import { AppLayout } from './components/layout/AppLayout'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { PasswordRecoveryDialog } from './components/PasswordRecoveryDialog'
import { useLaunchRequests } from './hooks/useLaunchRequests'

export default function App() {
  useLaunchRequests()
  return (
    <ErrorBoundary isGlobal viewName="Root App">
      <AppLayout />
      <PasswordRecoveryDialog />
    </ErrorBoundary>
  )
}
