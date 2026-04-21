/**
 * Platform-aware shortcut labels.
 * Use these instead of hardcoded ⌘/Cmd strings throughout the UI.
 */
const isMac =
  window.electronAPI?.platform === 'darwin' ||
  /Mac|iPhone|iPad/i.test(navigator.platform)

/** Modifier key symbol: ⌘ on Mac, Ctrl on Windows/Linux */
export const modKey = isMac ? '⌘' : 'Ctrl'

/** Modifier key word: Cmd on Mac, Ctrl on Windows/Linux */
export const modLabel = isMac ? 'Cmd' : 'Ctrl'

/** Format a shortcut label, e.g. formatShortcut('K') → "⌘+K" or "Ctrl+K" */
export function formatShortcut(...keys: string[]): string {
  return [modKey, ...keys].join('+')
}
