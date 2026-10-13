/**
 * ModelManager — a missing language model is fetched, not just reported.
 *
 * The model is normally downloaded during onboarding. When it is missing
 * afterwards (skipped, failed, or an update changed which model is used), the
 * first AI request has to start the download itself: nothing else will.
 */

import fs from 'fs'
import os from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const downloadLLMForTier = vi.fn<() => Promise<void>>()

vi.mock('../ModelDownloadService', () => ({
  getModelDownloadService: () => ({
    detectHardwareTier: () => ({ tier: 'mid' }),
    downloadLLMForTier,
  }),
}))

import { ModelManager } from '../ModelManager'

/** Lets the manager's background download task reach its next await. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))

describe('ModelManager with no model file on disk', () => {
  let finishDownload: () => void
  let failDownload: (err: Error) => void

  beforeEach(() => {
    // A developer machine may have the real file in resources/models.
    const realExistsSync = fs.existsSync
    vi.spyOn(fs, 'existsSync').mockImplementation(target =>
      String(target).endsWith('.gguf') ? false : realExistsSync(target)
    )
    downloadLLMForTier.mockReset()
    downloadLLMForTier.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          finishDownload = resolve
          failDownload = reject
        })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts the download and says so', async () => {
    const manager = new ModelManager()

    await expect(manager.ensureLLMLoaded()).rejects.toThrow(/being downloaded/)
    await settle()

    expect(downloadLLMForTier).toHaveBeenCalledTimes(1)
    expect(downloadLLMForTier).toHaveBeenCalledWith({ tier: 'mid' })
  })

  it('does not start a second download while one is running', async () => {
    const manager = new ModelManager()

    await expect(manager.ensureLLMLoaded()).rejects.toThrow(/being downloaded/)
    await expect(manager.ensureLLMLoaded()).rejects.toThrow(/being downloaded/)
    await expect(manager.generate({ prompt: 'hello' })).rejects.toThrow(/being downloaded/)
    await settle()

    expect(downloadLLMForTier).toHaveBeenCalledTimes(1)
  })

  it('tries again on the next request after a failed download', async () => {
    const manager = new ModelManager()

    await expect(manager.ensureLLMLoaded()).rejects.toThrow(/being downloaded/)
    await settle()
    failDownload(new Error('network down'))
    await settle()

    await expect(manager.ensureLLMLoaded()).rejects.toThrow(/being downloaded/)
    await settle()
    expect(downloadLLMForTier).toHaveBeenCalledTimes(2)

    finishDownload()
    await settle()
  })

  it.each([
    [8, 'low'],
    [12, 'mid'],
    [32, 'high'],
  ])('uses the Apache-licensed 1.5B model with %i GB of RAM (%s tier)', (gigabytes, tier) => {
    vi.spyOn(os, 'totalmem').mockReturnValue(gigabytes * 1024 ** 3)
    const manager = new ModelManager()

    expect(manager.detectHardwareTier().tier).toBe(tier)
    expect(manager.getLLMModel()).toBe('qwen2.5-1.5b-instruct-q4_k_m.gguf')
  })
})
