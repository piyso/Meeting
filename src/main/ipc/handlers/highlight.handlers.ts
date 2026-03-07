/**
 * Highlight IPC Handlers — Bookmark moments during meetings
 *
 * Provides IPC endpoints for creating, listing, and deleting
 * audio highlights (bookmarks) from the renderer process.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../types/ipcChannels'
import { createHighlight, getHighlights, deleteHighlight } from '../../database/crud/highlights'
import { Logger } from '../../services/Logger'

const log = Logger.create('HighlightHandlers')

export function registerHighlightHandlers(): void {
  // Create a new highlight (bookmark)
  ipcMain.handle(
    IPC_CHANNELS.highlight.create,
    async (
      _,
      params: {
        meetingId: string
        startTime: number
        endTime: number
        label?: string
        color?: string
      }
    ) => {
      try {
        const highlight = createHighlight(params)
        return { success: true, data: highlight }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to create highlight'
        log.error('highlight:create failed', error)
        return { success: false, error: { message: msg } }
      }
    }
  )

  // List highlights for a meeting
  ipcMain.handle(IPC_CHANNELS.highlight.list, async (_, meetingId: string) => {
    try {
      const highlights = getHighlights(meetingId)
      return { success: true, data: highlights }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to list highlights'
      log.error('highlight:list failed', error)
      return { success: false, error: { message: msg } }
    }
  })

  // Delete a highlight
  ipcMain.handle(IPC_CHANNELS.highlight.delete, async (_, id: string) => {
    try {
      const deleted = deleteHighlight(id)
      return { success: true, data: { deleted } }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to delete highlight'
      log.error('highlight:delete failed', error)
      return { success: false, error: { message: msg } }
    }
  })

  log.info('Highlight handlers registered')
}
