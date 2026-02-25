/**
 * Vitest Global Setup — Mocks for native C++ modules
 *
 * Only mocks modules that cause ERR_DLOPEN_FAILED in test env.
 * Individual test files handle their own Electron/service mocks.
 */

import { vi, beforeEach } from 'vitest'

// ─── Mock: electron (not a native module but required by most services) ──
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/tmp/test-electron/${name}`),
    isPackaged: false,
    isReady: vi.fn().mockResolvedValue(true),
    whenReady: vi.fn().mockResolvedValue(undefined),
    getName: vi.fn(() => 'PiyAPI Notes'),
    getVersion: vi.fn(() => '0.1.0'),
    quit: vi.fn(),
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
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

// ─── In-memory data store for database mock ──────────────────
const tables: Record<string, Record<string, any>[]> = {}

function getOrCreateTable(name: string): Record<string, any>[] {
  if (!tables[name]) tables[name] = []
  return tables[name]
}

// Parse simple SQL for mock operations
function parseSQLTable(sql: string): string {
  const match = sql.match(/(?:FROM|INTO|UPDATE|DELETE FROM)\s+(\w+)/i)
  return match ? match[1] : 'unknown'
}

// ─── Mock: database connection ───────────────────────────────
const mockStatement = {
  run: vi.fn((..._args: any[]) => ({ changes: 1, lastInsertRowid: 1 })),
  get: vi.fn((..._args: any[]) => undefined),
  all: vi.fn((..._args: any[]) => []),
  pluck: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  iterate: vi.fn(() => [][Symbol.iterator]()),
}

const mockDb = {
  prepare: vi.fn((_sql: string) => ({
    ...mockStatement,
    run: vi.fn((...args: any[]) => {
      const sql = _sql.toLowerCase()
      const table = parseSQLTable(_sql)
      if (sql.startsWith('insert')) {
        getOrCreateTable(table).push({ args })
        return { changes: 1, lastInsertRowid: getOrCreateTable(table).length }
      }
      if (sql.startsWith('delete')) {
        tables[table] = []
        return { changes: 1, lastInsertRowid: 0 }
      }
      if (sql.startsWith('update')) {
        return { changes: 1, lastInsertRowid: 0 }
      }
      return { changes: 0, lastInsertRowid: 0 }
    }),
    get: vi.fn((..._args: any[]) => {
      const sql = _sql.toLowerCase()
      const table = parseSQLTable(_sql)
      // Handle COUNT(*) queries
      if (sql.includes('count(*)')) {
        return { count: 0 }
      }
      // Handle schema_version queries
      if (sql.includes('schema_version')) {
        return { version: 1 }
      }
      const rows = getOrCreateTable(table)
      if (sql.includes('where id')) return rows[0] || undefined
      if (sql.includes('select')) return rows[0] || undefined
      return undefined
    }),
    all: vi.fn(() => {
      const table = parseSQLTable(_sql)
      return getOrCreateTable(table)
    }),
    pluck: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    iterate: vi.fn(() => [][Symbol.iterator]()),
  })),
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
  transaction: vi.fn((fn: Function) => (...args: any[]) => fn(...args)),
  backup: vi.fn(),
}

vi.mock('../main/database/connection', () => ({
  getDatabase: vi.fn(() => mockDb),
  getDatabasePath: vi.fn(() => '/tmp/test-piyapi-notes.db'),
  initializeDatabase: vi.fn(() => mockDb),
  closeDatabase: vi.fn(),
  transaction: vi.fn((fn: Function) => fn(mockDb)),
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

// ─── Mock: DatabaseService (wrapper around connection) ───────
const mockDbService = {
  initialize: vi.fn(),
  getDb: vi.fn(() => mockDb),
  run: vi.fn((..._args: any[]) => ({ changes: 1, lastInsertRowid: 1 })),
  get: vi.fn((..._args: any[]) => undefined),
  all: vi.fn((..._args: any[]) => []),
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

// ─── Mock: database schema (imported by connection.ts) ───────
vi.mock('../main/database/schema', () => ({
  INITIALIZE_SCHEMA: '',
  SCHEMA_VERSION: 1,
}))

// ─── Mock: keytar (native C++ binary) ────────────────────────
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(true),
    findCredentials: vi.fn().mockResolvedValue([]),
  },
  getPassword: vi.fn().mockResolvedValue(null),
  setPassword: vi.fn().mockResolvedValue(undefined),
  deletePassword: vi.fn().mockResolvedValue(true),
  findCredentials: vi.fn().mockResolvedValue([]),
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
  Tensor: vi.fn().mockImplementation((type: string, data: any, dims: number[]) => ({
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
  // Clear in-memory tables between tests
  Object.keys(tables).forEach((key) => delete tables[key])
})
