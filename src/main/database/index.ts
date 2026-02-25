/**
 * Database Module Index
 *
 * Main entry point for all database operations
 */

// Connection management
export {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  getDatabasePath,
  transaction,
  checkDatabaseHealth,
  optimizeDatabase,
  backupDatabase,
} from './connection'

// Schema
export { SCHEMA_VERSION, INITIALIZE_SCHEMA } from './schema'

// Migrations
export {
  getCurrentVersion,
  getPendingMigrations,
  applyMigration,
  applyPendingMigrations,
  rollbackMigration,
  getMigrationHistory,
  validateMigrations,
  resetToVersion,
} from './migrations'

// CRUD operations
export * from './crud'

// Search
export {
  searchTranscripts,
  searchNotes,
  searchAll,
  getSearchSuggestions,
  countSearchResults,
  rebuildSearchIndexes,
  optimizeSearchIndexes,
} from './search'
