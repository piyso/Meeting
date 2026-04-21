import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export function useKeyboardShortcuts() {
  const toggleCommandPalette = useAppStore(s => s.toggleCommandPalette)
  const toggleFocusMode = useAppStore(s => s.toggleFocusMode)
  const toggleGlobalContext = useAppStore(s => s.toggleGlobalContext)
  const navigate = useAppStore(s => s.navigate)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Cmd+Shift+K → Command Palette (semantic search is built-in)
      if (meta && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        toggleCommandPalette()
        return
      }

      // Cmd+K → Command Palette (actions)
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggleCommandPalette()
        return
      }

      // Cmd+N → New Meeting dialog
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-new-meeting'))
        return
      }

      // Cmd+, → Open Settings (standard macOS convention)
      if (meta && !e.shiftKey && e.key === ',') {
        e.preventDefault()
        navigate('settings')
        return
      }

      // Cmd+Shift+F → Focus Mode (collapse Zen Rail)
      if (meta && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        toggleFocusMode()
        return
      }

      // Cmd+Shift+M → Toggle floating widget
      if (meta && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        window.electronAPI?.window?.restoreMain()
        return
      }

      // Cmd+Shift+R → Start/Stop Recording
      if (meta && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('toggle-recording'))
        return
      }

      // Cmd+Shift+E → Quick Export as Markdown
      if (meta && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('quick-export'))
        return
      }

      // Cmd+Shift+G → Toggle Global Context Bar
      if (meta && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        toggleGlobalContext()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleCommandPalette, toggleFocusMode, toggleGlobalContext, navigate])
}
