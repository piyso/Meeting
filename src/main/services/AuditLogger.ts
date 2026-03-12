/**
 * Audit Logger Service
 *
 * Immutable audit logging for SOC 2 compliance.
 * Logs all data operations (create, update, delete) for security auditing.
 *
 * Features:
 * - Immutable logs (cannot be modified or deleted)
 * - Timestamp tracking
 * - User attribution
 * - Operation metadata
 * - Query and export capabilities
 *
 * SOC 2 Requirements:
 * - CC6.1: Logical and physical access controls
 * - CC6.2: Prior to issuing system credentials
 * - CC6.3: Removes access when appropriate
 * - CC7.2: System monitoring
 */

import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

export interface AuditLogEntry {
  id: string
  userId: string
  operation: AuditOperation
  table: string
  recordId?: string
  oldValue?: string
  newValue?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  timestamp: string
}

export type AuditOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'read'
  | 'login'
  | 'logout'
  | 'device_register'
  | 'device_login'
  | 'device_deactivate'
  | 'device_reactivate'
  | 'device_delete'
  | 'device_rename'
  | 'sync_start'
  | 'sync_complete'
  | 'sync_fail'
  | 'encryption_key_create'
  | 'encryption_key_access'
  | 'recovery_phrase_export'
  | 'recovery_phrase_use'
  | 'account_delete'

export interface AuditLogQuery {
  userId?: string
  operation?: AuditOperation
  table?: string
  tableName?: string
  recordId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
  sortOrder?: 'asc' | 'desc'
}

/**
 * Row returned from query() and used in exports.
 * Includes both snake_case (DB columns) and camelCase (app convention) fields.
 */
export interface AuditLogRow {
  id: string
  user_id: string
  userId: string
  operation: AuditOperation
  table_name: string
  table: string
  record_id?: string
  recordId?: string
  old_value?: string
  oldValue?: string
  new_value?: string
  newValue?: string
  metadata?: Record<string, unknown>
  ip_address?: string
  ipAddress?: string
  user_agent?: string
  userAgent?: string
  timestamp: string
}

export class AuditLogger {
  /**
   * Log an audit event
   *
   * @param entry - Audit log entry (without id and timestamp)
   * @returns Audit log entry with id and timestamp
   */
  public async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const db = getDatabaseService().getDb()

    const logEntry: AuditLogEntry = {
      id: uuidv4(),
      ...entry,
      timestamp: new Date().toISOString(),
    }

    // Insert audit log (immutable - no updates or deletes allowed)
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, operation, table_name, record_id, old_value, new_value, metadata, ip_address, user_agent, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      logEntry.id,
      logEntry.userId,
      logEntry.operation,
      logEntry.table,
      logEntry.recordId || null,
      logEntry.oldValue || null,
      logEntry.newValue || null,
      logEntry.metadata ? JSON.stringify(logEntry.metadata) : null,
      logEntry.ipAddress || null,
      logEntry.userAgent || null,
      logEntry.timestamp
    )

    return logEntry
  }

  /**
   * Log create operation
   *
   * @param userId - User ID
   * @param table - Table name
   * @param recordId - Record ID
   * @param newValue - New value (JSON)
   * @param metadata - Additional metadata
   * @returns Audit log entry
   */
  public async logCreate(
    userId: string,
    table: string,
    recordId: string,
    newValue: unknown,
    metadata?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.log({
      userId,
      operation: 'create',
      table,
      recordId,
      newValue: JSON.stringify(newValue),
      metadata,
    })
  }

  /**
   * Log update operation
   *
   * @param userId - User ID
   * @param table - Table name
   * @param recordId - Record ID
   * @param oldValue - Old value (JSON)
   * @param newValue - New value (JSON)
   * @param metadata - Additional metadata
   * @returns Audit log entry
   */
  public async logUpdate(
    userId: string,
    table: string,
    recordId: string,
    oldValue: unknown,
    newValue: unknown,
    metadata?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.log({
      userId,
      operation: 'update',
      table,
      recordId,
      oldValue: JSON.stringify(oldValue),
      newValue: JSON.stringify(newValue),
      metadata,
    })
  }

  /**
   * Log delete operation
   *
   * @param userId - User ID
   * @param table - Table name
   * @param recordId - Record ID
   * @param oldValue - Old value (JSON)
   * @param metadata - Additional metadata
   * @returns Audit log entry
   */
  public async logDelete(
    userId: string,
    table: string,
    recordId: string,
    oldValue: unknown,
    metadata?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.log({
      userId,
      operation: 'delete',
      table,
      recordId,
      oldValue: JSON.stringify(oldValue),
      metadata,
    })
  }

  /**
   * Log login event
   *
   * @param userId - User ID
   * @param ipAddress - IP address
   * @param userAgent - User agent
   * @param metadata - Additional metadata
   * @returns Audit log entry
   */
  public async logLogin(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.log({
      userId,
      operation: 'login',
      table: 'auth',
      ipAddress,
      userAgent,
      metadata,
    })
  }

  /**
   * Log logout event
   *
   * @param userId - User ID
   * @param metadata - Additional metadata
   * @returns Audit log entry
   */
  public async logLogout(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.log({
      userId,
      operation: 'logout',
      table: 'auth',
      ipAddress,
      userAgent,
      metadata,
    })
  }

  /**
   * Log device operation (register, deactivate, etc.)
   *
   * @param userId - User ID
   * @param operation - Device operation type
   * @param deviceId - Device ID
   * @param metadata - Additional metadata
   * @returns Audit log entry
   */
  public async logDeviceOperation(
    userId: string,
    operation: string,
    deviceId: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.log({
      userId,
      operation: operation as AuditOperation,
      table: 'devices',
      recordId: deviceId,
      metadata,
    })
  }

  /**
   * Query audit logs
   *
   * @param query - Query parameters
   * @returns Array of audit log entries
   */
  public async query(query: AuditLogQuery): Promise<AuditLogEntry[]> {
    const db = getDatabaseService().getDb()

    let sql = 'SELECT * FROM audit_logs WHERE 1=1'
    const params: (string | number)[] = []

    if (query.userId) {
      sql += ' AND user_id = ?'
      params.push(query.userId)
    }

    if (query.operation) {
      sql += ' AND operation = ?'
      params.push(query.operation)
    }

    const tableName = query.table ?? query.tableName
    if (tableName) {
      sql += ' AND table_name = ?'
      params.push(tableName)
    }

    if (query.recordId) {
      sql += ' AND record_id = ?'
      params.push(query.recordId)
    }

    if (query.startDate) {
      sql += ' AND timestamp >= ?'
      params.push(query.startDate)
    }

    if (query.endDate) {
      sql += ' AND timestamp <= ?'
      params.push(query.endDate)
    }

    sql += ` ORDER BY timestamp ${query.sortOrder === 'desc' ? 'DESC' : 'ASC'}`

    if (query.limit) {
      sql += ' LIMIT ?'
      params.push(query.limit)
    }

    if (query.offset) {
      sql += ' OFFSET ?'
      params.push(query.offset)
    }

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]

    return rows.map(row => {
      // NOTE: metadata is returned as-is from DB (JSON string).
      // Callers should JSON.parse() if needed. This preserves the API contract
      // where query() returns raw DB rows and callers handle deserialization.
      const metadata = row.metadata || undefined

      return {
        id: row.id,
        user_id: row.user_id,
        userId: row.user_id,
        operation: row.operation,
        table_name: row.table_name,
        table: row.table_name,
        record_id: row.record_id,
        recordId: row.record_id,
        old_value: row.old_value,
        oldValue: row.old_value,
        new_value: row.new_value,
        newValue: row.new_value,
        metadata: metadata,
        ip_address: row.ip_address,
        ipAddress: row.ip_address,
        user_agent: row.user_agent,
        userAgent: row.user_agent,
        timestamp: row.timestamp,
      } as AuditLogRow
    })
  }

  /**
   * Get audit logs for user
   *
   * @param userId - User ID
   * @param limit - Maximum number of logs to return
   * @param offset - Offset for pagination
   * @returns Array of audit log entries
   */
  public async getUserLogs(
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLogEntry[]> {
    return this.query({ userId, limit, offset })
  }

  /**
   * Get audit logs for operation
   *
   * @param operation - Operation type
   * @param limit - Maximum number of logs to return
   * @param offset - Offset for pagination
   * @returns Array of audit log entries
   */
  public async getOperationLogs(
    operation: AuditOperation,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLogEntry[]> {
    return this.query({ operation, limit, offset })
  }

  /**
   * Get audit logs for table
   *
   * @param table - Table name
   * @param limit - Maximum number of logs to return
   * @param offset - Offset for pagination
   * @returns Array of audit log entries
   */
  public async getTableLogs(
    table: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLogEntry[]> {
    return this.query({ table, limit, offset })
  }

  /**
   * Get audit logs for date range
   *
   * @param startDate - Start date (ISO 8601)
   * @param endDate - End date (ISO 8601)
   * @param limit - Maximum number of logs to return
   * @param offset - Offset for pagination
   * @returns Array of audit log entries
   */
  public async getDateRangeLogs(
    startDate: string,
    endDate: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLogEntry[]> {
    return this.query({ startDate, endDate, limit, offset })
  }

  /**
   * Get audit log count
   *
   * @param query - Query parameters
   * @returns Number of audit logs matching query
   */
  public async count(query: AuditLogQuery): Promise<number> {
    const db = getDatabaseService().getDb()

    let sql = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1'
    const params: (string | number)[] = []

    if (query.userId) {
      sql += ' AND user_id = ?'
      params.push(query.userId)
    }

    if (query.operation) {
      sql += ' AND operation = ?'
      params.push(query.operation)
    }

    if (query.table) {
      sql += ' AND table_name = ?'
      params.push(query.table)
    }

    if (query.startDate) {
      sql += ' AND timestamp >= ?'
      params.push(query.startDate)
    }

    if (query.endDate) {
      sql += ' AND timestamp <= ?'
      params.push(query.endDate)
    }

    const result = db.prepare(sql).get(...params) as { count: number }

    return result.count
  }

  /**
   * Export audit logs to JSON
   *
   * @param query - Query parameters
   * @returns JSON string of audit logs
   */
  public async exportToJSON(query: AuditLogQuery): Promise<string> {
    const logs = await this.query(query)
    return JSON.stringify(logs, null, 2)
  }

  /**
   * Export audit logs to CSV
   *
   * @param query - Query parameters
   * @returns CSV string of audit logs
   */
  public async exportToCSV(query: AuditLogQuery): Promise<string> {
    const logs = (await this.query(query)) as AuditLogRow[]

    if (logs.length === 0) {
      return ''
    }

    // CSV header
    const header =
      'id,user_id,operation,table_name,record_id,old_value,new_value,metadata,ip_address,user_agent,timestamp'

    const rows = logs.map(log => {
      const metadataStr = log.metadata
        ? typeof log.metadata === 'string'
          ? log.metadata
          : JSON.stringify(log.metadata)
        : ''

      return [
        log.id,
        log.user_id,
        log.operation,
        log.table_name,
        log.record_id || '',
        log.old_value || '',
        log.new_value || '',
        metadataStr,
        log.ip_address || '',
        log.user_agent || '',
        log.timestamp,
      ]
        .map(value => {
          // Issue 18: Properly escape for RFC 4180 CSV —
          // preserve backslashes (Windows paths) and double internal quotes
          const str = String(value)
          return `"${str.replace(/"/g, '""')}"`
        })
        .join(',')
    })

    return [header, ...rows].join('\n')
  }

  /**
   * Get audit statistics
   *
   * @param userId - Optional user ID to filter by
   * @returns Audit statistics
   */
  public async getStats(userId?: string): Promise<{
    totalLogs: number
    operationCounts: Record<string, number>
    tableCounts: Record<string, number>
    recentActivity: AuditLogEntry[]
    firstLogDate: string
    lastLogDate: string
  }> {
    const db = getDatabaseService().getDb()

    // Total logs
    const totalQuery = userId
      ? 'SELECT COUNT(*) as count FROM audit_logs WHERE user_id = ?'
      : 'SELECT COUNT(*) as count FROM audit_logs'
    const totalResult = db.prepare(totalQuery).get(userId || undefined) as { count: number }

    // Operation counts
    const operationQuery = userId
      ? 'SELECT operation, COUNT(*) as count FROM audit_logs WHERE user_id = ? GROUP BY operation'
      : 'SELECT operation, COUNT(*) as count FROM audit_logs GROUP BY operation'
    const operationRows = db.prepare(operationQuery).all(userId || undefined) as Array<{
      operation: string
      count: number
    }>
    const operationCounts: Record<string, number> = {}
    for (const row of operationRows) {
      operationCounts[row.operation] = row.count
    }

    // Table counts
    const tableQuery = userId
      ? 'SELECT table_name, COUNT(*) as count FROM audit_logs WHERE user_id = ? GROUP BY table_name'
      : 'SELECT table_name, COUNT(*) as count FROM audit_logs GROUP BY table_name'
    const tableRows = db.prepare(tableQuery).all(userId || undefined) as Array<{
      table_name: string
      count: number
    }>
    const tableCounts: Record<string, number> = {}
    for (const row of tableRows) {
      tableCounts[row.table_name] = row.count
    }

    // Recent activity
    const recentActivity = await this.query({ userId, limit: 10 })

    // Date range — query first and last timestamps directly
    const firstDateQuery = userId
      ? 'SELECT timestamp FROM audit_logs WHERE user_id = ? ORDER BY timestamp ASC LIMIT 1'
      : 'SELECT timestamp FROM audit_logs ORDER BY timestamp ASC LIMIT 1'
    const lastDateQuery = userId
      ? 'SELECT timestamp FROM audit_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1'
      : 'SELECT timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 1'

    const firstRow = userId
      ? (db.prepare(firstDateQuery).get(userId) as { timestamp: string } | undefined)
      : (db.prepare(firstDateQuery).get() as { timestamp: string } | undefined)
    const lastRow = userId
      ? (db.prepare(lastDateQuery).get(userId) as { timestamp: string } | undefined)
      : (db.prepare(lastDateQuery).get() as { timestamp: string } | undefined)

    const firstLogDate = firstRow?.timestamp || ''
    const lastLogDate = lastRow?.timestamp || ''

    return {
      totalLogs: totalResult.count,
      operationCounts,
      tableCounts,
      recentActivity,
      firstLogDate,
      lastLogDate,
    }
  }
}

// Singleton instance
let instance: AuditLogger | null = null

export function getAuditLogger(): AuditLogger {
  if (!instance) {
    instance = new AuditLogger()
  }
  return instance
}
