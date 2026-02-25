import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export function useKeyboardShortcuts() {
  const toggleCommandPalette = useAppStore(s => s.toggleCommandPalette)
  const toggleFocusMode = useAppStore(s => s.toggleFocusMode)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Cmd+K → Command Palette (actions)
      if (meta && !e.shiftKey && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      }

      // Cmd+Shift+K → Semantic Search (content, wired in Phase 2)
      if (meta && e.shiftKey && e.key === 'k') {
        e.preventDefault()
        // Phase 2 implementation
      }

      // Cmd+N → New Meeting dialog
      if (meta && !e.shiftKey && e.key === 'n') {
        e.preventDefault()
        // Dispatched via custom event; NewMeetingDialog listens
        window.dispatchEvent(new CustomEvent('open-new-meeting'))
      }

      // Cmd+Shift+F → Focus Mode (collapse Zen Rail)
      if (meta && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        toggleFocusMode()
      }

      // Cmd+Shift+M → Mini Widget (always-on-top floating pill)
      if (meta && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        // Phase 2 implementation
      }

      // Cmd+\ → Toggle split pane orientation
      if (meta && e.key === '\\') {
        e.preventDefault()
        // Dispatched via custom event; SplitPane listens
        window.dispatchEvent(new CustomEvent('toggle-split-orientation'))
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
