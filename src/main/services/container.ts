/**
 * Service Container — Lightweight dependency injection
 *
 * Replaces scattered singleton getters with a single factory that
 * creates all core services in the correct dependency order.
 * This makes testing easier (inject mocks) and startup more explicit.
 *
 * Usage:
 *   import { initServiceContainer, getServices } from '../services/container'
 *
 *   // At app startup:
 *   initServiceContainer(appConfig)
 *
 *   // Anywhere that needs services:
 *   const { logger, config } = getServices()
 */

import { Logger } from './Logger'

// ── Service interfaces (minimal, to avoid circular imports) ──

interface AppConfig {
  dbPath: string
  isProduction: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

interface ServiceContainer {
  /** App configuration */
  config: AppConfig

  /** Module-scoped logger factory */
  logger: typeof Logger

  /** True once the container has been initialized */
  initialized: boolean
}

// ── Singleton container ──

let container: ServiceContainer | null = null

/**
 * Initialize the service container.
 * Call once during app startup (in main.ts), before registering IPC handlers.
 *
 * @param config - Application configuration
 * @returns The initialized ServiceContainer
 */
export function initServiceContainer(config: AppConfig): ServiceContainer {
  if (container?.initialized) {
    Logger.create('Container').warn(
      'Service container already initialized — returning existing instance'
    )
    return container
  }

  const log = Logger.create('Container')
  log.info('Initializing service container', {
    dbPath: config.dbPath,
    isProduction: config.isProduction,
  })

  container = {
    config,
    logger: Logger,
    initialized: true,
  }

  log.info('Service container initialized successfully')
  return container
}

/**
 * Get the initialized service container.
 * Throws if called before `initServiceContainer()`.
 */
export function getServices(): ServiceContainer {
  if (!container?.initialized) {
    throw new Error(
      'Service container not initialized. Call initServiceContainer() during app startup.'
    )
  }
  return container
}

/**
 * Reset the container (for testing only).
 */
export function resetServiceContainer(): void {
  container = null
}
