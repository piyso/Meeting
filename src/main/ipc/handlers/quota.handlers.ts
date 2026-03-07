import { IpcMainInvokeEvent } from 'electron'
import { getQueryQuotaManager } from '../../services/QueryQuotaManager'
import { getAuthService } from '../../services/AuthService'
import { Logger } from '../../services/Logger'
import { IPCResponse } from '../../../types/ipc'

const log = Logger.create('QuotaHandlers')

export const quotaHandlers = {
  check: async (
    _event: IpcMainInvokeEvent
  ): Promise<
    IPCResponse<{
      used: number
      limit: number
      remaining: number
      resetsAt: string
      exhausted: boolean
      tier: string
    }>
  > => {
    try {
      const auth = getAuthService()
      const user = await auth.getCurrentUser()
      const validTiers = ['free', 'starter', 'pro', 'team', 'enterprise'] as const
      type Tier = (typeof validTiers)[number]
      const rawTier = user?.tier || 'free'
      const tier: Tier = validTiers.includes(rawTier as Tier) ? (rawTier as Tier) : 'free'

      const quotaManager = getQueryQuotaManager()
      const status = await quotaManager.checkQuota(tier)

      return {
        success: true,
        data: {
          ...status,
          tier,
        },
      }
    } catch (e: unknown) {
      log.error('Failed to check quota', e)
      const err = e as Error
      return {
        success: false,
        error: { message: err.message, code: 'QUOTA_ERROR', timestamp: Date.now() },
      }
    }
  },
}

import { ipcMain } from 'electron'
export function registerQuotaHandlers() {
  ipcMain.handle('quota:check', quotaHandlers.check)
}
