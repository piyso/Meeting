/**
 * CrashReporter — nothing leaves the device without consent, and what does
 * leave carries no trace of who or where.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  options: { enabled: true } as { enabled: boolean },
}))
vi.mock('@sentry/electron', () => ({
  ...sentry,
  getClient: () => ({ getOptions: () => sentry.options }),
}))

const env = vi.hoisted(() => ({ dsn: 'https://key@o1.ingest.sentry.test/1' }))
vi.mock('../../config/environment', () => ({
  config: {
    get SENTRY_DSN() {
      return env.dsn
    },
    IS_DEV: false,
    LOG_LEVEL: 'error',
  },
}))

async function freshReporter() {
  vi.resetModules()
  // `require('@sentry/electron')` inside the service resolves outside vitest's
  // module graph; hand it the fake through the require cache instead.
  const id = require.resolve('@sentry/electron')
  require.cache[id] = {
    id,
    filename: id,
    loaded: true,
    exports: { ...sentry, getClient: () => ({ getOptions: () => sentry.options }) },
  } as unknown as NodeJS.Module
  return import('../CrashReporter')
}

beforeEach(() => {
  env.dsn = 'https://key@o1.ingest.sentry.test/1'
  sentry.options.enabled = true
  for (const fn of [sentry.init, sentry.captureException, sentry.addBreadcrumb, sentry.setUser]) {
    fn.mockClear()
  }
})

describe('consent', () => {
  it('does not start the SDK until the user says yes', async () => {
    const { CrashReporter } = await freshReporter()
    CrashReporter.init()
    CrashReporter.addBreadcrumb('lifecycle', 'Database initialized')
    CrashReporter.captureException(new Error('boom'))
    expect(sentry.init).not.toHaveBeenCalled()
    expect(sentry.captureException).not.toHaveBeenCalled()

    CrashReporter.setConsent(false)
    expect(sentry.init).not.toHaveBeenCalled()

    CrashReporter.setConsent(true)
    expect(sentry.init).toHaveBeenCalledTimes(1)
    // What led up to it is not lost.
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'lifecycle', message: 'Database initialized' })
    )

    CrashReporter.captureException(new Error('boom again'))
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('stops sending when the user says no again', async () => {
    const { CrashReporter } = await freshReporter()
    CrashReporter.init()
    CrashReporter.setConsent(true)
    const options = sentry.init.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => unknown
      beforeBreadcrumb: (crumb: Record<string, unknown>) => unknown
    }
    expect(options.beforeSend({ message: 'x' })).not.toBeNull()

    CrashReporter.setConsent(false)
    expect(sentry.options.enabled).toBe(false)
    expect(options.beforeSend({ message: 'x' })).toBeNull()
    expect(options.beforeBreadcrumb({ message: 'x' })).toBeNull()
  })

  it('never starts in a build without a DSN, whatever the setting', async () => {
    env.dsn = ''
    const { CrashReporter } = await freshReporter()
    CrashReporter.init()
    CrashReporter.setConsent(true)
    expect(sentry.init).not.toHaveBeenCalled()
    expect(CrashReporter.isConfigured()).toBe(false)
  })

  it('asks for no personal data and no performance traces', async () => {
    const { CrashReporter } = await freshReporter()
    CrashReporter.init()
    CrashReporter.setConsent(true)
    expect(sentry.init.mock.calls[0]?.[0]).toMatchObject({
      sendDefaultPii: false,
      tracesSampleRate: 0,
    })
  })

  it('reports a stand-in for the account, never its id', async () => {
    const { CrashReporter, anonymousId } = await freshReporter()
    CrashReporter.init()
    CrashReporter.setConsent(true)
    CrashReporter.setContext({ userId: '6f1c2f0e-real-account-id', planTier: 'pro' })
    const sent = sentry.setUser.mock.calls.at(-1)?.[0] as { id: string }
    expect(sent.id).toBe(anonymousId('6f1c2f0e-real-account-id'))
    expect(sent.id).not.toContain('real-account-id')
    expect(sent.id).toHaveLength(16)
  })
})

describe('what a report is allowed to contain', () => {
  it('takes the home directory, hostname, request and breadcrumb payloads out', async () => {
    const { scrubEvent } = await freshReporter()
    const home = '/Users/asha.verma'
    const event = scrubEvent(
      {
        message: `ENOENT: no such file, open '${home}/Library/Application Support/BlueArkive/data.db'`,
        server_name: 'Ashas-MacBook-Pro.local',
        request: { url: 'file:///Users/asha.verma/app/index.html', headers: { cookie: 'x' } },
        user: { id: 'abc123', email: 'asha@example.com', ip_address: '203.0.113.9' },
        exception: {
          values: [
            {
              value: `Cannot read ${home}/Documents/Q4 board notes.md`,
              stacktrace: {
                frames: [{ filename: `${home}/app/dist-electron/main.js`, lineno: 10 }],
              },
            },
          ],
        },
        breadcrumbs: [
          {
            category: 'ipc',
            message: 'note:update',
            timestamp: 1,
            data: { text: 'salary discussion with Ravi' },
          },
        ],
      },
      home
    )

    const flat = JSON.stringify(event)
    expect(flat).not.toContain('asha.verma')
    expect(flat).not.toContain('Ashas-MacBook-Pro')
    expect(flat).not.toContain('asha@example.com')
    expect(flat).not.toContain('203.0.113.9')
    expect(flat).not.toContain('salary discussion')
    expect(flat).not.toContain('cookie')
    // Still useful: where it happened and what kind of thing went wrong.
    expect(flat).toContain('~/app/dist-electron/main.js')
    expect(flat).toContain('note:update')
    expect(event.user).toEqual({ id: 'abc123' })
  })

  it('handles Windows home directories in both spellings', async () => {
    const { scrubPaths } = await freshReporter()
    const home = 'C:\\Users\\asha'
    expect(scrubPaths('open C:\\Users\\asha\\AppData\\x.db failed', home)).toBe(
      'open ~\\AppData\\x.db failed'
    )
    expect(scrubPaths('file:///C:/Users/asha/app/index.html', home)).toBe(
      'file:///~/app/index.html'
    )
  })
})
