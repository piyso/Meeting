import { AppLayout } from './components/layout/AppLayout'
import { ErrorBoundary } from './components/layout/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary isGlobal viewName="Root App">
      <AppLayout />
    </ErrorBoundary>
  )
}
