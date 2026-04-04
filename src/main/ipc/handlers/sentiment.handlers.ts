/**
 * Sentiment Analysis IPC Handlers
 *
 * 4 handlers for sentiment analysis operations.
 */

import { ipcMain } from 'electron'
import { Logger } from '../../services/Logger'
import { analyzeMeeting, getMood } from '../../services/SentimentAnalyzer'
import { getSentimentByMeeting, getSentimentTimeline } from '../../database/crud/sentiment-scores'
import type { IPCResponse } from '../../../types/ipc'

const log = Logger.create('SentimentHandlers')

/**
 * Register all sentiment IPC handlers
 */
export function registerSentimentHandlers(): void {
  // sentiment:analyze — Run full sentiment analysis pipeline
  ipcMain.handle(
    'sentiment:analyze',
    async (_, params: { meetingId: string }): Promise<IPCResponse> => {
      try {
        const scores = await analyzeMeeting(params.meetingId)
        return { success: true, data: scores }
      } catch (error) {
        log.error('sentiment:analyze failed', error)
        return {
          success: false,
          error: {
            code: 'SENTIMENT_ANALYZE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // sentiment:getByMeeting — Get all sentiment scores for a meeting
  ipcMain.handle(
    'sentiment:getByMeeting',
    async (_, params: { meetingId: string }): Promise<IPCResponse> => {
      try {
        const scores = getSentimentByMeeting(params.meetingId)
        return { success: true, data: scores }
      } catch (error) {
        log.error('sentiment:getByMeeting failed', error)
        return {
          success: false,
          error: {
            code: 'SENTIMENT_GET_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // sentiment:getMood — Get aggregate mood for a meeting
  ipcMain.handle(
    'sentiment:getMood',
    async (_, params: { meetingId: string }): Promise<IPCResponse> => {
      try {
        const mood = await getMood(params.meetingId)
        return { success: true, data: mood }
      } catch (error) {
        log.error('sentiment:getMood failed', error)
        return {
          success: false,
          error: {
            code: 'SENTIMENT_MOOD_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // sentiment:getTimeline — Get sentiment scores ordered by time
  ipcMain.handle(
    'sentiment:getTimeline',
    async (_, params: { meetingId: string }): Promise<IPCResponse> => {
      try {
        const timeline = getSentimentTimeline(params.meetingId)
        return { success: true, data: timeline }
      } catch (error) {
        log.error('sentiment:getTimeline failed', error)
        return {
          success: false,
          error: {
            code: 'SENTIMENT_TIMELINE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  log.info('Sentiment handlers registered')
}
