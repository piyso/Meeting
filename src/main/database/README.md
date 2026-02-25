# Database Layer

Complete SQLite database implementation for PiyAPI Notes with WAL mode, FTS5 full-text search, and comprehensive CRUD operations.

## Features

- **SQLite with WAL Mode**: Concurrent reads for better performance
- **FTS5 Full-Text Search**: Fast search across transcripts and notes
- **Migration System**: Version-controlled schema changes
- **CRUD Operations**: Complete operations for all tables
- **Type Safety**: Full TypeScript support
- **Transaction Support**: ACID guarantees for data integrity

## Tables

### Core Tables

- **meetings**: Meeting metadata and timing
- **transcripts**: Audio transcription segments with timestamps
- **notes**: User notes with AI augmentation
- **entities**: Extracted entities (people, dates, amounts, topics)
- **sync_queue**: Queue for cloud synchronization
- **encryption_keys**: Encryption keys for cloud sync

### Virtual Tables (FTS5)

- **transcripts_fts**: Full-text search index for transcripts
- **notes_fts**: Full-text search index for notes

## Usage

### Initialize Database

```typescript
import { initializeDatabase, closeDatabase } from './database'

// Initialize with default path
const db = initializeDatabase()

// Initialize with custom path
const db = initializeDatabase({ filename: '/path/to/db.sqlite' })

// Close when done
closeDatabase()
```

### CRUD Operations

```typescript
import { createMeeting, getMeetingById, updateMeeting } from './database'
import { v4 as uuidv4 } from 'uuid'

// Create a meeting
const meeting = createMeeting({
  id: uuidv4(),
  title: 'Team Standup',
  start_time: Date.now(),
  tags: ['standup', 'team'],
})

// Get meeting
const retrieved = getMeetingById(meeting.id)

// Update meeting
const updated = updateMeeting(meeting.id, {
  end_time: Date.now(),
  duration: 1800,
})
```

### Full-Text Search

```typescript
import { searchTranscripts, searchNotes, searchAll } from './database'

// Search transcripts
const transcriptResults = searchTranscripts('budget discussion', {
  limit: 10,
})

// Search notes
const noteResults = searchNotes('action items', {
  meetingId: 'specific-meeting-id',
})

// Search both
const allResults = searchAll('deadline')
console.log(`Found ${allResults.transcripts.length} transcripts`)
console.log(`Found ${allResults.notes.length} notes`)
```

### Transactions

```typescript
import { transaction } from './database'
import { createMeeting, createTranscript } from './database'

// Execute multiple operations atomically
transaction(db => {
  const meeting = createMeeting({
    id: uuidv4(),
    title: 'Important Meeting',
    start_time: Date.now(),
  })

  createTranscript({
    id: uuidv4(),
    meeting_id: meeting.id,
    start_time: 0,
    end_time: 10,
    text: 'First transcript segment',
  })
})
```

## Performance

### Optimizations

- **WAL Mode**: Enables concurrent reads
- **Memory-Mapped I/O**: 2GB mmap for faster access
- **64MB Cache**: Reduces disk I/O
- **Indexes**: Optimized indexes on foreign keys and search columns

### Expected Performance

- **Insert**: 10,000+ transcripts/second
- **Search**: <50ms for 100,000 segments
- **Database Size**: ~1GB for 200 hours of meetings

### Maintenance

```typescript
import { optimizeDatabase, rebuildSearchIndexes } from './database'

// Run periodically to maintain performance
optimizeDatabase() // VACUUM and ANALYZE
rebuildSearchIndexes() // Rebuild FTS5 indexes
```

## Testing

Run unit tests:

```bash
# Run all database tests
node --test src/main/database/__tests__/*.test.ts

# Run specific test file
node --test src/main/database/__tests__/crud.test.ts
```

## Schema Migrations

### Adding a Migration

1. Add migration to `migrations.ts`:

```typescript
{
  version: 2,
  name: 'add_meeting_tags_index',
  up: 'CREATE INDEX idx_meetings_tags ON meetings(tags);',
  down: 'DROP INDEX IF EXISTS idx_meetings_tags;'
}
```

2. Migrations are applied automatically on database initialization

### Migration Commands

```typescript
import { getCurrentVersion, getPendingMigrations, applyPendingMigrations } from './database'

// Check current version
const version = getCurrentVersion(db)

// Get pending migrations
const pending = getPendingMigrations(db)

// Apply all pending
applyPendingMigrations(db)
```

## Database Health

```typescript
import { checkDatabaseHealth } from './database'

const health = checkDatabaseHealth()
console.log('WAL Mode:', health.walMode)
console.log('Foreign Keys:', health.foreignKeys)
console.log('File Size:', health.fileSize)
```

## Backup

```typescript
import { backupDatabase } from './database'

// Backup to file
backupDatabase('/path/to/backup.db')
```

## Architecture

```
database/
├── schema.ts           # SQL schema definitions
├── connection.ts       # Database connection and initialization
├── migrations.ts       # Schema migration system
├── search.ts          # FTS5 search functions
├── crud/              # CRUD operations by table
│   ├── meetings.ts
│   ├── transcripts.ts
│   ├── notes.ts
│   ├── entities.ts
│   ├── sync-queue.ts
│   └── encryption-keys.ts
├── __tests__/         # Unit tests
│   ├── connection.test.ts
│   ├── crud.test.ts
│   └── search.test.ts
└── index.ts           # Main exports
```

## Type Definitions

All database types are defined in `src/types/database.ts`:

- `Meeting`, `CreateMeetingInput`, `UpdateMeetingInput`
- `Transcript`, `CreateTranscriptInput`, `UpdateTranscriptInput`
- `Note`, `CreateNoteInput`, `UpdateNoteInput`
- `Entity`, `CreateEntityInput`, `EntityType`
- `SyncQueueItem`, `CreateSyncQueueInput`, `OperationType`
- `EncryptionKey`, `CreateEncryptionKeyInput`

## Security

### SQL Injection Protection

- All queries use parameterized statements
- Table names validated against whitelist in sync queue
- No dynamic SQL construction

### Foreign Key Constraints

- Enabled by default
- Cascade deletes for referential integrity
- Prevents orphaned records

## Troubleshooting

### Database Locked

If you get "database is locked" errors:

1. Ensure WAL mode is enabled (it is by default)
2. Close all connections properly
3. Check for long-running transactions

### Search Not Working

If FTS5 search returns no results:

```typescript
import { rebuildSearchIndexes } from './database'

// Rebuild indexes
rebuildSearchIndexes()
```

### Performance Issues

If queries are slow:

```typescript
import { optimizeDatabase } from './database'

// Run VACUUM and ANALYZE
optimizeDatabase()
```
