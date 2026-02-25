/**
 * Vitest Global Setup — Mocks for native C++ modules only
 *
 * Only mocks modules that cause ERR_DLOPEN_FAILED in test env.
 * Individual test files handle their own Electron mocks.
 */

import { vi } from 'vitest'

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
  const mockStatement = {
    run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
    get: vi.fn().mockReturnValue(undefined),
    all: vi.fn().mockReturnValue([]),
    pluck: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
  }

  const mockDb = {
    prepare: vi.fn().mockReturnValue(mockStatement),
    exec: vi.fn(),
    pragma: vi.fn().mockReturnValue([]),
    close: vi.fn(),
    transaction: vi.fn((fn: Function) => fn),
  }

  return { default: vi.fn().mockReturnValue(mockDb) }
})
