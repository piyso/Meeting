/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Vitest Global Setup — Mocks for native C++ modules + Electron
 *
 * Provides:
 * - In-memory database with row-level tracking (INSERT/SELECT/UPDATE/DELETE)
 * - Electron mock (app, ipcMain, BrowserWindow, dialog, etc.)
 * - Native binary mocks (keytar, onnxruntime-node, better-sqlite3)
 *
 * NOTE: This file intentionally uses `any` for mock row data since it simulates
 * SQLite's dynamically-typed rows. Strict typing here creates cascading errors
 * with zero runtime safety benefit in test mocks.
 */

import { vi, beforeEach } from 'vitest'

// ─── Mock: electron ──────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/tmp/test-electron/${name}`),
    isPackaged: false,
    isReady: vi.fn().mockResolvedValue(true),
    whenReady: vi.fn().mockResolvedValue(undefined),
    getName: vi.fn(() => 'BlueArkive'),
    getVersion: vi.fn(() => '0.1.0'),
    quit: vi.fn(),
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  ipcRenderer: {
    send: vi.fn(),
    on: vi.fn((_channel: string, _callback: (...args: unknown[]) => void) => () => {}),
    once: vi.fn((_channel: string, _callback: (...args: unknown[]) => void) => {}),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    invoke: vi.fn(),
  },
  process: {
    platform: 'darwin',
    env: {},
    versions: {
      node: '18',
      electron: '28',
    },
  },
  contextBridge: {
    exposeInMainWorld: vi.fn((apiKey: string, api: unknown) => {
      ;(window as unknown as Record<string, unknown>)[apiKey] = api
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null),
  },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
  shell: {
    openExternal: vi.fn(),
  },
  systemPreferences: {
    getMediaAccessStatus: vi.fn(() => 'unknown'),
  },
  nativeTheme: {
    shouldUseDarkColors: true,
    on: vi.fn(),
  },
}))

// ─── In-memory row store ─────────────────────────────────────
// Key: table name. Value: array of row objects.

const store: Record<string, Record<string, any>[]> = {}

function getTable(name: string): Record<string, any>[] {
  if (!store[name]) store[name] = []
  return store[name]!
}

/** Parse table name from SQL */
function parseTable(sql: string): string {
  const m =
    sql.match(/\bFROM\s+(\w+)/i) || sql.match(/\bINTO\s+(\w+)/i) || sql.match(/\bUPDATE\s+(\w+)/i)
  return m ? m[1]! : '_default'
}

/** Parse column names from INSERT INTO table (col1, col2, ...) */
function parseInsertCols(sql: string): string[] {
  const m = sql.match(/\(\s*([^)]+)\s*\)\s*VALUES/i)
  if (!m || !m[1]) return []
  return m[1].split(',').map(c => c.trim())
}

/** Parse ALL WHERE conditions with operators (handles AND) */
function parseWhereConditions(sql: string): Array<{ col: string; op: string }> {
  const whereStart = sql.toLowerCase().indexOf('where')
  if (whereStart === -1) return []
  const wherePart = sql.substring(whereStart)
  // Match col operator ? patterns: =, >=, <=, >, <, LIKE
  const matches = wherePart.matchAll(/(\w+)\s*(>=|<=|>|<|=|LIKE)\s*\?/gi)
  const conditions: Array<{ col: string; op: string }> = []
  for (const m of matches) {
    conditions.push({ col: m[1]!, op: m[2]!.toUpperCase() })
  }
  return conditions
}

/** Parse ALL WHERE col = ? conditions (handles AND) */
function parseWhereCols(sql: string): string[] {
  return parseWhereConditions(sql).map(c => c.col)
}

/** Parse SET col = ?, col2 = ? from UPDATE */
function parseSetCols(sql: string): string[] {
  const m = sql.match(/SET\s+(.+?)\s*(?:WHERE|$)/i)
  if (!m || !m[1]) return []
  return m[1].split(',').map(p => p.split('=')[0]!.trim())
}

// ─── Smart statement factory ─────────────────────────────────
function createStatement(sql: string) {
  const table = parseTable(sql)
  const sqlLower = sql.toLowerCase().trim()

  return {
    run: vi.fn((...args: any[]) => {
      if (sqlLower.startsWith('insert')) {
        const cols = parseInsertCols(sql)
        const row: Record<string, any> = {}
        cols.forEach((col, i) => {
          row[col] = args[i] !== undefined ? args[i] : null
        })
        getTable(table).push(row)
        return { changes: 1, lastInsertRowid: getTable(table).length }
      }

      if (sqlLower.startsWith('update')) {
        const setCols = parseSetCols(sql)
        const whereCols = parseWhereCols(sql)
        const rows = getTable(table)

        // Args layout: SET values first, then WHERE values
        if (whereCols.length > 0) {
          const target = rows.find(r =>
            whereCols.every((col, i) => {
              const argVal = args[setCols.length + i]
              return argVal === undefined || r[col] === argVal
            })
          )
          if (target) {
            setCols.forEach((col, i) => {
              target[col] = args[i]
            })
            return { changes: 1, lastInsertRowid: 0 }
          }
        }
        return { changes: 0, lastInsertRowid: 0 }
      }

      if (sqlLower.startsWith('delete')) {
        const whereConditions = parseWhereConditions(sql)
        if (whereConditions.length > 0) {
          const beforeLen = getTable(table).length
          store[table] = getTable(table).filter(r => {
            // Keep row if it does NOT match all WHERE conditions
            return !whereConditions.every((cond, i) => {
              const argVal = args[i]
              const { col, op } = cond
              if (op === 'LIKE') {
                const pattern = String(argVal)
                const val = String(r[col] || '')
                if (pattern.endsWith('%') && pattern.startsWith('%')) {
                  return val.includes(pattern.slice(1, -1))
                }
                if (pattern.endsWith('%')) {
                  return val.startsWith(pattern.slice(0, -1))
                }
                if (pattern.startsWith('%')) {
                  return val.endsWith(pattern.slice(1))
                }
                return val === pattern
              }
              return r[col] === argVal
            })
          })
          return { changes: beforeLen - getTable(table).length, lastInsertRowid: 0 }
        }
        store[table] = []
        return { changes: 1, lastInsertRowid: 0 }
      }

      // CREATE TABLE, etc.
      return { changes: 0, lastInsertRowid: 0 }
    }),

    get: vi.fn((...args: any[]) => {
      // COUNT(*) queries
      if (sqlLower.includes('count(*)')) {
        const whereConditions = parseWhereConditions(sql)
        let rows = getTable(table)
        whereConditions.forEach((cond, i) => {
          if (args[i] !== undefined) {
            const { col, op } = cond
            const argVal = args[i]
            if (op === 'LIKE') {
              const pattern = String(argVal)
              rows = rows.filter(r => {
                const val = String(r[col] || '')
                if (pattern.endsWith('%') && pattern.startsWith('%'))
                  return val.includes(pattern.slice(1, -1))
                if (pattern.endsWith('%')) return val.startsWith(pattern.slice(0, -1))
                if (pattern.startsWith('%')) return val.endsWith(pattern.slice(1))
                return val === pattern
              })
            } else {
              rows = rows.filter(r => {
                const rowVal = r[col]
                switch (op) {
                  case '>=':
                    return rowVal >= argVal
                  case '<=':
                    return rowVal <= argVal
                  case '>':
                    return rowVal > argVal
                  case '<':
                    return rowVal < argVal
                  case '=':
                  default:
                    return rowVal === argVal
                }
              })
            }
          }
        })
        return { count: rows.length }
      }

      // Schema version
      if (sqlLower.includes('schema_version')) {
        return { version: 1 }
      }

      // SELECT with WHERE (multi-column with operator support)
      const whereConditions = parseWhereConditions(sql)
      if (whereConditions.length > 0 && args[0] !== undefined) {
        return (
          getTable(table).find(r => {
            return whereConditions.every((cond, i) => {
              if (args[i] === undefined) return true
              const { col, op } = cond
              const argVal = args[i]
              const rowVal = r[col]
              switch (op) {
                case '>=':
                  return rowVal >= argVal
                case '<=':
                  return rowVal <= argVal
                case '>':
                  return rowVal > argVal
                case '<':
                  return rowVal < argVal
                case '=':
                default:
                  return rowVal === argVal
              }
            })
          }) || undefined
        )
      }

      // SELECT without WHERE (return first row)
      const rows = getTable(table)
      return rows.length > 0 ? rows[0] : undefined
    }),

    all: vi.fn((...args: any[]) => {
      // GROUP BY queries
      if (sqlLower.includes('group by')) {
        const groupCol = sql.match(/GROUP BY\s+(\w+)/i)?.[1]
        const rows = getTable(table)
        const whereCols = parseWhereCols(sql)
        let filtered = rows
        whereCols.forEach((col, i) => {
          if (args[i] !== undefined) {
            filtered = filtered.filter(r => r[col] === args[i])
          }
        })
        if (groupCol) {
          const groups: Record<string, number> = {}
          filtered.forEach(r => {
            const key = r[groupCol] || 'unknown'
            groups[key] = (groups[key] || 0) + 1
          })
          return Object.entries(groups).map(([key, count]) => ({
            [groupCol]: key,
            count,
          }))
        }
        return []
      }

      // Regular SELECT with multi-column WHERE
      const whereConditions = parseWhereConditions(sql)
      let rows = getTable(table)

      // Apply WHERE filters with operator support
      let argIdx = 0
      whereConditions.forEach(cond => {
        if (args[argIdx] !== undefined) {
          const { col, op } = cond
          if (op === 'LIKE') {
            // Handle LIKE operator
            const pattern = String(args[argIdx])
            rows = rows.filter(r => {
              const val = String(r[col] || '')
              if (pattern.endsWith('%') && pattern.startsWith('%')) {
                return val.includes(pattern.slice(1, -1))
              }
              if (pattern.endsWith('%')) {
                return val.startsWith(pattern.slice(0, -1))
              }
              if (pattern.startsWith('%')) {
                return val.endsWith(pattern.slice(1))
              }
              return val === pattern
            })
          } else {
            // Apply comparison operator (=, >=, <=, >, <)
            const argVal = args[argIdx]
            rows = rows.filter(r => {
              const rowVal = r[col]
              switch (op) {
                case '>=':
                  return rowVal >= argVal
                case '<=':
                  return rowVal <= argVal
                case '>':
                  return rowVal > argVal
                case '<':
                  return rowVal < argVal
                case '=':
                default:
                  return rowVal === argVal
              }
            })
          }
        }
        argIdx++
      })

      // Apply ORDER BY (ASC or DESC)
      if (sqlLower.includes('order by')) {
        const orderCol = sql.match(/ORDER BY\s+(\w+)/i)?.[1]
        const isDesc = sqlLower.includes('desc')
        if (orderCol) {
          rows = [...rows].sort((a, b) => {
            const cmp = String(a[orderCol] || '').localeCompare(String(b[orderCol] || ''))
            return isDesc ? -cmp : cmp
          })
        }
      }

      // Apply LIMIT
      if (sqlLower.includes('limit ?')) {
        // Find the limit value in args (it's after WHERE args)
        const limitVal = args[argIdx]
        if (typeof limitVal === 'number' && limitVal > 0) {
          // Check for OFFSET
          if (sqlLower.includes('offset ?')) {
            const offsetVal = args[argIdx + 1]
            if (typeof offsetVal === 'number') {
              rows = rows.slice(offsetVal, offsetVal + limitVal)
            } else {
              rows = rows.slice(0, limitVal)
            }
          } else {
            rows = rows.slice(0, limitVal)
          }
        }
        argIdx++ // consume limit arg
        if (sqlLower.includes('offset ?')) argIdx++ // consume offset arg
      } else if (sqlLower.includes('offset ?')) {
        // Standalone OFFSET (no LIMIT)
        const offsetVal = args[argIdx]
        if (typeof offsetVal === 'number' && offsetVal > 0) {
          rows = rows.slice(offsetVal)
        }
        argIdx++
      }

      return rows
    }),

    pluck: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    iterate: vi.fn(function* () {
      yield* getTable(table)
    }),
  }
}

// ─── Mock database object ────────────────────────────────────
const mockDb = {
  prepare: vi.fn((sql: string) => createStatement(sql)),
  exec: vi.fn(),
  pragma: vi.fn((_pragma: string) => {
    if (_pragma.includes('journal_mode')) return 'wal'
    if (_pragma.includes('foreign_keys')) return 1
    if (_pragma.includes('cache_size')) return -64000
    if (_pragma.includes('page_count')) return 100
    if (_pragma.includes('page_size')) return 4096
    if (_pragma.includes('freelist_count')) return 0
    return []
  }),
  close: vi.fn(),
  transaction: vi.fn(
    (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        fn(...args)
  ),
  backup: vi.fn(),
}

// ─── Mock: database connection ───────────────────────────────
vi.mock('../main/database/connection', () => ({
  getDatabase: vi.fn(() => mockDb),
  getDatabasePath: vi.fn(() => '/tmp/test-bluearkive.db'),
  initializeDatabase: vi.fn(() => mockDb),
  closeDatabase: vi.fn(),
  transaction: vi.fn((fn: (...args: unknown[]) => unknown) => fn(mockDb)),
  checkDatabaseHealth: vi.fn(() => ({
    isHealthy: true,
    walMode: true,
    foreignKeys: true,
    cacheSize: -64000,
    pageCount: 100,
    pageSize: 4096,
    fileSize: 409600,
  })),
  optimizeDatabase: vi.fn(),
  walCheckpoint: vi.fn(),
  walHealthCheck: vi.fn(),
  backupDatabase: vi.fn(),
}))

// ─── Mock: DatabaseService ───────────────────────────────────
const mockDbService = {
  initialize: vi.fn(),
  getDb: vi.fn(() => mockDb),
  close: vi.fn(),
  run: vi.fn((..._args: unknown[]) => ({ changes: 1, lastInsertRowid: 1 })),
  get: vi.fn((..._args: unknown[]) => undefined),
  all: vi.fn((..._args: unknown[]) => []),
  exec: vi.fn(),
  getNote: vi.fn().mockReturnValue(undefined),
  getAllNotes: vi.fn().mockReturnValue([]),
  createNote: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
  updateNote: vi.fn().mockReturnValue({ changes: 1 }),
  deleteNote: vi.fn().mockReturnValue({ changes: 1 }),
  searchNotes: vi.fn().mockReturnValue([]),
  getSetting: vi.fn().mockReturnValue(undefined),
  setSetting: vi.fn(),
  getAllSettings: vi.fn().mockReturnValue({}),
  deleteSetting: vi.fn(),
}

vi.mock('../main/services/DatabaseService', () => ({
  getDatabaseService: vi.fn(() => mockDbService),
  DatabaseService: vi.fn().mockImplementation(() => mockDbService),
}))

// ─── Mock: database schema ───────────────────────────────────
vi.mock('../main/database/schema', () => ({
  INITIALIZE_SCHEMA: '',
  SCHEMA_VERSION: 1,
}))

// ─── Mock: keytar (native C++ binary with state) ─────────────
const keytarStore: Record<string, string> = {}

function keytarKey(service: string, account: string): string {
  return `${service}::${account}`
}

const keytarGetPassword = vi.fn(async (service: string, account: string) => {
  return keytarStore[keytarKey(service, account)] || null
})
const keytarSetPassword = vi.fn(async (service: string, account: string, password: string) => {
  keytarStore[keytarKey(service, account)] = password
})
const keytarDeletePassword = vi.fn(async (service: string, account: string) => {
  const key = keytarKey(service, account)
  if (key in keytarStore) {
    delete keytarStore[key]
    return true
  }
  return false
})
const keytarFindCredentials = vi.fn(async (_service: string) => [])

vi.mock('keytar', () => ({
  default: {
    getPassword: keytarGetPassword,
    setPassword: keytarSetPassword,
    deletePassword: keytarDeletePassword,
    findCredentials: keytarFindCredentials,
  },
  getPassword: keytarGetPassword,
  setPassword: keytarSetPassword,
  deletePassword: keytarDeletePassword,
  findCredentials: keytarFindCredentials,
}))

// ─── Mock: onnxruntime-node (native C++ binary) ──────────────
vi.mock('onnxruntime-node', () => ({
  InferenceSession: {
    create: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue({
        output: { data: new Float32Array([0]) },
      }),
      release: vi.fn().mockResolvedValue(undefined),
    }),
  },
  Tensor: vi.fn().mockImplementation((type: string, data: unknown, dims: number[]) => ({
    type,
    data,
    dims,
  })),
  env: {
    wasm: { numThreads: 1 },
  },
}))

// ─── Mock: better-sqlite3 (native C++ binary) ────────────────
vi.mock('better-sqlite3', () => {
  return { default: vi.fn().mockReturnValue(mockDb) }
})

// ─── Clean up between tests ──────────────────────────────────
beforeEach(() => {
  Object.keys(store).forEach(key => delete store[key])
})
