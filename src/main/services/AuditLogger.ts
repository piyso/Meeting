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
  metadata?: Record<string, any>
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
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
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
    newValue: any,
    metadata?: Record<string, any>
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
    oldValue: any,
    newValue: any,
    metadata?: Record<string, any>
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
    oldValue: any,
    metadata?: Record<string, any>
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
    metadata?: Record<string, any>
  ): Promise<AuditLogEntry> {
    return this.log({
      userId,
      operation: 'login',
      table: 'users',
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
  public async logLogout(userId: string, metadata?: Record<string, any>): Promise<AuditLogEntry> {
    return this.log({
      userId,
      operation: 'logout',
      table: 'users',
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
    metadata?: Record<string, any>
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
    const params: any[] = []

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

    sql += ' ORDER BY timestamp DESC'

    if (query.limit) {
      sql += ' LIMIT ?'
      params.push(query.limit)
    }

    if (query.offset) {
      sql += ' OFFSET ?'
      params.push(query.offset)
    }

    const rows = db.prepare(sql).all(...params) as any[]

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      operation: row.operation,
      table: row.table_name,
      recordId: row.record_id,
      oldValue: row.old_value,
      newValue: row.new_value,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      timestamp: row.timestamp,
    }))
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
    const params: any[] = []

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
    const logs = await this.query(query)

    if (logs.length === 0) {
      return ''
    }

    // CSV header
    const header = [
      'ID',
      'User ID',
      'Operation',
      'Table',
      'Record ID',
      'Old Value',
      'New Value',
      'Metadata',
      'IP Address',
      'User Agent',
      'Timestamp',
    ].join(',')

    // CSV rows
    const rows = logs.map(log =>
      [
        log.id,
        log.userId,
        log.operation,
        log.table,
        log.recordId || '',
        log.oldValue || '',
        log.newValue || '',
        log.metadata ? JSON.stringify(log.metadata) : '',
        log.ipAddress || '',
        log.userAgent || '',
        log.timestamp,
      ]
        .map(value => `"${String(value).replace(/"/g, '""')}"`)
        .join(',')
    )

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

    return {
      totalLogs: totalResult.count,
      operationCounts,
      tableCounts,
      recentActivity,
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
