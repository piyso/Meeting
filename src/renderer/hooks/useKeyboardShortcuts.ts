import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export function useKeyboardShortcuts() {
  const toggleCommandPalette = useAppStore(s => s.toggleCommandPalette)
  const toggleFocusMode = useAppStore(s => s.toggleFocusMode)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Cmd+Shift+K → Semantic Search (must be checked BEFORE Cmd+K)
      if (meta && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-semantic-search'))
        return
      }

      // Cmd+K → Command Palette (actions)
      if (meta && !e.shiftKey && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
        return
      }

      // Cmd+N → New Meeting dialog
      if (meta && !e.shiftKey && e.key === 'n') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-new-meeting'))
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
        window.electronAPI.window.restoreMain()
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

      // Cmd+\ → Toggle split pane orientation
      if (meta && e.key === '\\') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('toggle-split-orientation'))
        return
      }

      // Cmd+J → Collapse/expand notes pane
      if (meta && !e.shiftKey && e.key === 'j') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('toggle-notes-pane'))
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleCommandPalette, toggleFocusMode])
}
