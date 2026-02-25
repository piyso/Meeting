# Backend Quick Start Guide

Quick reference for using the newly implemented backend services.

---

## Installation

```bash
# Install required dependencies
npm install yjs y-protocols

# Run database migration (add to migrations.ts first)
npm run migrate
```

---

## 1. Conflict Resolution

### Basic Usage

```typescript
import { getConflictResolver } from './services/ConflictResolver'

// Initialize with device ID
const resolver = getConflictResolver('device-abc-123')

// Sync note with remote version
const conflict = await resolver.syncNote(
  noteId,
  remoteVersion,
  remoteClock,
  remoteUpdate // Optional Yjs update
)

if (conflict && !conflict.autoResolved) {
  // Show conflict resolution UI to user
  // User chooses: 'keep_local', 'keep_remote', or 'merge'

  const resolution = await resolver.manualResolve(
    conflict,
    'keep_local', // User's choice
    customMergedVersion // Only if strategy is 'merge'
  )

  await resolver.applyResolution(resolution)
}
```

### Auto-Resolution with Yjs

```typescript
// Yjs automatically merges concurrent edits
const conflict = await resolver.syncNote(
  noteId,
  remoteVersion,
  remoteClock,
  remoteYjsUpdate // Yjs handles merging
)

// conflict will be null if auto-resolved
if (!conflict) {
  console.log('Conflict auto-resolved by Yjs')
}
```

---

## 2. Device Management

### Register Device

```typescript
import { getDeviceManager } from './services/DeviceManager'

const manager = getDeviceManager()

const result = await manager.registerDevice(
  userId,
  'My MacBook Pro' // Optional custom name
)

if (result.limitReached) {
  // Show "Device Wall" upgrade prompt
  showUpgradeDialog({
    title: 'Device Limit Reached',
    message: `You've reached your device limit (${result.maxDevices} devices). Upgrade to Pro for unlimited devices.`,
    action: 'Upgrade to Pro',
  })
} else if (result.isNewDevice) {
  console.log(`New device registered: ${result.device.id}`)
} else {
  console.log(`Device already registered: ${result.device.id}`)
}
```

### Get Device List

```typescript
const devices = await manager.getDevices(userId)

devices.forEach(device => {
  console.log(`${device.deviceName} (${device.platform})`)
  console.log(`  Active: ${device.isActive}`)
  console.log(`  Last sync: ${device.lastSyncAt}`)
})
```

### Deactivate Device

```typescript
await manager.deactivateDevice(deviceId, userId)
```

---

## 3. Audit Logging

### Log Operations

```typescript
import { getAuditLogger } from './services/AuditLogger'

const logger = getAuditLogger()

// Log create
await logger.logCreate(userId, 'notes', noteId, noteData)

// Log update
await logger.logUpdate(userId, 'notes', noteId, oldData, newData)

// Log delete
await logger.logDelete(userId, 'notes', noteId, oldData)

// Log login
await logger.logLogin(userId, ipAddress, userAgent)

// Log custom operation
await logger.log({
  userId,
  operation: 'device_register',
  table: 'devices',
  recordId: deviceId,
  metadata: { deviceName: 'MacBook Pro' },
})
```

### Query Logs

```typescript
// Get user's logs
const logs = await logger.getUserLogs(userId, 100, 0)

// Query with filters
const logs = await logger.query({
  userId,
  operation: 'create',
  table: 'notes',
  startDate: '2026-02-01',
  endDate: '2026-02-28',
  limit: 100,
  offset: 0,
})

// Export to CSV
const csv = await logger.exportToCSV({ userId })

// Get statistics
const stats = await logger.getStats(userId)
console.log(`Total logs: ${stats.totalLogs}`)
console.log(`Operations:`, stats.operationCounts)
```

---

## 4. Vector Clocks

### Basic Operations

```typescript
import { VectorClockManager } from './services/VectorClockManager'

const manager = new VectorClockManager()

// Initialize clock
const clock = manager.initializeForDevice('device-a')
// { 'device-a': 0 }

// Increment on local change
const updated = manager.increment(clock, 'device-a')
// { 'device-a': 1 }

// Compare clocks
const comparison = manager.compare(localClock, remoteClock)
// Returns: 'local_newer' | 'remote_newer' | 'concurrent'

if (comparison === 'concurrent') {
  console.log('Conflict detected!')
}

// Merge clocks
const merged = manager.merge(localClock, remoteClock)
// Takes max timestamp for each device
```

---

## 5. Yjs CRDT

### Document Management

```typescript
import { getYjsConflictResolver } from './services/YjsConflictResolver'

const resolver = getYjsConflictResolver()

// Create document
const doc = resolver.createDocument('note-123', 'Initial text')

// Apply remote update
resolver.applyUpdate('note-123', remoteUpdate)

// Get current state
const text = resolver.getState('note-123')

// Get state vector for sync
const stateVector = resolver.getStateVector('note-123')

// Get diff for remote device
const diff = resolver.getDiff('note-123', remoteStateVector)

// Subscribe to changes
const unsubscribe = resolver.subscribeToChanges('note-123', (update, origin) => {
  console.log('Document changed')
})

// Cleanup
unsubscribe()
resolver.deleteDocument('note-123')
```

---

## 6. Key Storage

### New Methods

```typescript
import { KeyStorageService } from './services/KeyStorageService'

// Get all users
const users = await KeyStorageService.getAllUsers()
// ['user-1', 'user-2', 'user-3']

// Get plan tier
const tier = await KeyStorageService.getPlanTier(userId)
// 'free' | 'starter' | 'pro' | 'team' | 'enterprise'

// Store plan tier
await KeyStorageService.storePlanTier(userId, 'pro')

// Validate token
const isValid = await KeyStorageService.validateAccessToken(userId, token)

// Store current user
await KeyStorageService.storeUserId(userId)

// Get current user
const currentUser = await KeyStorageService.getCurrentUserId()

// Clear current user
await KeyStorageService.clearCurrentUserId()
```

---

## Integration Examples

### SyncManager Integration

```typescript
import { getConflictResolver } from './services/ConflictResolver'
import { getDeviceManager } from './services/DeviceManager'
import { getAuditLogger } from './services/AuditLogger'

class SyncManager {
  private conflictResolver: ConflictResolver
  private deviceManager: DeviceManager
  private auditLogger: AuditLogger

  constructor(deviceId: string) {
    this.conflictResolver = getConflictResolver(deviceId)
    this.deviceManager = getDeviceManager()
    this.auditLogger = getAuditLogger()
  }

  async syncNote(noteId: string, remoteData: any) {
    // Log sync start
    await this.auditLogger.log({
      userId: this.userId,
      operation: 'sync_start',
      table: 'notes',
      recordId: noteId,
    })

    try {
      // Sync with conflict resolution
      const conflict = await this.conflictResolver.syncNote(
        noteId,
        remoteData.content,
        remoteData.vectorClock,
        remoteData.yjsUpdate
      )

      if (conflict && !conflict.autoResolved) {
        // Return conflict to UI for manual resolution
        return { status: 'conflict', conflict }
      }

      // Update last sync time
      await this.deviceManager.updateLastSync(this.deviceId)

      // Log sync complete
      await this.auditLogger.log({
        userId: this.userId,
        operation: 'sync_complete',
        table: 'notes',
        recordId: noteId,
      })

      return { status: 'success' }
    } catch (error) {
      // Log sync failure
      await this.auditLogger.log({
        userId: this.userId,
        operation: 'sync_fail',
        table: 'notes',
        recordId: noteId,
        metadata: { error: error.message },
      })

      throw error
    }
  }
}
```

### CloudAccessManager Integration

```typescript
import { KeyStorageService } from './services/KeyStorageService'

class CloudAccessManager {
  async hasCloudAccess(): Promise<boolean> {
    // Get current user
    const userId = await KeyStorageService.getCurrentUserId()
    if (!userId) return false

    // Check access token
    const token = await KeyStorageService.getAccessToken(userId)
    if (!token) return false

    // Check plan tier
    const tier = await KeyStorageService.getPlanTier(userId)
    if (tier === 'free') return false

    // Check internet connectivity
    if (!navigator.onLine) return false

    return true
  }

  async getAllUsers(): Promise<string[]> {
    return await KeyStorageService.getAllUsers()
  }
}
```

---

## Testing

### Unit Test Example

```typescript
import { VectorClockManager } from './services/VectorClockManager'

describe('VectorClockManager', () => {
  let manager: VectorClockManager

  beforeEach(() => {
    manager = new VectorClockManager()
  })

  test('should initialize clock for device', () => {
    const clock = manager.initializeForDevice('device-a')
    expect(clock).toEqual({ 'device-a': 0 })
  })

  test('should increment clock', () => {
    const clock = { 'device-a': 5 }
    const updated = manager.increment(clock, 'device-a')
    expect(updated).toEqual({ 'device-a': 6 })
  })

  test('should detect concurrent edits', () => {
    const clock1 = { 'device-a': 5, 'device-b': 3 }
    const clock2 = { 'device-a': 4, 'device-b': 6 }
    const comparison = manager.compare(clock1, clock2)
    expect(comparison).toBe('concurrent')
  })
})
```

---

## Common Patterns

### Pattern 1: Sync with Conflict Resolution

```typescript
async function syncWithConflictResolution(noteId: string, remoteData: any) {
  const resolver = getConflictResolver(deviceId)

  const conflict = await resolver.syncNote(
    noteId,
    remoteData.content,
    remoteData.vectorClock,
    remoteData.yjsUpdate
  )

  if (conflict && !conflict.autoResolved) {
    // Show UI
    const userChoice = await showConflictDialog(conflict)
    const resolution = await resolver.manualResolve(conflict, userChoice)
    await resolver.applyResolution(resolution)
  }
}
```

### Pattern 2: Device Registration on First Launch

```typescript
async function registerDeviceOnFirstLaunch(userId: string) {
  const manager = getDeviceManager()
  const result = await manager.registerDevice(userId)

  if (result.limitReached) {
    const upgrade = await showDeviceWallDialog(result)
    if (upgrade) {
      await upgradeToPro(userId)
      await manager.registerDevice(userId) // Retry
    }
  }
}
```

### Pattern 3: Audit All Operations

```typescript
async function createNoteWithAudit(userId: string, noteData: any) {
  const logger = getAuditLogger()

  // Create note
  const note = await db.createNote(noteData)

  // Log operation
  await logger.logCreate(userId, 'notes', note.id, noteData)

  return note
}
```

---

## Troubleshooting

### Issue: Yjs not found

```bash
npm install yjs y-protocols
```

### Issue: Database migration failed

```bash
# Check migration file exists
ls src/main/database/migrations.ts

# Run migration manually
npm run migrate
```

### Issue: Conflict not auto-resolving

```typescript
// Ensure Yjs update is provided
const conflict = await resolver.syncNote(
  noteId,
  remoteVersion,
  remoteClock,
  remoteYjsUpdate // Must be provided for auto-resolution
)
```

### Issue: Device limit not enforced

```typescript
// Ensure plan tier is stored
await KeyStorageService.storePlanTier(userId, 'starter')

// Check device count
const count = await manager.getDeviceCount(userId)
console.log(`Devices: ${count}`)
```

---

## Performance Tips

1. **Reuse service instances** - Use singleton pattern
2. **Batch audit logs** - Log multiple operations together
3. **Cache vector clocks** - Don't deserialize on every operation
4. **Lazy load Yjs documents** - Only create when needed
5. **Clean up Yjs documents** - Call `deleteDocument()` when done

---

## Security Best Practices

1. **Never log sensitive data** - Encrypt before logging
2. **Validate all inputs** - Check user IDs, device IDs
3. **Use audit logs** - Track all security-relevant operations
4. **Rotate tokens** - Implement token refresh
5. **Limit device count** - Enforce plan limits

---

## Next Steps

1. ✅ Install dependencies
2. ✅ Run database migration
3. ⏳ Write unit tests
4. ⏳ Integrate with SyncManager
5. ⏳ Build conflict resolution UI
6. ⏳ Build device management UI
7. ⏳ Test with 2 devices

---

**For detailed documentation, see:**

- `BACKEND_100_PERCENT_COMPLETE.md` - Complete status
- `BACKEND_COMPLETION_SUMMARY.md` - Implementation details
- Individual service files - Inline documentation
