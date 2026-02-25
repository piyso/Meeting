# Requirements Document: PiyAPI Notes

## Introduction

PiyAPI Notes is a local-first meeting transcription application that provides real-time audio transcription, AI-powered note expansion, and intelligent meeting analysis. The application operates entirely offline for free tier users while offering optional cloud synchronization and advanced AI features for paid tiers. The system competes with Granola and Otter.ai by offering zero-cost local processing with optional cloud enhancements.

## Glossary

- **Application**: The PiyAPI Notes desktop application (Electron-based)
- **Audio_Capture_System**: Component responsible for capturing system and microphone audio
- **Transcription_Engine**: Whisper.cpp-based component that converts audio to text
- **Note_Expansion_System**: Phi-3-based AI that expands user notes
- **Local_Storage**: SQLite database storing meetings, transcripts, and notes locally
- **Sync_Engine**: Component managing cloud synchronization
- **Knowledge_Graph**: Visual representation of relationships between meetings, people, and topics
- **Entity_Extractor**: Component identifying people, dates, amounts, and topics from transcripts
- **Search_Engine**: Component providing full-text search across meetings
- **AI_Query_System**: Component handling cross-meeting AI queries
- **Encryption_Module**: Component encrypting data before cloud transmission
- **VAD**: Voice Activity Detection system for audio processing
- **Meeting**: A recorded session with audio, transcript, and notes
- **User**: Person using the application
- **Device**: Computer running the Application
- **Free_Tier**: Subscription level with local-only features
- **Starter_Tier**: Paid subscription ($9/month) with 2 devices and cloud sync
- **Pro_Tier**: Paid subscription ($19/month) with unlimited devices and advanced features
- **Team_Tier**: Paid subscription ($29/seat/month) with shared meetings
- **Backend**: PiyAPI cloud service for sync, search, and AI processing
- **Conflict**: Situation where same meeting is modified on multiple devices
- **Weekly_Digest**: AI-generated summary of meetings from the past week

## Requirements

### Requirement 1: Audio Capture

**User Story:** As a user, I want to capture audio from my meetings, so that I can transcribe and analyze them later.

#### Acceptance Criteria

1. WHEN the User starts a recording, THE Audio_Capture_System SHALL capture audio from the system output and microphone input simultaneously
2. THE Audio_Capture_System SHALL use platform-specific APIs (Core Audio for macOS, WASAPI for Windows)
3. THE Audio_Capture_System SHALL use AudioWorkletNode API (not deprecated ScriptProcessorNode) to ensure audio processing runs on a dedicated thread
4. WHEN audio is captured, THE Audio_Capture_System SHALL process it through VAD to detect speech segments
5. THE VAD SHALL run in a separate Worker Thread to avoid blocking audio capture
6. THE Audio_Capture_System SHALL maintain audio capture for meetings lasting up to 180 minutes without interruption
7. WHILE capturing audio, THE Application SHALL consume less than 6GB of RAM
8. THE Audio_Capture_System SHALL support sample rates of 16kHz for transcription processing
9. IF audio capture fails, THEN THE Application SHALL notify the User with a specific error message and log the failure
10. ON first launch, THE Application SHALL run a pre-flight audio test to validate audio capture works
11. IF pre-flight test fails, THE Application SHALL provide platform-specific guidance to fix the issue
12. THE Audio_Capture_System SHALL implement fallback chain: System Audio → Microphone → Cloud Transcription
13. IF system audio is unavailable, THE Application SHALL automatically fall back to microphone capture
14. IF both system audio and microphone fail, THE Application SHALL offer cloud transcription option

### Requirement 2: Real-Time Transcription

**User Story:** As a user, I want my meeting audio transcribed in real-time, so that I can review what was said during the meeting.

#### Acceptance Criteria

1. WHEN audio segments are detected by VAD, THE Transcription_Engine SHALL transcribe them using platform-adaptive ASR models
2. WHERE hardware tier is high (16GB+ RAM), THE Transcription_Engine SHALL use Whisper turbo model achieving 51.8x real-time speed
3. WHERE hardware tier is mid (12GB RAM) OR low (8GB RAM), THE Transcription_Engine SHALL use Moonshine Base model achieving 290x real-time speed
4. THE Transcription_Engine SHALL display transcribed text with a lag of less than 2 seconds behind real-time audio (improved from 10s based on benchmarks)
5. THE Transcription_Engine SHALL process 10-second audio chunks in less than 0.2 seconds with Whisper turbo
6. THE Transcription_Engine SHALL process 10-second audio chunks in approximately 34ms with Moonshine Base
7. THE Transcription_Engine SHALL identify and label different speakers in the transcript
8. WHEN transcription is complete, THE Transcription_Engine SHALL store the transcript in Local_Storage
9. THE Transcription_Engine SHALL operate entirely offline without requiring internet connectivity
10. WHILE transcribing, THE Transcription_Engine SHALL process audio in 10-second chunks (improved from 30s based on benchmarks)
11. IF transcription quality is low due to audio quality, THEN THE Application SHALL indicate low-confidence segments to the User
12. ON first launch, THE Application SHALL benchmark transcription speed and classify the machine as high (16GB+), mid (12GB), or low (8GB) based on available RAM
13. THE Application SHALL auto-detect hardware tier: High (16GB: Whisper turbo + Qwen 3B = 4.5GB), Mid (12GB: Moonshine + Qwen 3B = 3.3GB), Low (8GB: Moonshine + Qwen 1.5B = 2.2GB)
14. IF machine is classified as slow (<3x RT) after benchmarking, THE Application SHALL recommend cloud transcription option
15. WHERE cloud transcription is enabled, THE Application SHALL use Deepgram API as fallback
16. WHERE Free_Tier, THE Application SHALL provide 10 hours of cloud transcription per month
17. WHERE Pro_Tier OR Team_Tier, THE Application SHALL provide unlimited cloud transcription
18. THE Transcription_Engine SHALL use Moonshine Base on mid/low tiers to eliminate mutual exclusion with LLM (both can run concurrently)

### Requirement 3: Note Taking with AI Expansion

**User Story:** As a user, I want to take notes during meetings and expand them with AI, so that I can quickly capture ideas and have them elaborated automatically.

#### Acceptance Criteria

1. WHEN the User types notes during a meeting, THE Application SHALL save them in real-time to Local_Storage
2. WHEN the User presses Ctrl+Enter on a note, THE Note_Expansion_System SHALL expand the note using platform-adaptive LLM inference
3. WHERE platform is macOS with Apple Silicon, THE Note_Expansion_System SHALL use MLX engine achieving 53 tokens/second
4. WHERE platform is other, THE Note_Expansion_System SHALL use Ollama engine achieving 36-37 tokens/second
5. THE Note_Expansion_System SHALL use Qwen 2.5 3B model for action items and bullet formatting (benchmark score: 18 vs Llama's 11)
6. THE Note_Expansion_System SHALL use Llama 3.2 3B model for JSON entity extraction (benchmark score: 21 vs Qwen's 17)
7. THE Note_Expansion_System SHALL generate expanded notes based on the original note and surrounding transcript context
8. THE Note_Expansion_System SHALL achieve time-to-first-token of less than 200ms with streaming enabled
9. THE Note_Expansion_System SHALL stream tokens to UI in real-time (no blocking wait for complete response)
10. THE Note_Expansion_System SHALL limit expansions to 150-200 tokens maximum (reduced from 500 based on benchmarks)
11. THE Note_Expansion_System SHALL operate entirely offline without requiring internet connectivity
12. WHEN note expansion completes, THE Application SHALL display both the original and expanded versions
13. THE Application SHALL allow the User to accept, reject, or edit the expanded note

### Requirement 4: Local Data Storage

**User Story:** As a user, I want my meeting data stored locally, so that I can access it without internet connectivity and maintain privacy.

#### Acceptance Criteria

1. THE Local_Storage SHALL use SQLite with WAL (Write-Ahead Logging) mode to store meetings, transcripts, notes, and metadata
2. THE Local_Storage SHALL achieve 75,188 inserts per second (validated benchmark on M4)
3. WHEN a meeting is recorded, THE Local_Storage SHALL persist all audio references, transcripts, and notes atomically
4. THE Local_Storage SHALL support storage of at least 100 meetings with full transcripts without performance degradation
5. THE Local_Storage SHALL maintain referential integrity between meetings, transcripts, notes, and entities
6. WHEN the Application starts, THE Local_Storage SHALL load within 3 seconds regardless of data volume
7. THE Local_Storage SHALL compress audio files using FLAC (Free Lossless Audio Codec) to minimize disk space usage
8. THE Local_Storage SHALL achieve approximately 1GB database file size for ~200 hours of meetings with compression
9. IF Local_Storage operations fail, THEN THE Application SHALL retry the operation up to 3 times before notifying the User
10. THE Local_Storage SHALL configure SQLite with: cache_size = -64000 (64MB), mmap_size = 268435456 (256MB), temp_store = MEMORY
11. THE Local_Storage SHALL use FTS5 (Full-Text Search 5) for search indexes with query sanitization to prevent crashes

### Requirement 5: Local Full-Text Search

**User Story:** As a user, I want to search across all my meeting transcripts and notes, so that I can quickly find specific information.

#### Acceptance Criteria

1. WHEN the User enters a search query, THE Search_Engine SHALL return results from transcripts and notes within 50 milliseconds (improved from 500ms based on benchmarks)
2. THE Search_Engine SHALL sanitize FTS5 queries to prevent crashes from special characters (hyphens, operators)
3. THE Search_Engine SHALL implement query sanitization pattern: remove hyphens, strip operators, quote each term
4. THE Search_Engine SHALL support full-text search with partial word matching
5. THE Search_Engine SHALL rank results by relevance based on term frequency and recency
6. THE Search_Engine SHALL highlight matching terms in search results
7. THE Search_Engine SHALL operate entirely offline using local indexes
8. WHEN new meetings are saved, THE Search_Engine SHALL update its index within 10 seconds
9. THE Search_Engine SHALL support boolean operators (AND, OR, NOT) in search queries after sanitization
10. THE Search_Engine SHALL achieve <1ms average search time across 100,000 segments (validated benchmark)

### Requirement 6: Entity Extraction

**User Story:** As a user, I want the system to automatically identify people, dates, and important information, so that I can quickly navigate to relevant meeting segments.

#### Acceptance Criteria

1. WHEN a transcript is completed, THE Entity_Extractor SHALL identify person names mentioned in the meeting
2. THE Entity_Extractor SHALL identify dates and times mentioned in the meeting
3. THE Entity_Extractor SHALL identify monetary amounts and numerical values mentioned in the meeting
4. THE Entity_Extractor SHALL identify topics and key phrases from the meeting
5. WHEN entities are extracted, THE Entity_Extractor SHALL store them in Local_Storage with references to transcript timestamps
6. THE Entity_Extractor SHALL operate entirely offline using local models
7. THE Application SHALL display extracted entities in a sidebar for quick navigation

### Requirement 7: Cloud Synchronization

**User Story:** As a paid user, I want my meetings synchronized across devices, so that I can access them from any computer.

#### Acceptance Criteria

1. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN the User enables sync, THE Sync_Engine SHALL upload meeting data to the Backend
2. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN meeting data changes on another Device, THE Sync_Engine SHALL download and merge the changes within 30 seconds
3. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN the same meeting is modified on multiple devices, THE Sync_Engine SHALL detect the Conflict and present resolution options to the User
4. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, THE Sync_Engine SHALL only sync when internet connectivity is available
5. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN syncing, THE Sync_Engine SHALL display sync progress to the User
6. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, THE Sync_Engine SHALL resume interrupted syncs automatically when connectivity is restored
7. WHERE Starter_Tier, THE Sync_Engine SHALL enforce a 5GB cloud storage limit
8. WHERE Pro_Tier, THE Sync_Engine SHALL enforce a 25GB cloud storage limit
9. WHERE Team_Tier, THE Sync_Engine SHALL enforce storage limits based on team size
10. THE Sync_Engine SHALL use event-sourced sync (sync operations, not state)
11. THE Sync_Engine SHALL persist sync queue in SQLite to survive app crashes
12. THE Sync_Engine SHALL batch up to 50 events per sync request
13. THE Sync_Engine SHALL implement exponential backoff with infinite retries (max delay: 30 seconds)
14. THE Sync_Engine SHALL use vector clocks for causality tracking to detect conflicts
15. THE Sync_Engine SHALL validate table names against whitelist to prevent SQL injection
16. WHERE conflict is detected, THE Sync_Engine SHALL preserve both versions and present side-by-side diff to User

### Requirement 8: Data Encryption

**User Story:** As a user, I want my data encrypted before it leaves my device, so that my meeting content remains private.

#### Acceptance Criteria

1. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN the Sync_Engine uploads data, THE Encryption_Module SHALL encrypt all meeting data using AES-256-GCM before transmission
2. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, THE Encryption_Module SHALL use client-side encryption keys that are never transmitted to the Backend
3. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, THE Encryption_Module SHALL derive encryption keys from the User's password using PBKDF2 with at least 100,000 iterations
4. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN downloading data, THE Encryption_Module SHALL decrypt data locally after retrieval
5. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, IF encryption or decryption fails, THEN THE Application SHALL log the error and notify the User without exposing sensitive data
6. THE Encryption_Module SHALL generate a unique 12-byte IV (initialization vector) for each encryption operation
7. THE Encryption_Module SHALL store encryption keys in OS keychain using keytar library
8. THE Encryption_Module SHALL detect PHI (Protected Health Information) before cloud sync and mask sensitive data

### Requirement 9: Device Management

**User Story:** As a paid user, I want to manage which devices can access my account, so that I can control access to my meeting data.

#### Acceptance Criteria

1. WHERE Starter_Tier, THE Application SHALL enforce a maximum of 2 active devices per account
2. WHERE Pro_Tier OR Team_Tier, THE Application SHALL allow unlimited active devices per account
3. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN the User exceeds their device limit, THE Application SHALL prompt them to deactivate an existing Device before activating a new one
4. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, THE Application SHALL display a list of all active devices with last sync time
5. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, THE Application SHALL allow the User to remotely deactivate devices from any active Device
6. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN a Device is deactivated, THE Application SHALL revoke its sync credentials within 60 seconds

### Requirement 10: Cross-Meeting AI Queries

**User Story:** As a Pro user, I want to ask questions across all my meetings, so that I can extract insights from my meeting history.

#### Acceptance Criteria

1. WHERE Pro_Tier OR Team_Tier, WHEN the User submits an AI query, THE AI_Query_System SHALL analyze transcripts and notes from all meetings
2. WHERE Pro_Tier OR Team_Tier, THE AI_Query_System SHALL return answers with citations to specific meetings and timestamps
3. WHERE Pro_Tier OR Team_Tier, THE AI_Query_System SHALL complete queries within 15 seconds
4. WHERE Pro_Tier OR Team_Tier, THE AI_Query_System SHALL use the Backend for processing queries
5. WHERE Starter_Tier, THE AI_Query_System SHALL enforce a limit of 50 queries per month
6. WHERE Pro_Tier OR Team_Tier, THE AI_Query_System SHALL allow unlimited queries per month
7. WHERE Pro_Tier OR Team_Tier, IF the Backend is unavailable, THEN THE Application SHALL notify the User that AI queries require internet connectivity

### Requirement 11: Knowledge Graph Visualization

**User Story:** As a Pro user, I want to see relationships between my meetings, so that I can understand how topics and people connect across conversations.

#### Acceptance Criteria

1. WHERE Pro_Tier OR Team_Tier, THE Knowledge_Graph SHALL visualize meetings as nodes connected by shared entities
2. WHERE Pro_Tier OR Team_Tier, THE Knowledge_Graph SHALL display connections based on shared people, topics, and referenced meetings
3. WHERE Pro_Tier OR Team_Tier, THE Knowledge_Graph SHALL support 7 relationship types: follows, references, groups, related_to, contradicts, supersedes, parent
4. WHERE Pro_Tier OR Team_Tier, WHEN the User clicks a node, THE Knowledge_Graph SHALL display meeting details and allow navigation to the full meeting
5. WHERE Pro_Tier OR Team_Tier, THE Knowledge_Graph SHALL update automatically when new meetings are added
6. WHERE Pro_Tier OR Team_Tier, THE Knowledge_Graph SHALL allow filtering by date range, people, and topics
7. WHERE Pro_Tier OR Team_Tier, THE Knowledge_Graph SHALL render graphs with up to 500 nodes without performance degradation
8. WHERE Pro_Tier OR Team_Tier, THE Knowledge_Graph SHALL use the Backend to compute graph relationships
9. WHERE Pro_Tier OR Team_Tier, THE Application SHALL detect contradictions between meetings (e.g., "Deadline is March 30" vs earlier "March 15")
10. WHERE Pro_Tier OR Team_Tier, WHEN a contradiction is detected, THE Application SHALL display a ⚠️ warning alert in the UI
11. WHERE Pro_Tier OR Team_Tier, THE Application SHALL display contradiction details showing both conflicting statements with timestamps

### Requirement 12: Weekly Digest Generation

**User Story:** As a user, I want to receive a weekly summary of my meetings, so that I can review key points without reading all transcripts.

#### Acceptance Criteria

1. WHERE Pro_Tier OR Team_Tier, WHEN a week completes (every Friday at 4 PM), THE Application SHALL generate a Weekly_Digest summarizing all meetings from the past 7 days
2. WHERE Pro_Tier OR Team_Tier, THE Weekly_Digest SHALL include key topics, action items, and important decisions from the week
3. WHERE Pro_Tier OR Team_Tier, THE Weekly_Digest SHALL group related meetings by topic or project
4. WHERE Pro_Tier OR Team_Tier, THE Application SHALL allow the User to manually trigger Weekly_Digest generation for any date range
5. WHERE Pro_Tier OR Team_Tier, THE Weekly_Digest SHALL be generated using the Backend AI services
6. WHERE Pro_Tier OR Team_Tier, THE Application SHALL store generated digests in Local_Storage for offline access
7. WHERE Pro_Tier OR Team_Tier, IF digest generation fails, THEN THE Application SHALL retry up to 3 times before notifying the User
8. WHERE Pro_Tier OR Team_Tier, THE Weekly_Digest SHALL include a "Changed Decisions" section showing contradictions detected during the week
9. WHERE Pro_Tier OR Team_Tier, THE Weekly_Digest SHALL include entity aggregation showing "People you met most this week"
10. WHERE Pro_Tier OR Team_Tier, THE Weekly_Digest SHALL display total meeting count, total hours, and open action items

### Requirement 13: Platform Support

**User Story:** As a user, I want to run the application on my operating system, so that I can use it on my preferred platform.

#### Acceptance Criteria

1. THE Application SHALL run on Windows 10 and Windows 11
2. THE Application SHALL run on macOS 11 (Big Sur) and later versions
3. THE Application SHALL support both Intel and Apple Silicon processors on macOS
4. THE Application SHALL provide native installers for each supported platform
5. WHEN the Application starts, THE Application SHALL detect the operating system and use platform-specific audio APIs
6. THE Application SHALL maintain consistent functionality across all supported platforms
7. THE Application SHALL provide automatic updates for all supported platforms

### Requirement 14: Performance and Resource Management

**User Story:** As a user, I want the application to run efficiently, so that it doesn't slow down my computer during meetings.

#### Acceptance Criteria

1. WHILE recording and transcribing, THE Application SHALL consume less than 6GB of RAM
2. WHILE idle, THE Application SHALL consume less than 500MB of RAM
3. THE Application SHALL start within 5 seconds on systems meeting minimum requirements
4. THE Application SHALL handle meetings lasting up to 180 minutes without crashes or memory leaks
5. WHEN processing audio, THE Application SHALL use less than 40% CPU on average on systems meeting minimum requirements
6. THE Application SHALL store audio files using compression to minimize disk space usage
7. IF memory usage exceeds 5.5GB, THEN THE Application SHALL log a warning and attempt to free unused resources

### Requirement 15: Offline Operation

**User Story:** As a free tier user, I want full functionality without internet, so that I can use the application without paying for cloud features.

#### Acceptance Criteria

1. WHERE Free_Tier, THE Application SHALL provide audio capture, transcription, note-taking, and note expansion without internet connectivity
2. WHERE Free_Tier, THE Application SHALL store all data in Local_Storage
3. WHERE Free_Tier, THE Application SHALL provide full-text search across all local meetings
4. WHERE Free_Tier, THE Application SHALL extract entities from transcripts locally
5. WHERE Free_Tier, THE Application SHALL operate all AI features (note expansion) using local models via Ollama
6. WHERE Free_Tier, WHEN internet is unavailable, THE Application SHALL display all features without degradation
7. WHERE Free_Tier, THE Application SHALL not require account creation or authentication

### Requirement 16: Team Collaboration

**User Story:** As a team member, I want to share meetings with my team, so that we can collaborate on meeting notes and insights.

#### Acceptance Criteria

1. WHERE Team_Tier, THE Application SHALL allow the User to share meetings with other team members
2. WHERE Team_Tier, WHEN a meeting is shared, THE Sync_Engine SHALL make it accessible to all specified team members
3. WHERE Team_Tier, THE Application SHALL allow team members to add notes and comments to shared meetings
4. WHERE Team_Tier, WHEN a team member modifies a shared meeting, THE Sync_Engine SHALL propagate changes to all team members within 30 seconds
5. WHERE Team_Tier, THE Application SHALL display which team member created each note or comment
6. WHERE Team_Tier, THE Application SHALL allow meeting owners to revoke access to shared meetings
7. WHERE Team_Tier, THE Application SHALL provide an admin dashboard showing team usage and storage

### Requirement 17: Conflict Resolution

**User Story:** As a user with multiple devices, I want conflicts resolved intelligently, so that I don't lose data when editing on different devices.

#### Acceptance Criteria

1. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN the Sync_Engine detects a Conflict, THE Application SHALL preserve both versions of the conflicting data
2. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN a Conflict occurs, THE Application SHALL notify the User and present both versions side-by-side
3. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, THE Application SHALL allow the User to choose one version, merge both versions, or manually edit the result
4. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, WHEN the User resolves a Conflict, THE Sync_Engine SHALL propagate the resolution to all devices
5. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, THE Application SHALL timestamp all changes to enable accurate conflict detection
6. WHERE Starter_Tier OR Pro_Tier OR Team_Tier, IF the User does not resolve a Conflict within 7 days, THEN THE Application SHALL automatically keep the most recent version and archive the older version

### Requirement 18: Error Handling and Logging

**User Story:** As a user, I want clear error messages when something goes wrong, so that I can understand and resolve issues.

#### Acceptance Criteria

1. IF any component fails, THEN THE Application SHALL display a user-friendly error message describing the issue
2. IF a critical error occurs, THEN THE Application SHALL log detailed error information including stack traces and system state
3. THE Application SHALL store logs locally for troubleshooting
4. THE Application SHALL limit log file size to 100MB and rotate logs when the limit is reached
5. IF the Application crashes, THEN THE Application SHALL attempt to save in-progress meeting data before terminating
6. WHEN the Application restarts after a crash, THE Application SHALL offer to recover any unsaved meeting data
7. THE Application SHALL provide a "Send Feedback" feature that includes relevant logs when the User reports an issue

### Requirement 19: Audio File Management

**User Story:** As a user, I want control over audio file storage, so that I can manage disk space according to my needs.

#### Acceptance Criteria

1. THE Application SHALL allow the User to configure whether to keep original audio files after transcription
2. WHEN the User chooses to delete audio files, THE Application SHALL retain transcripts and notes
3. THE Application SHALL display total disk space used by the Application
4. THE Application SHALL allow the User to delete individual meetings including all associated data
5. THE Application SHALL allow the User to export meetings with audio, transcripts, and notes as a single archive file
6. THE Application SHALL compress audio files using FLAC (Free Lossless Audio Codec) to minimize storage requirements
7. WHEN exporting meetings, THE Application SHALL create a portable format that can be imported on another Device
8. THE Application SHALL achieve approximately 1GB database file size for ~200 hours of meetings with compression

### Requirement 20: Accessibility and Usability

**User Story:** As a user, I want an intuitive interface, so that I can focus on my meetings rather than learning the software.

#### Acceptance Criteria

1. THE Application SHALL provide keyboard shortcuts for all primary functions
2. THE Application SHALL display a searchable list of all keyboard shortcuts
3. THE Application SHALL support system-level accessibility features (screen readers, high contrast mode)
4. THE Application SHALL provide visual feedback for all user actions within 100 milliseconds
5. THE Application SHALL use consistent terminology and icons throughout the interface
6. THE Application SHALL provide tooltips for all buttons and controls
7. THE Application SHALL include an onboarding tutorial for first-time users
8. THE onboarding tutorial SHALL guide users through: account creation, model download, first meeting, note expansion (Ctrl+Enter), and feature comparison
9. THE Application SHALL display Smart Chips for extracted entities (people, dates, amounts) in transcripts
10. Smart Chips SHALL be color-coded: People (blue), Dates (green), Amounts (orange), Action Items (red)
11. WHEN User clicks a Smart Chip, THE Application SHALL filter meetings by that entity

### Requirement 21: Pricing Tiers and Monetization

**User Story:** As a business, I want to monetize power users while keeping the free tier generous, so that I can sustain the product.

#### Acceptance Criteria

1. THE Application SHALL support five pricing tiers: Free, Starter, Pro, Team, and Enterprise
2. Free tier SHALL be priced at $0 forever with unlimited local transcription, note expansion, and search
3. Starter tier SHALL be priced at $9/month with 2 devices, 5GB cloud storage, and 50 AI queries/month
4. Pro tier SHALL be priced at $19/month or $12/month (annual) with unlimited devices, 25GB storage, and unlimited AI queries
5. Team tier SHALL be priced at $29/seat/month (minimum 3 seats) with shared meetings and admin dashboard
6. Enterprise tier SHALL have custom pricing starting at $49/seat/month with SSO, on-premise, and compliance features
7. THE Application SHALL display a transparent processing fee at checkout (e.g., "$19 + $1 processing fee = $20")
8. THE processing fee SHALL be paid by the customer, not deducted from the listed price
9. THE Application SHALL use Razorpay for Indian customers and Lemon Squeezy for international customers
10. THE Application SHALL automatically route to the appropriate payment gateway based on user's IP geolocation

### Requirement 22: Feature Traps and Upgrade Triggers

**User Story:** As a business, I want to convert free users to paid users at high-value moments, so that I can grow revenue.

#### Acceptance Criteria

1. THE Application SHALL implement a Device Wall limiting Starter tier to 2 active devices
2. WHEN a Starter user attempts to activate a 3rd device, THE Application SHALL display an upgrade prompt
3. THE upgrade prompt SHALL show: current devices, blocked device, and upgrade options (Pro tier)
4. THE Application SHALL implement an Intelligence Wall limiting Starter tier to 50 AI queries per month
5. WHEN a Starter user reaches 47/50 queries, THE Application SHALL display a warning notification
6. WHEN a Starter user exhausts 50 queries, THE Application SHALL block further queries until next month
7. THE Application SHALL display 6 upgrade trigger moments with clear value propositions
8. EACH upgrade trigger SHALL show a preview of Pro features without removing existing functionality
9. THE Application SHALL offer a 14-day free trial of Pro tier to all users
10. THE Application SHALL implement a referral system where inviter gets 1 week free Pro and invitee gets 14-day trial

### Requirement 24: Backend Abstraction

**User Story:** As an Enterprise customer, I want to self-host the backend, so that my data never leaves my infrastructure.

#### Acceptance Criteria

1. THE Application SHALL use an IBackendProvider interface for all backend operations
2. THE Application SHALL support three backend implementations: PiyAPIBackend, SelfHostedBackend, PostgreSQLBackend
3. WHERE Enterprise_Tier, THE Application SHALL support self-hosted backend deployment
4. THE Application SHALL allow backend configuration in settings
5. THE Application SHALL monitor backend health and display status to users
6. THE Application SHALL provide fallback to alternative backends if primary backend is unavailable

### Requirement 25: HIPAA Compliance

**User Story:** As a healthcare organization, I need HIPAA compliance, so that I can use the application for medical meetings.

#### Acceptance Criteria

1. WHERE Enterprise_Tier, THE Application SHALL provide a Business Associate Agreement (BAA)
2. THE Application SHALL detect 14 HIPAA identifiers before cloud sync
3. THE Application SHALL mask or warn about PHI before syncing to cloud
4. THE Application SHALL provide audit logs for all data access and modifications
5. THE Application SHALL encrypt all data at rest and in transit
6. THE Application SHALL support on-premise deployment for healthcare customers

### Requirement 26: SOC 2 Compliance

**User Story:** As an Enterprise customer, I need SOC 2 certification, so that I can meet my compliance requirements.

#### Acceptance Criteria

1. WHERE Enterprise_Tier, THE Application SHALL achieve SOC 2 Type II certification
2. THE Application SHALL implement immutable audit logs for all operations
3. THE Application SHALL enforce role-based access controls
4. THE Application SHALL encrypt all data at rest (AES-256-GCM) and in transit (TLS 1.3)
5. THE Application SHALL provide incident response procedures
6. THE Application SHALL undergo annual SOC 2 audits

### Requirement 27: Property-Based Testing

**User Story:** As a developer, I want property-based tests, so that I can validate correctness properties.

#### Acceptance Criteria

1. THE Application SHALL implement property-based tests for encryption (decrypt(encrypt(data)) = data)
2. THE Application SHALL implement property-based tests for sync (no data loss during conflicts)
3. THE Application SHALL implement property-based tests for search (all inserted data is searchable)
4. THE Application SHALL implement property-based tests for performance (RAM <6GB, CPU <60%)
5. THE Application SHALL run property-based tests in CI with 1000 iterations per test
6. THE Application SHALL block PRs that fail property-based tests

### Requirement 28: WAL Checkpoint Strategy

**User Story:** As a user, I want efficient database management, so that my disk space doesn't grow unbounded during long meetings.

#### Acceptance Criteria

1. THE Local_Storage SHALL configure SQLite with wal_autocheckpoint = 1000 pages
2. THE Local_Storage SHALL perform passive checkpoint every 10 minutes during active recording
3. WHEN a meeting ends, THE Local_Storage SHALL perform TRUNCATE checkpoint to reclaim disk space
4. THE Local_Storage SHALL monitor WAL file size and log warnings if it exceeds 100MB
5. IF WAL file exceeds 500MB, THE Local_Storage SHALL force immediate checkpoint
6. THE Local_Storage SHALL prevent multi-GB WAL files during 180-minute meetings

### Requirement 29: Battery-Aware AI Scheduling

**User Story:** As a laptop user, I want the application to respect my battery life, so that it doesn't drain my battery during meetings.

#### Acceptance Criteria

1. THE Application SHALL detect battery status using electron.powerMonitor
2. WHEN battery level drops below 20%, THE Application SHALL reduce AI processing frequency
3. WHEN on battery power, THE Application SHALL delay non-critical AI tasks (entity extraction, summarization)
4. WHEN plugged in, THE Application SHALL resume normal AI processing
5. THE Application SHALL provide battery-aware settings: "Performance Mode" vs "Battery Saver Mode"
6. IN Battery Saver Mode, THE Application SHALL disable real-time note expansion and queue for later
7. THE Application SHALL display battery impact estimate in settings

### Requirement 30: Content Size Limits and Chunking

**User Story:** As a user, I want to sync large meetings without errors, so that my data is reliably backed up.

#### Acceptance Criteria

1. THE Application SHALL document content size limits per plan: Free (5,000 chars), Starter (10,000 chars), Pro (25,000 chars), Team (50,000 chars), Enterprise (100,000 chars)
2. WHEN content exceeds plan limit, THE Application SHALL automatically chunk into multiple memories using TranscriptChunker
3. THE TranscriptChunker SHALL apply a 10% safety buffer to plan limits (e.g., 90% of 5,000 = 4,500 chars)
4. THE Application SHALL maintain chunk relationships using parent_id references
5. THE Application SHALL reassemble chunks when retrieving from backend
6. THE Application SHALL display warning when approaching plan limit
7. THE Application SHALL provide upgrade prompt when limit is exceeded

### Requirement 31: Embedding Status Polling

**User Story:** As a user, I want search to work immediately after sync, so that I can find my meetings right away.

#### Acceptance Criteria

1. AFTER syncing a memory, THE Application SHALL poll embedding_status until it equals 'ready'
2. THE Application SHALL poll every 1 second for up to 10 seconds
3. IF embedding_status is not 'ready' after 10 seconds, THE Application SHALL log warning and continue
4. THE Application SHALL display "Indexing..." indicator during embedding generation
5. THE Application SHALL enable search only after embedding_status = 'ready'
6. THE Application SHALL provide fallback to local search if cloud embedding fails

### Requirement 32: LWW Conflict Resolution with Yjs CRDT

**User Story:** As a user with multiple devices, I want my note edits to merge intelligently, so that I don't lose work when editing on different devices.

#### Acceptance Criteria

1. THE Application SHALL use Yjs CRDT for notes table to enable automatic conflict resolution
2. THE Application SHALL install Yjs alongside Tiptap in Phase 4 (not retrofitted later)
3. WHEN concurrent edits occur, THE Application SHALL merge changes using Last-Write-Wins (LWW) strategy with Yjs operational transformation
4. THE Application SHALL preserve all edit operations in Yjs document history
5. THE Application SHALL sync Yjs state updates via PiyAPI backend using state vectors
6. THE Application SHALL encode state vectors and diffs for efficient sync
7. THE Application SHALL display merge conflicts only when semantic conflicts are detected
8. THE Application SHALL provide undo/redo functionality using Yjs history
9. THE Application SHALL use YjsConflictResolver class for all CRDT operations

### Requirement 33: Compliance DELETE Endpoint

**User Story:** As a user, I want to permanently delete my data, so that I can exercise my right to be forgotten.

#### Acceptance Criteria

1. THE Application SHALL provide "Delete Account" option in settings
2. WHEN user deletes account, THE Application SHALL call DELETE /api/v1/compliance/delete endpoint
3. THE Application SHALL pass required parameters: user_id, reason, confirmation_token
4. THE Application SHALL display deletion confirmation with 7-day grace period
5. AFTER deletion, THE Application SHALL remove all local data and encryption keys
6. THE Application SHALL provide deletion certificate as proof of compliance

### Requirement 34: Graph Relationship Patterns

**User Story:** As a Pro user, I want to see how my meetings relate to each other, so that I can track decisions and contradictions over time.

#### Acceptance Criteria

1. THE Application SHALL detect 7 relationship types: follows, references, groups, related_to, contradicts, supersedes, parent
2. THE Application SHALL detect "contradicts" relationship when decisions change (e.g., "Budget is $1.8M" → "Budget is $2.3M")
3. THE Application SHALL detect "supersedes" relationship when new decisions replace old ones
4. THE Application SHALL detect "parent" relationship for meeting series (e.g., "Weekly Standup #1", "Weekly Standup #2")
5. THE Application SHALL display contradiction warnings with ⚠️ icon in UI
6. THE Application SHALL show side-by-side comparison when user clicks contradiction
7. THE Application SHALL update knowledge graph in real-time as relationships are detected

### Requirement 35: Query Quota Fallback Logic

**User Story:** As a Starter tier user, I want graceful degradation when I exhaust my AI query quota, so that I can still use the application.

#### Acceptance Criteria

1. THE Application SHALL track AI query usage locally in SQLite
2. WHEN Starter tier user reaches 47/50 queries, THE Application SHALL display warning notification
3. WHEN Starter tier user exhausts 50 queries, THE Application SHALL block cloud AI queries
4. WHEN quota is exhausted, THE Application SHALL offer fallback to local Qwen 2.5 3B model
5. THE Application SHALL display quota usage in settings: "AI Queries: 47 / 50 used this month"
6. THE Application SHALL reset quota on first day of each month
7. THE Application SHALL provide upgrade prompt when quota is exhausted

### Requirement 36: Recovery Key Export During Onboarding

**User Story:** As a new user, I want to save my recovery key during setup, so that I don't lose access to my encrypted data.

#### Acceptance Criteria

1. DURING onboarding, THE Application SHALL generate 24-word BIP39 recovery phrase
2. THE Application SHALL display recovery phrase with clear warning: "Save this phrase. Without it, your encrypted data is permanently unrecoverable."
3. THE Application SHALL require user to confirm they have saved the recovery phrase before continuing
4. THE Application SHALL provide "Download Recovery Key" button to save as text file
5. THE Application SHALL NOT allow user to skip recovery key export
6. THE Application SHALL provide "I have saved my recovery key" checkbox that must be checked
7. THE Application SHALL display recovery key again in settings for later export

### Requirement 37: Speaker Diarization UI

**User Story:** As a user, I want to see who said what in my meetings, so that I can quickly scan long transcripts.

#### Acceptance Criteria

1. THE Application SHALL display speaker labels in transcript (e.g., "Speaker 1:", "Speaker 2:")
2. THE Application SHALL color-code speakers with distinct colors (up to 8 speakers)
3. THE Application SHALL display speaker lanes in timeline view
4. WHERE Pro_Tier, THE Application SHALL allow renaming speakers (e.g., "Speaker 1" → "Sarah")
5. THE Application SHALL persist speaker renames across meetings
6. THE Application SHALL display speaker heatmap showing who spoke most
7. THE Application SHALL support filtering transcript by speaker

### Requirement 38: AI Trust Badges

**User Story:** As a user, I want to know what content is AI-generated, so that I can distinguish between my notes and AI expansions.

#### Acceptance Criteria

1. THE Application SHALL display 🤖 badge next to AI-generated content
2. THE Application SHALL display ✍️ badge next to human-written content
3. THE Application SHALL display confidence score for AI-generated content
4. THE Application SHALL allow user to toggle AI badge visibility in settings
5. THE Application SHALL display "AI-generated" tooltip on hover
6. THE Application SHALL highlight low-confidence AI content with yellow background

### Requirement 39: Bidirectional Source Highlighting

**User Story:** As a user, I want to see which transcript segments were used to expand my notes, so that I can verify AI claims.

#### Acceptance Criteria

1. WHEN user hovers over AI-expanded note, THE Application SHALL highlight source transcript segments
2. WHEN user clicks AI-expanded note, THE Application SHALL scroll to source transcript
3. WHEN user hovers over transcript segment, THE Application SHALL highlight related notes
4. THE Application SHALL display "Source: Transcript 00:23:45 - 00:24:10" tooltip
5. THE Application SHALL use bidirectional linking between notes and transcripts
6. THE Application SHALL display confidence score for each source link

### Requirement 40: Audio Playback Timeline

**User Story:** As a user, I want to navigate long recordings easily, so that I can jump to specific moments.

#### Acceptance Criteria

1. THE Application SHALL display audio waveform with playback scrubber
2. THE Application SHALL display speaker heatmap on timeline (color-coded by speaker)
3. THE Application SHALL allow clicking timeline to jump to specific timestamp
4. THE Application SHALL display transcript segments as markers on timeline
5. THE Application SHALL highlight current playback position in transcript
6. THE Application SHALL support keyboard shortcuts for playback (Space = play/pause, ← → = skip 10s)
7. THE Application SHALL display playback speed controls (0.5x, 1x, 1.5x, 2x)

### Requirement 41: Pinned Moments Feature

**User Story:** As a user, I want to mark important moments during meetings, so that I can quickly return to them later.

#### Acceptance Criteria

1. THE Application SHALL provide "Pin Moment" button (⭐) in transcript UI
2. WHEN user pins a moment, THE Application SHALL save timestamp and transcript segment
3. THE Application SHALL display pinned moments in sidebar
4. THE Application SHALL allow user to add notes to pinned moments
5. THE Application SHALL allow user to jump to pinned moment by clicking in sidebar
6. THE Application SHALL display pinned moments on audio timeline
7. THE Application SHALL support exporting pinned moments as summary

### Requirement 42: Transcript Corrections

**User Story:** As a user, I want to fix transcription errors, so that my meeting notes are accurate.

#### Acceptance Criteria

1. THE Application SHALL make transcript text inline-editable after meeting ends
2. WHEN user edits transcript, THE Application SHALL save original version for reference
3. THE Application SHALL display "Edited" badge next to corrected segments
4. THE Application SHALL update FTS5 index when transcript is edited
5. THE Application SHALL sync transcript corrections to cloud
6. THE Application SHALL preserve edit history for audit trail
7. THE Application SHALL allow reverting to original transcript

### Requirement 43: Mini Floating Widget Mode

**User Story:** As a user, I want a compact view during Zoom/Meet calls, so that the app doesn't take too much screen space.

#### Acceptance Criteria

1. THE Application SHALL provide "Mini Mode" toggle (Cmd+Shift+M)
2. IN Mini Mode, THE Application SHALL display compact always-on-top window
3. THE Application SHALL show real-time transcript in mini window
4. THE Application SHALL allow taking quick notes in mini window
5. THE Application SHALL display recording indicator and duration
6. THE Application SHALL allow expanding back to full mode
7. THE Application SHALL remember mini mode position and size

### Requirement 44: Progressive Onboarding

**User Story:** As a new user, I want guided setup, so that I understand how to use the application.

#### Acceptance Criteria

1. ON first launch, THE Application SHALL display onboarding tutorial
2. THE Application SHALL guide user through: account creation, model download, first meeting, note expansion (Ctrl+Enter), feature comparison
3. THE Application SHALL provide sample "ghost meeting" with pre-populated transcript and notes
4. THE Application SHALL allow user to try note expansion on sample meeting
5. THE Application SHALL display interactive tooltips highlighting key features
6. THE Application SHALL allow skipping onboarding
7. THE Application SHALL provide "Restart Tutorial" option in settings

### Requirement 45: Meeting Templates

**User Story:** As a user, I want pre-configured note structures, so that I don't start from blank every time.

#### Acceptance Criteria

1. THE Application SHALL provide meeting templates: 1:1, Standup, Planning, Retrospective, Interview
2. WHEN user starts meeting, THE Application SHALL offer template selection
3. THE Application SHALL pre-populate notes section with template structure
4. THE Application SHALL allow user to create custom templates
5. THE Application SHALL save templates per user
6. THE Application SHALL sync templates across devices
7. THE Application SHALL provide template marketplace (future enhancement)

### Requirement 46: Context Document Attachment

**User Story:** As a user, I want to attach reference documents before meetings, so that AI can use them for context.

#### Acceptance Criteria

1. THE Application SHALL allow attaching PDF, DOCX, TXT files to meetings
2. THE Application SHALL extract text from attached documents
3. THE Application SHALL include document content in AI context window
4. THE Application SHALL display attached documents in meeting sidebar
5. THE Application SHALL allow AI to reference attached documents in expansions
6. THE Application SHALL limit total attachment size to 10MB per meeting
7. THE Application SHALL sync attachments to cloud (Pro tier only)

### Requirement 47: Context Sessions API

**User Story:** As a Pro user, I want semantically relevant context for note expansion, so that AI expansions are more accurate and use optimal token budgets.

#### Acceptance Criteria

1. WHERE Pro_Tier OR Team_Tier OR Enterprise_Tier, WHEN expanding a note, THE Application SHALL use PiyAPI Context Sessions API for semantic context retrieval
2. THE Context Sessions API SHALL create a session with token_budget parameter (default: 2048 tokens)
3. THE Context Sessions API SHALL use semantic retrieval to find relevant transcript segments (not just time-based slicing)
4. THE Context Sessions API SHALL support multi-turn context accumulation across multiple expansions
5. THE Context Sessions API SHALL return context optimized for Qwen's 8-32K context window
6. WHERE Free_Tier OR offline, THE Application SHALL fall back to local SQL-based context window extraction (-60s to +10s)
7. THE Application SHALL use hasCloudAccess() to determine Context Sessions API vs local fallback
8. THE Application SHALL replace manual context window slicing with 5-line API call for cloud users

### Requirement 48: Local Embedding Service

**User Story:** As a user with encrypted sync enabled, I want local semantic search to work, so that I can find my meetings even when content is encrypted.

#### Acceptance Criteria

1. THE Application SHALL implement LocalEmbeddingService using all-MiniLM-L6-v2 model (ONNX, 25MB)
2. THE LocalEmbeddingService SHALL run in Phase 5 (before sync implementation in Phase 6)
3. WHEN syncing encrypted content, THE Application SHALL embed plaintext locally, then encrypt content, then send both to PiyAPI
4. THE Application SHALL use dual-path embedding: local embeddings for encrypted content, cloud embeddings for plaintext
5. THE Application SHALL provide local semantic search (Cmd+Shift+K) for offline use
6. THE Application SHALL integrate LocalEmbeddingService with SyncManager
7. THE Application SHALL prevent monetization collapse by ensuring encrypted sync doesn't break search
8. THE Application SHALL use LocalEmbeddingService for Free tier users (100% local operation)

### Requirement 49: Dual-Path Cloud/Local Logic

**User Story:** As a user, I want the application to intelligently use cloud features when available and fall back to local processing when offline or on free tier.

#### Acceptance Criteria

1. THE Application SHALL implement hasCloudAccess() function to determine cloud vs local processing
2. THE hasCloudAccess() SHALL return true when: user has Pro/Team/Enterprise plan AND sync is enabled AND internet is available
3. THE hasCloudAccess() SHALL return false when: user is on Free tier OR sync is disabled OR internet is unavailable
4. THE Application SHALL use hasCloudAccess() for Context Sessions API (cloud vs local SQL fallback)
5. THE Application SHALL use hasCloudAccess() for embedding service (cloud vs local embedding)
6. THE Application SHALL use hasCloudAccess() for entity extraction (cloud AI vs local regex)
7. THE Application SHALL check hasCloudAccess() using keytar to retrieve access token and plan tier
8. THE Application SHALL enable Free tier to operate 100% locally without degradation

### Requirement 22: Feature Traps and Upgrade Triggers

**User Story:** As a business, I want to convert free users to paid users at high-value moments, so that I can grow revenue.

#### Acceptance Criteria

1. THE Application SHALL implement a Device Wall limiting Starter tier to 2 active devices
2. WHEN a Starter user attempts to activate a 3rd device, THE Application SHALL display an upgrade prompt
3. THE upgrade prompt SHALL show: current devices, blocked device, and upgrade options (Pro tier)
4. THE Application SHALL implement an Intelligence Wall limiting Starter tier to 50 AI queries per month
5. WHEN a Starter user reaches 47/50 queries, THE Application SHALL display a warning notification
6. WHEN a Starter user exhausts 50 queries, THE Application SHALL block further queries until next month
7. THE Application SHALL display 6 upgrade trigger moments: Device Wall, AI Query Limit, Cross-Meeting Search, Decision Changed, Person Deep Dive, Weekly Digest
8. EACH upgrade trigger SHALL show a preview of Pro features without removing existing functionality
9. THE Application SHALL offer a 14-day free trial of Pro tier to all users
10. THE Application SHALL implement a referral system where inviter gets 1 week free Pro and invitee gets 14-day trial

### Requirement 23: Recovery Phrase and Key Management

**User Story:** As a user, I want to recover my encrypted data if I lose my password, so that I don't permanently lose my meeting history.

#### Acceptance Criteria

1. WHEN a User creates an account, THE Application SHALL generate a 24-word recovery phrase using BIP39 standard
2. THE Application SHALL display the recovery phrase during onboarding and require user confirmation
3. THE User SHALL NOT be able to proceed without confirming they have saved the recovery phrase
4. THE Application SHALL display a warning: "Without this phrase, your encrypted data is permanently unrecoverable"
5. THE Application SHALL provide a "Recover Account" flow where user enters recovery phrase
6. WHEN recovery phrase is entered, THE Application SHALL derive the master encryption key
7. THE Application SHALL store encryption keys in OS keychain (macOS Keychain, Windows Credential Manager) using keytar library
8. THE Application SHALL NEVER transmit encryption keys or recovery phrase to the backend

### Requirement 24: Performance Optimization

**User Story:** As a user, I want the application to run efficiently on my 8GB RAM laptop, so that it doesn't slow down my computer.

#### Acceptance Criteria

1. WHILE idle, THE Application SHALL consume less than 500MB of RAM
2. WHILE transcribing, THE Application SHALL consume approximately 2GB of RAM (Whisper 1.2GB + Electron 0.8GB)
3. WHILE expanding notes, THE Application SHALL consume approximately 4.3GB of RAM (Whisper + Phi-3 + Electron)
4. AFTER note expansion completes, THE Application SHALL unload Phi-3 model after 60 seconds of idle time
5. AFTER Phi-3 unloads, THE Application SHALL drop RAM usage back to approximately 2GB
6. THE Application SHALL use lazy-loading for Phi-3 model (load on first Ctrl+Enter press)
7. WHILE processing audio, THE Application SHALL use less than 40% CPU on average (acceptable: <60%, unacceptable: >80%)
8. THE Application SHALL achieve full-text search across 100,000 transcript segments in less than 50 milliseconds
9. THE Application SHALL start within 5 seconds on systems meeting minimum requirements
10. IF memory usage exceeds 5.5GB, THE Application SHALL log a warning and attempt to free unused resources

## Technical Constraints

### Architecture Constraints
- Three-tier intelligence model: Tier 1 (Local Fast Path), Tier 2 (Local Intelligence), Tier 3 (Cloud Intelligence)
- Tier 1 + 2 must work 100% offline (free tier experience)
- Tier 3 is optional enhancement for paid tiers
- AudioWorkletNode API required (not deprecated ScriptProcessorNode)
- VAD must run in separate Worker Thread to avoid blocking audio capture

### Performance Constraints
- Transcription lag: <2 seconds behind real-time (improved from 10s, target based on Whisper turbo benchmarks)
- Transcription speed: Whisper turbo 51.8x real-time (10s audio → 0.2s processing), Moonshine Base 290x real-time (10s audio → 34ms)
- RAM usage by tier: High (16GB: 4.5GB total), Mid (12GB: 3.3GB total), Low (8GB: 2.2GB total)
- RAM idle: <500MB when not recording
- RAM during transcription: ~1.5GB (Whisper turbo) or ~300MB (Moonshine Base) + 0.8GB Electron
- RAM during note expansion: Whisper/Moonshine + LLM (2.2GB Qwen 3B or 1.1GB Qwen 1.5B) + Electron
- RAM after expansion: Drops to transcription level after 60s idle (LLM auto-unloads)
- CPU usage: <25% average (improved from 40%, VAD reduces by 40%)
- Search response time: <50ms for local FTS5 search (improved from 500ms, validated benchmark: <1ms average)
- Note expansion time-to-first-token: <200ms with streaming (improved from 5s blocking)
- Note expansion token limit: 150-200 tokens (reduced from 500 based on benchmarks)
- Application startup time: <5 seconds (target: <3s)
- Sync conflict detection: <30 seconds
- Audio chunk size: 10 seconds (improved from 30s, reduces latency by 3x)
- SQLite insert performance: 75,188 inserts/second (validated benchmark)

### Platform Constraints
- Windows 10/11 support required
- macOS 11+ support required (Intel and Apple Silicon)
- Electron framework for cross-platform compatibility
- SQLite for local storage with WAL mode enabled
- Platform-adaptive ASR: Whisper turbo (16GB tier) or Moonshine Base (8-12GB tiers)
- Platform-adaptive LLM inference: MLX (Apple Silicon, 53 t/s) or Ollama (cross-platform, 36-37 t/s)
- Dual LLM strategy: Qwen 2.5 3B (action items, score 18) and Llama 3.2 3B (JSON extraction, score 21)
- Qwen 2.5 models: 3B (2.2GB RAM, high/mid tier) or 1.5B (1.1GB RAM, low tier)
- LLM lazy-loaded on first use, auto-unloaded after 60s idle

### Security Constraints
- Client-side encryption (AES-256-GCM) before cloud sync
- PBKDF2 key derivation with 100,000+ iterations
- No plaintext data transmission to Backend
- Encryption keys never leave the Device
- Keys stored in OS keychain via keytar library
- 24-word BIP39 recovery phrase for key recovery
- SQL injection protection via table name whitelist

### Storage Constraints
- Free tier: Local storage only (no cloud limit)
- Starter tier: 5GB cloud storage
- Pro tier: 25GB cloud storage
- Team tier: Storage based on team size
- Target: 1GB database file for ~200 hours of meetings

### Business Logic Constraints
- Free tier: Unlimited local features, no cloud sync, no account required
- Starter tier: 2 devices, 50 AI queries/month, $9/month
- Pro tier: Unlimited devices and AI queries, $19/month or $12/month annual
- Team tier: Shared meetings and admin dashboard, $29/seat/month (min 3 seats)
- Enterprise tier: Custom pricing, SSO, on-premise, HIPAA BAA, SOC 2
- Processing fees paid by customer (transparent at checkout)
- Dual payment gateway: Razorpay (India) + Lemon Squeezy (global)

## MVP Scope for 45-Day Beta Launch

The following requirements are prioritized for the initial beta release:

**Must Have (MVP Core):**
- Requirement 1: Audio Capture (with pre-flight test and fallback chain)
- Requirement 2: Real-Time Transcription (with performance tier detection)
- Requirement 3: Note Taking with AI Expansion
- Requirement 4: Local Data Storage
- Requirement 5: Local Full-Text Search
- Requirement 13: Platform Support (Windows and macOS)
- Requirement 14: Performance and Resource Management
- Requirement 15: Offline Operation
- Requirement 18: Error Handling and Logging
- Requirement 20: Accessibility and Usability (including Smart Chips)
- Requirement 24: Performance Optimization (RAM management, lazy-loading)
- Requirement 28: WAL Checkpoint Strategy (prevents multi-GB WAL files)
- Requirement 29: Battery-Aware AI Scheduling (respects laptop battery life)
- Requirement 30: Content Size Limits and Chunking (prevents 413 errors)
- Requirement 36: Recovery Key Export During Onboarding (prevents data loss)

**Should Have (Beta Enhancement):**
- Requirement 6: Entity Extraction
- Requirement 7: Cloud Synchronization (with vector clocks and queue persistence)
- Requirement 8: Data Encryption (with keytar storage)
- Requirement 9: Device Management
- Requirement 19: Audio File Management (with FLAC compression)
- Requirement 21: Pricing Tiers and Monetization (basic implementation)
- Requirement 22: Feature Traps and Upgrade Triggers (Device Wall, Intelligence Wall)
- Requirement 23: Recovery Phrase and Key Management
- Requirement 31: Embedding Status Polling (ensures search works after sync)
- Requirement 32: LWW Conflict Resolution with Yjs CRDT (intelligent merge)
- Requirement 35: Query Quota Fallback Logic (graceful degradation)
- Requirement 37: Speaker Diarization UI (color-coded speakers)
- Requirement 38: AI Trust Badges (distinguish AI vs human content)
- Requirement 39: Bidirectional Source Highlighting (verify AI claims)
- Requirement 40: Audio Playback Timeline (waveform scrubber)
- Requirement 41: Pinned Moments Feature (mark important moments)
- Requirement 42: Transcript Corrections (fix transcription errors)
- Requirement 43: Mini Floating Widget Mode (compact view during calls)
- Requirement 44: Progressive Onboarding (guided setup with sample meeting)
- Requirement 45: Meeting Templates (pre-configured note structures)
- Requirement 46: Context Document Attachment (attach PDFs for AI context)
- Requirement 47: Context Sessions API (semantic context retrieval for Pro tier)
- Requirement 48: Local Embedding Service (prevents monetization collapse)
- Requirement 49: Dual-Path Cloud/Local Logic (hasCloudAccess() for intelligent fallback)

**Could Have (Post-Beta):**
- Requirement 10: Cross-Meeting AI Queries
- Requirement 11: Knowledge Graph Visualization (with contradiction detection)
- Requirement 12: Weekly Digest Generation (with entity aggregation)
- Requirement 16: Team Collaboration
- Requirement 17: Conflict Resolution (advanced scenarios)
- Requirement 33: Compliance DELETE Endpoint (GDPR right to be forgotten)
- Requirement 34: Graph Relationship Patterns (7 relationship types with contradiction detection)

## Success Metrics

- Transcription accuracy: >90% word error rate
- User retention: >60% after 30 days
- Crash rate: <1% of sessions
- Sync success rate: >99% for paid tiers
- Average meeting processing time: <2x meeting duration
- User satisfaction: >4.0/5.0 rating

## Dependencies

- Whisper.cpp library for transcription
- Ollama with Phi-3 Mini model for note expansion
- Electron framework for desktop application
- SQLite for local database
- PiyAPI Backend for cloud features (paid tiers)
- Platform-specific audio APIs (Core Audio, WASAPI)

## Assumptions

- Users have devices meeting minimum requirements (8GB RAM, modern CPU)
- Users on paid tiers have reliable internet connectivity for sync
- Ollama is installed and configured for local AI features
- Users grant necessary permissions for audio capture
- Meeting audio quality is sufficient for transcription (>16kHz sample rate)
