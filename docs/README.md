# Main Process Architecture

This directory contains the main process code for PiyAPI Notes, organized into a clean service-based architecture with strict IPC boundaries.

## Directory Structure

```
src/main/
├── services/           # Business logic services
├── ipc/               # IPC handlers and events
├── workers/           # Worker threads for CPU-intensive tasks
└── utils/             # Shared utilities
```

## Architecture Overview

### 1. Service Layer

Services encapsulate business logic and are the single source of truth for operations. Each service is a singleton that manages a specific domain.

**Current Services:**

- `DatabaseService.ts` - SQLite operations with WAL/FTS5

**Planned Services:**

- `AudioPipelineService.ts` - Audio capture and VAD
- `IntelligenceService.ts` - LLM inference (Ollama/MLX)
- `SyncManager.ts` - Cloud sync and encryption
- `HardwareTierService.ts` - Hardware detection
- `EntityExtractorService.ts` - Entity extraction

### 2. IPC Layer

The IPC layer provides a clean API for the renderer process. It follows these principles:

**Handler Pattern:**

```typescript
ipcMain.handle('resource:action', async (_event, params) => {
  try {
    const result = await service.operation(params)
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'ERROR_CODE',
        message: error.message,
        timestamp: Date.now(),
      },
    }
  }
})
```

**Event Pattern:**

```typescript
// Main process emits events
mainWindow.webContents.send('event:name', data)

// Renderer subscribes via preload
const unsubscribe = window.electronAPI.on.eventName(data => {
  console.log('Received:', data)
})

// Cleanup
unsubscribe()
```

### 3. Type Safety

All IPC communication is strictly typed:

1. **Request/Response Types** - Defined in `src/types/ipc.ts`
2. **Database Types** - Defined in `src/types/database.ts`
3. **Preload Bridge** - Exposes `window.electronAPI` with full TypeScript support

### 4. Security

- **Context Isolation**: Renderer has NO direct access to Node.js/Electron
- **Preload Script**: Only exposes explicitly defined API
- **Input Validation**: All inputs validated before processing
- **SQL Injection Protection**: Parameterized queries only
- **Path Traversal Protection**: File paths validated

## Usage Examples

### Frontend (Renderer Process)

```typescript
// Start a meeting
const response = await window.electronAPI.meeting.start({
  title: 'Team Standup',
  namespace: 'work',
})

if (response.success) {
  console.log('Meeting started:', response.data.meeting)
} else {
  console.error('Failed:', response.error.message)
}

// Subscribe to real-time transcripts
const unsubscribe = window.electronAPI.on.transcriptChunk(chunk => {
  console.log('New transcript:', chunk.text)
})

// Cleanup when component unmounts
unsubscribe()
```

### Backend (Main Process)

```typescript
// In a service
export class MyService {
  async doSomething(params: MyParams): Promise<MyResult> {
    const db = getDatabaseService()
    // ... business logic
    return result
  }
}

// In an IPC handler
ipcMain.handle('my:action', async (_event, params: MyParams) => {
  try {
    const service = getMyService()
    const result = await service.doSomething(params)
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'MY_ACTION_FAILED',
        message: error.message,
        timestamp: Date.now(),
      },
    }
  }
})
```

## Adding New Features

### 1. Define Types

Add types to `src/types/ipc.ts`:

```typescript
export interface MyFeatureParams {
  id: string
  data: string
}

export interface MyFeatureResponse {
  result: string
}
```

### 2. Create Service

Create `src/main/services/MyFeatureService.ts`:

```typescript
export class MyFeatureService {
  async doSomething(params: MyFeatureParams): Promise<MyFeatureResponse> {
    // Implementation
  }
}

let instance: MyFeatureService | null = null

export function getMyFeatureService(): MyFeatureService {
  if (!instance) {
    instance = new MyFeatureService()
  }
  return instance
}
```

### 3. Create IPC Handler

Create `src/main/ipc/handlers/myfeature.handlers.ts`:

```typescript
import { ipcMain } from 'electron'
import { getMyFeatureService } from '../../services/MyFeatureService'

export function registerMyFeatureHandlers(): void {
  ipcMain.handle('myfeature:action', async (_event, params) => {
    try {
      const service = getMyFeatureService()
      const result = await service.doSomething(params)
      return { success: true, data: result }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MYFEATURE_ACTION_FAILED',
          message: error.message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
```

### 4. Register Handler

Add to `src/main/ipc/setup.ts`:

```typescript
import { registerMyFeatureHandlers } from './handlers/myfeature.handlers'

export function setupIPC(): void {
  // ... existing handlers
  registerMyFeatureHandlers()
}
```

### 5. Update Preload

The preload script automatically exposes all handlers through the `ElectronAPI` interface. Just ensure your types are in `src/types/ipc.ts`.

### 6. Use in Frontend

```typescript
const response = await window.electronAPI.myfeature.action(params)
```

## Testing

### Unit Tests

Test services in isolation:

```typescript
import { MyFeatureService } from '../services/MyFeatureService'

describe('MyFeatureService', () => {
  it('should do something', async () => {
    const service = new MyFeatureService()
    const result = await service.doSomething({ id: '123', data: 'test' })
    expect(result.result).toBe('expected')
  })
})
```

### Integration Tests

Test IPC handlers end-to-end:

```typescript
import { ipcMain } from 'electron'
import { registerMyFeatureHandlers } from '../ipc/handlers/myfeature.handlers'

describe('MyFeature IPC', () => {
  beforeAll(() => {
    registerMyFeatureHandlers()
  })

  it('should handle myfeature:action', async () => {
    const response = await ipcMain.handle('myfeature:action', null, params)
    expect(response.success).toBe(true)
  })
})
```

## Performance Considerations

1. **Lazy Loading**: Services initialize on first use
2. **Connection Pooling**: Database connections reused
3. **Batch Operations**: Group related operations
4. **Streaming**: Use events for large data transfers
5. **Worker Threads**: Offload CPU-intensive tasks

## Error Handling

All errors follow this structure:

```typescript
interface IPCError {
  code: string // Machine-readable error code
  message: string // Human-readable message
  details?: string // Stack trace or additional info
  timestamp: number // When the error occurred
}
```

Common error codes:

- `*_NOT_FOUND` - Resource doesn't exist
- `*_FAILED` - Operation failed
- `*_INVALID` - Invalid input
- `*_UNAUTHORIZED` - Permission denied

## Logging

Use structured logging:

```typescript
console.log('[ServiceName] Operation started', { params })
console.error('[ServiceName] Operation failed', { error, params })
```

## Next Steps

1. Implement remaining IPC handlers (note, transcript, entity, search, etc.)
2. Create AudioPipelineService for audio capture
3. Create IntelligenceService for LLM integration
4. Create SyncManager for cloud sync
5. Add comprehensive error handling
6. Add logging infrastructure
7. Add performance monitoring
