# IPC Architecture Documentation

## Directory Structure

```
src/main/
├── services/
│   ├── DatabaseService.ts          # SQLite operations with WAL/FTS5
│   ├── AudioPipelineService.ts     # AudioWorklet & Whisper worker management
│   ├── IntelligenceService.ts      # Ollama/MLX LLM integration (Qwen 2.5 3B)
│   ├── SyncManager.ts              # Event-sourced sync queue & encryption
│   ├── HardwareTierService.ts      # RAM-based tier detection
│   └── EntityExtractorService.ts   # Local entity extraction
├── ipc/
│   ├── handlers/
│   │   ├── meeting.handlers.ts     # Meeting CRUD operations
│   │   ├── note.handlers.ts        # Note CRUD + expansion
│   │   ├── transcript.handlers.ts  # Transcript CRUD operations
│   │   ├── entity.handlers.ts      # Entity CRUD operations
│   │   ├── search.handlers.ts      # FTS5 search operations
│   │   ├── sync.handlers.ts        # Sync trigger & status
│   │   ├── audio.handlers.ts       # Audio capture control
│   │   └── settings.handlers.ts    # App settings & preferences
│   ├── events/
│   │   ├── transcription.events.ts # Real-time transcript streaming
│   │   ├── llm.events.ts           # LLM token streaming
│   │   ├── sync.events.ts          # Sync progress events
│   │   └── audio.events.ts         # Audio level & status events
│   └── setup.ts                    # IPC handler registration
├── workers/
│   ├── whisper.worker.ts           # Whisper transcription worker
│   ├── vad.worker.ts               # Voice Activity Detection worker
│   └── llm.worker.ts               # LLM inference worker (optional)
└── utils/
    ├── logger.ts                   # Structured logging
    ├── errors.ts                   # Custom error types
    └── validation.ts               # Input validation helpers
```

## Architecture Principles

### 1. Strict Context Bridge

- **No direct Node/Electron access from renderer**
- All communication through `window.electronAPI`
- Type-safe contracts via TypeScript interfaces

### 2. Service-Based Design

- Each service has a single responsibility
- Services are instantiated once and reused
- Services communicate via events when needed

### 3. Event Streaming

- Real-time updates via IPC events
- Unsubscribe mechanisms for cleanup
- Backpressure handling for high-frequency events

### 4. Type Safety

- Comprehensive type definitions in `src/types/`
- Shared types between main and renderer
- Runtime validation for critical operations

## IPC Channel Naming Convention

### Handlers (Request/Response)

- `<resource>:<action>` - e.g., `meeting:create`, `note:expand`
- Always return Promise<T>
- Handle errors gracefully with structured error objects

### Events (One-way notifications)

- `<resource>:<event>` - e.g., `transcript:chunk`, `llm:token`
- Use for streaming data
- Include unsubscribe mechanism

## Error Handling

All IPC handlers follow this pattern:

```typescript
try {
  const result = await service.operation(params)
  return { success: true, data: result }
} catch (error) {
  logger.error('Operation failed', { error, params })
  return {
    success: false,
    error: {
      code: 'ERROR_CODE',
      message: error.message,
      details: error.stack,
    },
  }
}
```

## Security Considerations

1. **Input Validation**: All inputs validated before processing
2. **SQL Injection**: Parameterized queries only
3. **Path Traversal**: Validate file paths
4. **Rate Limiting**: Prevent abuse of expensive operations
5. **Encryption**: Keytar for sensitive data storage

## Performance Optimization

1. **Lazy Loading**: Services initialized on first use
2. **Connection Pooling**: Reuse database connections
3. **Batch Operations**: Group related operations
4. **Streaming**: Use streams for large data transfers
5. **Worker Threads**: Offload CPU-intensive tasks

## Testing Strategy

1. **Unit Tests**: Test each service in isolation
2. **Integration Tests**: Test IPC handlers end-to-end
3. **Mock Services**: Use dependency injection for testing
4. **Performance Tests**: Benchmark critical operations
