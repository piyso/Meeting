# Executable Implementation Tasks: PiyAPI Notes

## Overview
This document contains ONLY executable implementation tasks that can be automated.
Manual validation tasks (hardware testing, benchmarking) are documented separately.

---

## Phase 1: Foundation & Setup

### Task 1: Project Initialization
- [x] 1.1 Initialize Electron + Vite + React + TypeScript project
- [x] 1.2 Configure build system (electron-builder)
- [x] 1.3 Set up ESLint + Prettier configuration
- [x] 1.4 Configure TypeScript strict mode
- [x] 1.5 Install core dependencies (better-sqlite3, keytar, uuid, ollama)
- [x] 1.6 Create project structure (src/main, src/renderer, src/workers)

### Task 2: Database Layer Implementation
- [x] 2.1 Create SQLite schema with all tables
- [x] 2.2 Implement database connection with WAL mode
- [x] 2.3 Create migration system
- [x] 2.4 Implement CRUD functions for all tables
- [x] 2.5 Set up FTS5 indexes and triggers
- [x] 2.6 Write unit tests for database operations

### Task 3: IPC Architecture
- [ ] 3.1 Define IPC channel contracts (TypeScript interfaces)
- [ ] 3.2 Implement type-safe IPC wrapper
- [ ] 3.3 Create worker thread manager
- [ ] 3.4 Set up error handling and logging system
- [ ] 3.5 Implement IPC message passing tests
- [ ] 3.6 Document IPC patterns

---

## Phase 2: Audio Pipeline

### Task 4: Windows Audio Capture
- [ ] 4.1 Implement desktopCapturer audio enumeration
- [ ] 4.2 Implement Stereo Mix detection logic
- [ ] 4.3 Implement system audio capture via WASAPI
- [ ] 4.4 Implement error handling for "Stereo Mix not enabled"
- [ ] 4.5 Implement microphone fallback mechanism
- [ ] 4.6 Create user guidance UI for enabling Stereo Mix

### Task 5: macOS Audio Capture
- [ ] 5.1 Implement getDisplayMedia audio capture
- [ ] 5.2 Implement Screen Recording permission detection
- [ ] 5.3 Create permission request UI with System Settings link
- [ ] 5.4 Implement microphone fallback for macOS
- [ ] 5.5 Handle external monitors and Bluetooth audio

### Task 6: AudioWorklet Pipeline
- [ ] 6.1 Create AudioWorklet processor (audio-vad-worklet.ts)
- [ ] 6.2 Implement 16kHz resampling
- [ ] 6.3 Implement audio chunk forwarding to VAD worker
- [ ] 6.4 Implement 30-second chunking with buffer management
- [ ] 6.5 Add memory management (max 5 chunks buffered)

### Task 7: VAD Worker Thread
- [ ] 7.1 Download and integrate Silero VAD ONNX model
- [ ] 7.2 Implement VAD worker with onnxruntime-node
- [ ] 7.3 Set confidence threshold and tune parameters
- [ ] 7.4 Implement voice segment forwarding to Whisper worker
- [ ] 7.5 Add performance monitoring (inference time tracking)

### Task 8: Audio Capture Integration
- [ ] 8.1 Integrate AudioWorklet → VAD → Whisper pipeline
- [ ] 8.2 Implement fallback chain (System Audio → Microphone → Cloud)
- [ ] 8.3 Add comprehensive error handling and recovery
- [ ] 8.4 Implement memory leak prevention
- [ ] 8.5 Create troubleshooting documentation

---

## Phase 3: Transcription Engine

### Task 9: Whisper Model Setup
- [ ] 9.1 Implement model download system with progress tracking
- [ ] 9.2 Add SHA-256 checksum validation
- [ ] 9.3 Implement retry logic with exponential backoff
- [ ] 9.4 Create model storage in resources/models directory

### Task 10: Whisper Worker Implementation
- [ ] 10.1 Create Whisper worker thread
- [ ] 10.2 Implement whisper.cpp integration
- [ ] 10.3 Configure transcription options (language, word_timestamps)
- [ ] 10.4 Implement audio chunk processing
- [ ] 10.5 Parse transcript segments with word timings
- [ ] 10.6 Add worker crash recovery

### Task 11: Performance Tier Detection
- [ ] 11.1 Implement Whisper speed benchmarking on first launch
- [ ] 11.2 Implement performance tier classification logic
- [ ] 11.3 Store performance tier in database
- [ ] 11.4 Create cloud transcription recommendation UI
- [ ] 11.5 Implement performance warning display
- [ ] 11.6 Add user override option in settings

### Task 12: Cloud Transcription Integration
- [ ] 12.1 Implement cloud transcription toggle in settings
- [ ] 12.2 Integrate Deepgram API for cloud transcription
- [ ] 12.3 Implement streaming audio to Deepgram
- [ ] 12.4 Parse streaming transcript responses
- [ ] 12.5 Track cloud transcription usage by tier

### Task 13: Database Integration for Transcripts
- [ ] 13.1 Implement transcript saving to SQLite with timestamps
- [ ] 13.2 Implement FTS5 index updates on insert
- [ ] 13.3 Link transcripts to meetings with foreign keys
- [ ] 13.4 Implement transcript retrieval by meeting ID
- [ ] 13.5 Add search functionality across transcripts

### Task 14: Real-Time Display
- [ ] 14.1 Implement IPC for sending transcripts to renderer
- [ ] 14.2 Create transcript display UI with auto-scroll
- [ ] 14.3 Add confidence score display (optional)
- [ ] 14.4 Implement low-confidence segment highlighting
- [ ] 14.5 Optimize UI performance for long meetings

---

## Phase 4: UI/UX Implementation

### Task 15: Layout and Navigation
- [ ] 15.1 Create split-pane layout (transcript/notes)
- [ ] 15.2 Implement resizable panes with localStorage persistence
- [ ] 15.3 Create meeting list sidebar
- [ ] 15.4 Implement meeting navigation with keyboard shortcuts
- [ ] 15.5 Implement dark mode support with CSS variables
- [ ] 15.6 Test responsive resizing

### Task 16: Tiptap Editor Integration
- [ ] 16.1 Install and configure @tiptap/react
- [ ] 16.2 Create note editor component with toolbar
- [ ] 16.3 Implement formatting (bold, italic, lists)
- [ ] 16.4 Add Ctrl+Enter keyboard shortcut for expansion
- [ ] 16.5 Implement real-time note saving with debounce
- [ ] 16.6 Optimize editor performance

### Task 17: Smart Chips UI
- [ ] 17.1 Implement Smart Chips display for entities
- [ ] 17.2 Create color-coded chips (People, Dates, Amounts, etc.)
- [ ] 17.3 Add click handlers for each chip type
- [ ] 17.4 Implement filtering by entity
- [ ] 17.5 Test with multiple entities

### Task 18: Meeting Management UI
- [ ] 18.1 Create "Start Meeting" button
- [ ] 18.2 Implement meeting title input with auto-generation
- [ ] 18.3 Add "Stop Meeting" button with confirmation
- [ ] 18.4 Implement meeting duration timer
- [ ] 18.5 Create recording indicator with animation
- [ ] 18.6 Implement meeting list with search

### Task 19: Polish and Error States
- [ ] 19.1 Add loading states for all async operations
- [ ] 19.2 Create error message components (toasts, banners)
- [ ] 19.3 Implement empty states with CTAs
- [ ] 19.4 Add tooltips for all buttons
- [ ] 19.5 Create interactive onboarding tutorial
- [ ] 19.6 Implement user feedback collection

---

## Phase 5: AI Intelligence

### Task 20: Ollama Integration
- [ ] 20.1 Create Ollama installation detection
- [ ] 20.2 Implement Ollama health check (localhost:11434)
- [ ] 20.3 Create error handling for Ollama not installed
- [ ] 20.4 Add download link in error message
- [ ] 20.5 Implement setup wizard for first launch

### Task 21: Note Expansion Implementation
- [ ] 21.1 Create NoteAugmenter class
- [ ] 21.2 Implement context window extraction (-60s to +10s)
- [ ] 21.3 Build expansion prompt with context
- [ ] 21.4 Implement Ollama API calls with streaming
- [ ] 21.5 Display partial expansions in real-time
- [ ] 21.6 Save expanded notes to database

### Task 22: Model Memory Management
- [ ] 22.1 Implement lazy loading (load on first Ctrl+Enter)
- [ ] 22.2 Set keep_alive: 60s in Ollama requests
- [ ] 22.3 Implement 60-second idle timeout tracking
- [ ] 22.4 Implement model unloading after timeout
- [ ] 22.5 Add RAM usage monitoring
- [ ] 22.6 Create model status indicator in UI

### Task 23: Note Expansion UI Integration
- [ ] 23.1 Add Ctrl+Enter handler to editor
- [ ] 23.2 Show loading indicator during expansion
- [ ] 23.3 Display original + expanded side-by-side
- [ ] 23.4 Implement accept/reject/edit buttons
- [ ] 23.5 Add "Expand All Notes" batch operation
- [ ] 23.6 Optimize UI for multiple expansions

---

## Phase 6: Sync & Backend

### Task 24: Backend Abstraction Layer
- [ ] 24.1 Define IBackendProvider interface
- [ ] 24.2 Create PiyAPIBackend class
- [ ] 24.3 Implement login/logout functionality
- [ ] 24.4 Implement token refresh (15min access, 7day refresh)
- [ ] 24.5 Implement token storage in OS keychain via keytar
- [ ] 24.6 Add authentication flow tests

### Task 25: Encryption Module
- [ ] 25.1 Implement PBKDF2 key derivation (100K iterations)
- [ ] 25.2 Implement random salt generation (32 bytes)
- [ ] 25.3 Implement AES-256-GCM encryption
- [ ] 25.4 Implement unique IV generation per encryption
- [ ] 25.5 Store salt in encryption_keys table
- [ ] 25.6 Test encrypt → decrypt round-trip
- [ ] 25.7 Implement keytar for key storage
- [ ] 25.8 Implement PHI detection before cloud sync

### Task 26: Recovery Phrase System
- [ ] 26.1 Generate 24-word recovery phrase (BIP39)
- [ ] 26.2 Create recovery phrase display UI
- [ ] 26.3 Require user confirmation before continuing
- [ ] 26.4 Show unrecoverable data warning
- [ ] 26.5 Implement "Recover Account" flow
- [ ] 26.6 Derive master key from recovery phrase
- [ ] 26.7 Test account recovery with lost password

### Task 27: Sync Manager
- [ ] 27.1 Implement event-sourced sync queue
- [ ] 27.2 Queue events on create/update/delete
- [ ] 27.3 Implement event batching (up to 50 events)
- [ ] 27.4 Encrypt events before upload
- [ ] 27.5 Implement POST to /api/v1/memories
- [ ] 27.6 Mark synced_at on success
- [ ] 27.7 Implement exponential backoff with infinite retries
- [ ] 27.8 Ensure queue persists across app restarts
- [ ] 27.9 Test sync recovery after offline period
- [ ] 27.10 Implement ALLOWED_TABLES whitelist

### Task 28: Conflict Resolution
- [ ] 28.1 Implement vector clock tracking
- [ ] 28.2 Implement conflict detection logic
- [ ] 28.3 Create conflict resolution UI (side-by-side diff)
- [ ] 28.4 Implement version selection (local/remote/merge)
- [ ] 28.5 Propagate resolution to all devices
- [ ] 28.6 Test conflict on 2 devices editing offline

### Task 29: Device Management
- [ ] 29.1 Implement device registration on first sync
- [ ] 29.2 Enforce device limits by tier
- [ ] 29.3 Create device list display in settings
- [ ] 29.4 Implement remote device deactivation
- [ ] 29.5 Revoke sync credentials on deactivation
- [ ] 29.6 Test device limit enforcement
- [ ] 29.7 Implement audit logging for data operations

---

## Phase 7: Testing & Launch Prep

### Task 30: End-to-End Testing
- [ ] 30.1 Create E2E test for full meeting flow
- [ ] 30.2 Implement RAM usage monitoring tests
- [ ] 30.3 Implement CPU usage monitoring tests
- [ ] 30.4 Implement transcription lag measurement
- [ ] 30.5 Create sync test across 2 devices
- [ ] 30.6 Test data integrity during sync conflicts
- [ ] 30.7 Implement property-based tests using fast-check
- [ ] 30.8 Add property-based tests to CI

### Task 31: Performance Profiling
- [ ] 31.1 Create memory profiling script
- [ ] 31.2 Implement memory leak detection
- [ ] 31.3 Create CPU profiling during transcription
- [ ] 31.4 Measure app startup time
- [ ] 31.5 Measure search latency with large datasets
- [ ] 31.6 Create PERFORMANCE.md documentation
- [ ] 31.7 Set up automated performance benchmarking in CI
- [ ] 31.8 Implement performance regression blocking
- [ ] 31.9 Create performance trends dashboard

### Task 32: Beta Launch Preparation
- [ ] 32.1 Set up auto-update system (electron-updater)
- [ ] 32.2 Configure crash reporting (Sentry)
- [ ] 32.3 Create beta invite system
- [ ] 32.4 Set up feedback collection mechanism
- [ ] 32.5 Create beta testing guide
- [ ] 32.6 Prepare launch announcement
- [ ] 32.7 Implement feedback monitoring system
- [ ] 32.8 Create critical bug response workflow

### Task 33: Code Signing and Distribution
- [ ] 33.1 Set up Windows code signing certificate
- [ ] 33.2 Set up Apple Developer ID
- [ ] 33.3 Implement macOS app notarization
- [ ] 33.4 Create Windows installer (NSIS)
- [ ] 33.5 Create macOS DMG
- [ ] 33.6 Test installers on clean machines
- [ ] 33.7 Test without admin rights
- [ ] 33.8 Verify no SmartScreen warnings

---

## Phase 8: Advanced Features

### Task 34: Knowledge Graph Integration
- [ ] 34.1 Integrate /api/v1/graph endpoint
- [ ] 34.2 Implement graph data fetching
- [ ] 34.3 Create graph visualization (d3-force)
- [ ] 34.4 Display relationship types with contradiction detection
- [ ] 34.5 Add filtering by date, people, topics
- [ ] 34.6 Test with multiple meetings
- [ ] 34.7 Implement contradiction alert UI

### Task 35: Cross-Meeting AI Queries
- [ ] 35.1 Integrate /api/v1/ask endpoint
- [ ] 35.2 Create query UI (search bar)
- [ ] 35.3 Display answers with citations
- [ ] 35.4 Link citations to source meetings
- [ ] 35.5 Enforce query limits by tier
- [ ] 35.6 Test various query types

### Task 36: Weekly Digest Generation
- [ ] 36.1 Implement digest generation logic
- [ ] 36.2 Call /api/v1/ask for summarization
- [ ] 36.3 Extract key decisions and action items
- [ ] 36.4 Detect contradictions (changed decisions)
- [ ] 36.5 Create digest display UI
- [ ] 36.6 Test with multiple meetings
- [ ] 36.7 Add entity aggregation to digest
- [ ] 36.8 Schedule digest generation (Friday 4 PM)

### Task 37: Payment Integration
- [ ] 37.1 Integrate Razorpay (India)
- [ ] 37.2 Integrate Lemon Squeezy (global)
- [ ] 37.3 Create pricing page UI
- [ ] 37.4 Implement checkout flow
- [ ] 37.5 Add processing fee calculation and display
- [ ] 37.6 Implement geo-routing for payment gateway
- [ ] 37.7 Handle webhooks for subscription events
- [ ] 37.8 Test full payment flow (test mode)

### Task 38: Feature Traps (Monetization)
- [ ] 38.1 Implement Device Wall (2 devices for Starter)
- [ ] 38.2 Implement AI Query Limit (50/month for Starter)
- [ ] 38.3 Create upgrade prompts at trigger moments
- [ ] 38.4 Track conversion metrics
- [ ] 38.5 Test upgrade flow
- [ ] 38.6 A/B test prompt messaging
- [ ] 38.7 Implement referral loop

### Task 39: Team Collaboration
- [ ] 39.1 Implement meeting sharing
- [ ] 39.2 Add permission levels (Viewer, Editor, Admin)
- [ ] 39.3 Create comment threads on notes
- [ ] 39.4 Implement @mentions
- [ ] 39.5 Build admin dashboard
- [ ] 39.6 Test with multi-person team
- [ ] 39.7 Prepare HIPAA BAA template
- [ ] 39.8 Begin SOC 2 audit process

---

## Documentation Tasks

### Task 40: Technical Documentation
- [ ] 40.1 Create ARCHITECTURE.md
- [ ] 40.2 Create API_DOCUMENTATION.md
- [ ] 40.3 Create DEPLOYMENT_GUIDE.md
- [ ] 40.4 Create TROUBLESHOOTING.md
- [ ] 40.5 Create CONTRIBUTING.md
- [ ] 40.6 Update README.md with setup instructions

### Task 41: User Documentation
- [ ] 41.1 Create USER_GUIDE.md
- [ ] 41.2 Create FAQ.md
- [ ] 41.3 Create PRIVACY_POLICY.md
- [ ] 41.4 Create TERMS_OF_SERVICE.md
- [ ] 41.5 Create video tutorials (optional)

---

**Note:** Manual validation tasks (hardware testing, benchmarking on physical machines) are documented in the original tasks.md file and should be performed by the development team separately.

**Document Version**: 2.0 (Executable)  
**Last Updated**: 2026-02-24  
**Status**: Ready for Automated Execution
