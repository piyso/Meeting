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
 *   const { logger, database, asr } = getServices()
 */

import { Logger } from './Logger'

// ── Service interfaces (minimal, to avoid circular imports) ──

interface AppConfig {
  dbPath: string
  isProduction: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

// #36: Expanded ServiceContainer with lazy getters for all core singletons
interface ServiceContainer {
  /** App configuration */
  config: AppConfig

  /** Module-scoped logger factory */
  logger: typeof Logger

  /** True once the container has been initialized */
  initialized: boolean

  /** Lazy getter for DatabaseService */
  get database(): ReturnType<typeof import('./DatabaseService').getDatabaseService>

  /** Lazy getter for ASRService */
  get asr(): ReturnType<typeof import('./ASRService').getASRService>

  /** Lazy getter for ModelManager */
  get modelManager(): ReturnType<typeof import('./ModelManager').getModelManager>

  /** Lazy getter for AudioPipelineService */
  get audioPipeline(): ReturnType<typeof import('./AudioPipelineService').getAudioPipelineService>

  /** Lazy getter for CloudAccessManager */
  get cloudAccess(): ReturnType<typeof import('./CloudAccessManager').getCloudAccessManager>
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

  // #36: Use lazy getters to avoid circular imports and
  // defer singleton construction until first access
  container = {
    config,
    logger: Logger,
    initialized: true,

    get database() {
      const { getDatabaseService } = require('./DatabaseService')
      return getDatabaseService()
    },

    get asr() {
      const { getASRService } = require('./ASRService')
      return getASRService()
    },

    get modelManager() {
      const { getModelManager } = require('./ModelManager')
      return getModelManager()
    },

    get audioPipeline() {
      const { getAudioPipelineService } = require('./AudioPipelineService')
      return getAudioPipelineService()
    },

    get cloudAccess() {
      const { getCloudAccessManager } = require('./CloudAccessManager')
      return getCloudAccessManager()
    },
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
