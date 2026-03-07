import { IpcMainInvokeEvent } from 'electron'
import { getAuditLogger, AuditLogQuery } from '../../services/AuditLogger'
import { Logger } from '../../services/Logger'
import { IPCResponse } from '../../../types/ipc'
import { getAuthService } from '../../services/AuthService'

const log = Logger.create('AuditHandlers')

export const auditHandlers = {
  query: async (
    _event: IpcMainInvokeEvent,
    params: { limit?: number; offset?: number; startDate?: string; endDate?: string }
  ): Promise<IPCResponse<unknown>> => {
    try {
      const logger = getAuditLogger()

      const auth = getAuthService()
      const user = await auth.getCurrentUser()

      const queryParams: AuditLogQuery = {
        limit: params.limit || 50,
        offset: params.offset || 0,
        sortOrder: 'desc',
      }

      if (user) {
        queryParams.userId = user.id
      }

      if (params.startDate) queryParams.startDate = params.startDate
      if (params.endDate) queryParams.endDate = params.endDate

      const logs = await logger.query(queryParams)
      const total = await logger.count(queryParams)

      return {
        success: true,
        data: { items: logs, total },
      }
    } catch (e: unknown) {
      log.error('Failed to query audit logs', e)
      const err = e as Error
      return {
        success: false,
        error: { message: err.message, code: 'AUDIT_QUERY_ERROR', timestamp: Date.now() },
      }
    }
  },

  export: async (
    _event: IpcMainInvokeEvent
  ): Promise<IPCResponse<{ content: string; filename: string }>> => {
    try {
      const logger = getAuditLogger()
      const auth = getAuthService()
      const user = await auth.getCurrentUser()

      const queryParams: AuditLogQuery = {}
      if (user) queryParams.userId = user.id

      const csvContent = await logger.exportToCSV(queryParams)

      return {
        success: true,
        data: {
          content: csvContent,
          filename: `audit-export-${new Date().toISOString().split('T')[0]}.csv`,
        },
      }
    } catch (e: unknown) {
      log.error('Failed to export audit logs', e)
      const err = e as Error
      return {
        success: false,
        error: { message: err.message, code: 'AUDIT_EXPORT_ERROR', timestamp: Date.now() },
      }
    }
  },
}

import { ipcMain } from 'electron'
export function registerAuditHandlers() {
  ipcMain.handle('audit:query', auditHandlers.query)
  ipcMain.handle('audit:export', auditHandlers.export)
}
