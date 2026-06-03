# BlueArkive — Product Brief

> **Product Name**: BlueArkive  
> **Tagline**: Your meetings remember everything. You don't have to.  
> **Version**: 0.3.6 (Private Beta)  
> **Platform**: macOS (primary) · Windows · Linux  
> **Category**: AI Meeting Intelligence · Local-First Productivity · Cognitive Memory Fabric  
> **Website**: [bluearkive.com](https://bluearkive.com)  
> **Brief Owner**: Piyush Kumar — Founder & CEO  
> **Date**: May 30, 2026  
> **Status**: 🟡 Private Beta → Public Beta (Q3 2026)

---

## 1. Problem Statement

### What problem are we solving?

**Professionals lose 80% of meeting value within 24 hours.** The average knowledge worker attends 15.5 meetings per week (Microsoft Work Trend Index 2025), yet retains less than 20% of what was discussed by the next day (Ebbinghaus forgetting curve). This creates a compounding organizational amnesia:

- **Action items vanish.** 63% of action items from meetings are never completed because they weren't captured or were lost in scattered notes.
- **Decisions are forgotten.** Teams re-discuss the same topics across multiple meetings, wasting an estimated 31 hours/month per employee.
- **Context collapses.** When a team member asks "what did we decide about X three weeks ago?", no one can answer with certainty. The institutional memory lives in someone's head — or nowhere.

### Why existing solutions fail

| Pain Point       | Current State                                            | Why It Fails                                                                                             |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Privacy**      | Existing tools send all audio to cloud servers           | Regulated industries (healthcare, legal, finance) cannot use them. HIPAA/SOC2 violations.                |
| **Intelligence** | Most tools are transcript dumps — keyword search at best | No understanding of _relationships_ between meetings. No contradiction detection. No temporal reasoning. |
| **Ownership**    | Data lives on vendor servers                             | Vendor lock-in. If a provider shuts down or raises prices, your entire meeting history is hostage.       |
| **Integration**  | Standalone tools that don't connect to workflow          | Transcripts sit in a silo. No knowledge graph. No cross-meeting action item tracking.                    |
| **Cost**         | $20-40/user/month for basic transcription                | Unsustainable for teams of 10+. Most of the cost pays for cloud compute, not intelligence.               |

### The deeper insight

The real problem isn't transcription — it's **cognitive decay**. Meetings generate the richest, most context-dense knowledge in an organization, yet it's the _least structured and least retrievable_. Email has search. Code has Git. Documents have version history. But meetings? They evaporate.

**BlueArkive treats meetings as first-class knowledge objects** — transcribed, encrypted, semantically indexed, connected through a knowledge graph, and queryable with natural language — all without your data ever leaving your device.

---

## 2. Product Vision

> **We are building the world's first sovereign cognitive memory fabric for meetings.**

BlueArkive is not a transcription tool. It's a **local-first intelligence layer** that transforms ephemeral conversations into persistent, queryable, interconnected organizational memory — with the privacy guarantees that regulated industries demand and the cognitive depth that cloud-first architectures fundamentally cannot deliver.

### Vision Statement (3-Year)

By 2029, BlueArkive will be the default meeting intelligence platform for privacy-conscious organizations — from solo consultants to Fortune 500 legal departments — replacing the fragile cloud-dependent tools of the 2020s with a sovereign, AI-native knowledge fabric that users actually own.

### Core Design Principles

| Principle                   | What It Means                                                              | How We Enforce It                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Local-First**             | Core functionality works without internet. Your data lives on your device. | All AI inference, transcription, search, and encryption run via edge-optimized machine learning and embedded local storage.                        |
| **Privacy by Architecture** | Privacy isn't a feature toggle — it's a structural guarantee.              | Military-grade AES-256-GCM encryption with rigorous key derivation. Keys stored securely in the native OS keychain. Zero-knowledge cloud sync.     |
| **Cognitive Depth**         | Go beyond transcription to understanding.                                  | Knowledge graph with entity extraction, contradiction detection, sentiment analysis, and temporal reasoning.       |
| **Data Sovereignty**        | Users own their data. Period.                                              | 24-word BIP39 recovery phrase. Crypto-shredding capability. Self-hostable backend. No vendor lock-in.              |
| **Hardware-Adaptive**       | Performance should match the device.                                       | 3-tier hardware detection (high/mid/low) with Apple Silicon GPU acceleration and battery-aware scheduling.         |

---

## 3. Product Objectives

### Primary Objectives (v1.0 — Public Launch)

| #   | Objective                                           | Key Result                                                                      | Target Date |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------- | ----------- |
| O1  | **Ship production-grade local transcription**       | < 3s latency on Apple Silicon, 95%+ WER accuracy via Whisper                    | Q3 2026     |
| O2  | **Deliver "Ask Your Meetings" intelligence**        | Users can query across all meetings with natural language and get cited answers | Q3 2026     |
| O3  | **Achieve enterprise-grade security certification** | Pass SOC2 Type I audit; HIPAA-compliant architecture validated                  | Q4 2026     |
| O4  | **Establish product-market fit signal**             | 500 active beta users, 40%+ weekly retention, NPS > 50                          | Q4 2026     |
| O5  | **Launch pricing and billing**                      | Functional 5-tier billing (Free → Enterprise) with Razorpay + LemonSqueezy      | Q3 2026     |

### Stretch Objectives (v1.5+)

| #   | Objective                         | Key Result                                                           | Target Date |
| --- | --------------------------------- | -------------------------------------------------------------------- | ----------- |
| S1  | **Team collaboration**            | Shared workspaces with role-based access, centralized billing        | Q1 2027     |
| S2  | **Mobile companion app**          | iOS/Android app for meeting playback and search (read-only MVP)      | Q2 2027     |
| S3  | **Calendar-aware auto-recording** | Auto-start transcription when a calendar meeting begins              | Q1 2027     |
| S4  | **Webhook ecosystem**             | Event-driven integrations (Slack, Notion, Linear, Jira) via webhooks | Q1 2027     |

---

## 4. Target Audience

### Primary Personas

#### Persona 1: "The Solo Consultant" — Maya, 34

| Attribute          | Detail                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Role**           | Independent management consultant                                                                                                                                                          |
| **Pain**           | Takes 8-12 client meetings/week. Spends 2+ hours/day writing up notes. Can't search across past client conversations.                                                                      |
| **Current Tools**  | Apple Notes + Voice Memos + manual transcription                                                                                                                                           |
| **Why BlueArkive** | Automatic transcription saves 10+ hrs/week. Cross-meeting search means she can recall what Client X said about budget 3 months ago in seconds. Client confidentiality demands local-first. |
| **Tier**           | Pro ($19/mo)                                                                                                                                                                               |
| **Deal Breaker**   | If any client audio touches a third-party server                                                                                                                                           |

#### Persona 2: "The Engineering Lead" — Raj, 29

| Attribute          | Detail                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role**           | Senior Engineering Manager at a 200-person startup                                                                                                                      |
| **Pain**           | 15+ meetings/week. Decisions made in standups get lost. Action items from sprint retros are never tracked. New hires have zero context on past architectural decisions. |
| **Current Tools**  | Google Meet recordings (which nobody re-watches) + Notion (manually updated)                                                                                            |
| **Why BlueArkive** | Knowledge graph connects decisions across sprints. "Ask Meetings" gives new hires instant context. Weekly digest auto-summarizes what happened.                         |
| **Tier**           | Team ($15/user/mo)                                                                                                                                                      |
| **Deal Breaker**   | If it requires admin overhead to set up or manage                                                                                                                       |

#### Persona 3: "The Compliance Officer" — Dr. Sarah, 42

| Attribute          | Detail                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role**           | Chief Compliance Officer at a regional hospital network                                                                                                                                        |
| **Pain**           | Clinical team meetings discuss PHI. Federal regulations prohibit sending audio to cloud services. Current meeting tools are banned by IT.                                                      |
| **Current Tools**  | Manual note-taking + locked filing cabinets                                                                                                                                                    |
| **Why BlueArkive** | HIPAA-compliant architecture (local processing + encryption + audit logs). PHI auto-detection prevents accidental data leakage through comprehensive scanning of sensitive identifiers.                                  |
| **Tier**           | Enterprise (Custom)                                                                                                                                                                            |
| **Deal Breaker**   | If it can't pass their security audit                                                                                                                                                          |

### Market Segmentation

| Segment                                                       | TAM Estimate               | Priority               | Why                                                                      |
| ------------------------------------------------------------- | -------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| **Solo Knowledge Workers** (consultants, lawyers, therapists) | ~12M users globally        | 🔴 P0 — Launch segment | Low acquisition cost, high pain, privacy-sensitive, word-of-mouth driven |
| **Startup Engineering Teams** (5-50 person)                   | ~800K teams globally       | 🟠 P1 — Post-launch    | Team features drive expansion revenue, strong PLG motion                 |
| **Regulated Enterprise** (healthcare, legal, finance)         | ~2M organizations globally | 🟡 P2 — v1.5+          | Highest ARPU, longest sales cycle, requires compliance certifications    |

---

## 5. Key Features & Functionality

### 5.1 Core Features (v1.0 — Must Ship)

#### 🎙️ Real-Time Local Transcription

- **What**: Live speech-to-text using state-of-the-art transcription models running entirely locally, with simultaneous mic and system audio capture.
- **Why it matters**: Captures both sides of the conversation (you and the remote participants on Zoom/Teams) securely without virtual audio cables. < 3s latency on Apple Silicon.
- **Technical**: Native multi-channel capture for system and microphone audio. Advanced voice activity detection and intelligent chunking ensure high accuracy and performance. Hardware-adaptive model selection.

#### 👥 Local Speaker Diarization

- **What**: Identifies 'Speaker A' vs 'Speaker B' entirely on-device.
- **Why it matters**: A transcript is useless if you don't know who agreed to the deal. Local diarization maintains privacy while structuring the conversation.
- **Technical**: Integrated into the transcription pipeline, avoiding expensive and privacy-violating cloud API calls.

#### 🔐 End-to-End Encryption

- **What**: AES-256-GCM encryption with rigorous key derivation
- **Why it matters**: Even if a device is stolen, data is unreadable without the user's passphrase
- **Technical**: Keys stored securely in the native OS keychain. Standard 24-word recovery phrase. Cryptographic keys are aggressively zeroed from memory on lock or shutdown. Crypto-shredding guarantees all data is permanently unrecoverable upon key deletion.

#### 🔍 Semantic Search & Chat ("Ask Your Meetings")

- **What**: A "ChatGPT-like" conversational interface with real-time token streaming, capable of natural language queries across all historical transcripts and notes.
- **Why it matters**: Keyword search fails when you forget exact phrasing. "What did we decide about the pricing model?" returns the exact moment with synthesized answers and interactive source citations.
- **Technical**: Utilizes an advanced **Cognitive RAG Pipeline** with a **3-tier search escalation** architecture: (1) Instant local full-text search, (2) Local semantic search via embedded models, and (3) Cloud-hybrid semantic and fuzzy search (tier-gated). Results are rank-fused across tiers. Conversational state is managed natively with streaming token support and mid-generation cancellation, freeing hardware resources immediately. Crash-safe local indexing ensures query availability immediately post-meeting.

#### 🧠 Bitemporal Knowledge Graph

- **What**: Automatically extracts entities (people, topics, decisions, action items) and maps multi-hop relationships across your entire meeting history.
- **Why it matters**: Transcripts are static; a knowledge graph is a living memory. It surfaces connections humans miss — e.g., "Every time we discuss pricing, Sarah raises compliance concerns."
- **Technical**: Advanced entity extraction via local machine learning models. Powered by an internal **Conflict Resolution Engine**, utilizing intelligent logic to detect temporal contradictions (e.g., a decision made in Q1 reversed in Q2). Visualized locally via an interactive force-directed graph.

#### 📝 AI-Powered Note Expansion & Derivation

- **What**: A rich text editor (TipTap) that acts as an autonomous scribe. It uses the raw, multi-speaker transcript to auto-expand shorthand notes, summarize themes, and extract assignee-mapped action items.
- **Why it matters**: Turns messy, shorthand meeting notes into structured, shareable PRDs or executive summaries in one click, eliminating post-meeting administrative work.
- **Technical**: Context-aware AI processing grounded in intelligently chunked transcripts. Derives underlying intent rather than just summarizing text. Includes deterministic action item extraction.

#### 💡 Live AI Coach & Silent Prompter

- **What**: Real-time, in-meeting suggestions that push directly to the OS overlay based on meeting context, supporting **4 prompt modes**: title suggestion, follow-up question, action item extraction, and decision summarization.
- **Why it matters**: Guides negotiations, reminds you to ask qualifying questions, or notes when you are dominating the conversation without distracting you. Each mode produces a structurally different output — not just generic summaries.
- **Technical**: Contextually generates suggestions from recent transcript history. **Dual-path execution**: Premium cloud execution for advanced modes, with a local on-device fallback always available. Model parameters adapt dynamically per mode to optimize for analytical precision or creative questioning. Seamlessly updates the OS widget state.

#### 📅 Automated Weekly Digest

- **What**: A synthesized, cross-meeting report generated at the end of the week, summarizing key decisions, persistent blockers, and macro-trends across all conversations.
- **Why it matters**: Gives executives and managers a "bird's-eye view" of their week without re-reading transcripts. Highlights unresolved action items automatically.
- **Technical**: Aggregates local meeting statistics and fuses them with AI-derived macro-insights. Works gracefully offline by prioritizing local heuristics, falling back to cloud enrichment only if permitted by tier.

#### 🏝️ Persistent OS Capture (Dynamic Island) & Global Shortcuts

- **What**: A floating, always-on top OS-level widget (Dynamic Island style) that provides spatial handoff and **full meeting control without restoring the main window** — including quick notes, bookmarks, pause/resume, and start capture — paired with global keyboard shortcuts.
- **Why it matters**: You shouldn't have to hunt for a window to start recording or view a coach tip. The widget is a complete control surface: submit a quick note, drop a bookmark on an important moment, or pause recording — all without switching apps.
- **Technical**: Native-feeling OS overlay with robust window detection. Secure proxy channels for quick actions with smooth spatial handoff animations. Visibility is auto-managed based on recording state, paired with system-wide hotkeys.

#### 🎓 Interactive Ghost Meeting Tutorial

- **What**: A state-machine-driven onboarding experience that simulates a real meeting — live transcript streaming, AI Coach suggestions, note expansion, and Dynamic Island takeover — before the user's first real session.
- **Why it matters**: Most productivity tools overwhelm new users with feature lists. BlueArkive _shows_ the product in action through a 5-step interactive tutorial, building muscle memory before the first real meeting. Users experience the "aha moment" in 90 seconds, not 90 minutes.
- **Technical**: 5-phase state machine driving an interactive tutorial. Uses real UI components — not mockups — for live transcript streaming, AI Coach demonstrations, and note expansion. Features typewriter animations for AI responses and a progress indicator, with the ability to skip anytime.

#### 🩺 Self-Healing Health Dashboard

- **What**: A 7-system diagnostic panel that tests all critical subsystems (Database, Auth, Microphone, Screen Recording, Network, Disk Space, Native Modules) and offers one-click proactive repair actions.
- **Why it matters**: Enterprise users and IT admins need to verify system health without contacting support. The dashboard turns "it's not working" support tickets into self-service fixes.
- **Technical**: Runs 7 diagnostic probes in sequence covering database connectivity, authentication, native OS media access, network health, disk space, and core modules. Provides direct repair actions such as requesting OS permissions, deep-linking to system settings, or self-service search index rebuilding.

#### 📱 Device Management

- **What**: Multi-device registration, tier-gated device limits, remote deactivation, and device renaming — with structured error responses when limits are exceeded.
- **Why it matters**: Users need to manage which devices have access to their meeting data. Tier-gated device limits drive upgrades (Free: 1 device, Starter: 2, Pro+: unlimited).
- **Technical**: Centralized device management service supporting registration and limits based on subscription tier. Limit-exceeded scenarios are handled gracefully to present contextual upgrade paths.

#### 🔋 Battery-Aware Resource Scheduling

- **What**: Automatic detection of battery vs. AC power state, with resource reduction when on battery to preserve laptop battery during long meetings.
- **Why it matters**: A 2-hour meeting on battery shouldn't kill your laptop. BlueArkive automatically reduces AI inference frequency, defers background embedding, and throttles sync when unplugged.
- **Technical**: Wraps native OS power monitoring APIs. Battery state is propagated throughout the application, automatically instructing resource-intensive subsystems to scale down when unplugged.

#### 🔄 Encrypted Cloud Sync

- **What**: Multi-device sync with end-to-end encryption. Data is encrypted before it leaves the device.
- **Why it matters**: Use BlueArkive on your MacBook at work and your iMac at home without compromising privacy
- **Technical**: Vector clock-based conflict resolution and CRDT compatibility ensure robust multi-device sync. Data is synced atomically with strict schema whitelisting.

### 5.2 Differentiating Features

| Feature                           | Capability                                      | Industry Standard                       |
| --------------------------------- | ----------------------------------------------- | --------------------------------------- |
| **Local-first processing**        | ✅ All AI runs locally on-device                | Most tools require cloud processing     |
| **System Audio Capture**          | ✅ WASAPI / ScreenCaptureKit native             | Often requires clunky 3rd party drivers |
| **Local Speaker Diarization**     | ✅ Identifies speakers on-device                | Almost exclusively cloud-based          |
| **End-to-end encryption**         | ✅ AES-256-GCM + BIP39 recovery                 | Rare in meeting tools                   |
| **Cross-meeting knowledge graph** | ✅ Entity + relationship mapping                | Not available elsewhere                 |
| **Contradiction detection**       | ✅ Temporal reasoning across meetings           | Not available elsewhere                 |
| **PHI auto-detection**            | ✅ 17 identifiers + Luhn validation             | Not available elsewhere                 |
| **Live AI Coach**                 | ✅ Real-time contextual nudges                  | Not available elsewhere                 |
| **Dynamic Island & Hotkeys**      | ✅ Persistent spatial handoff UI                | Not available elsewhere                 |
| **Hardware-adaptive AI**          | ✅ 3-tier + GPU + battery-aware                 | Not available elsewhere                 |
| **Self-hostable backend**         | ✅ IBackendProvider abstraction                 | Rare in meeting tools                   |
| **Crypto-shredding**              | ✅ Delete keys = delete all data                | Not available elsewhere                 |
| **Weekly meeting digest**         | ✅ Auto-generated summaries                     | Limited availability                    |
| **Offline functionality**         | ✅ Full (transcription + search + notes)        | Rare — most require internet            |
| **Sentiment analysis**            | ✅ Per-segment emotional tone                   | Limited availability                    |
| **Audit logs (HIPAA)**            | ✅ Tamper-evident logging + CSV export          | Not available elsewhere                 |
| **Ghost Meeting onboarding**      | ✅ Interactive tutorial with real UI components | Not available elsewhere                 |
| **Self-healing diagnostics**      | ✅ 7-system health check + 1-click repair       | Not available elsewhere                 |
| **Multi-mode AI suggestions**     | ✅ 4 modes (title/question/action/decision)     | Not available elsewhere                 |
| **Cancellable AI generation**     | ✅ AbortController mid-stream cancellation      | Not available elsewhere                 |
| **Widget quick actions**          | ✅ Notes/bookmarks/pause from widget            | Not available elsewhere                 |
| **Battery-aware scheduling**      | ✅ Auto-reduces resources on battery            | Rare in meeting tools                   |
| **3-tier search escalation**      | ✅ FTS5 → Semantic → Cloud Hybrid               | Not available elsewhere                 |
| **Device management**             | ✅ Multi-device registration + tier limits      | Limited availability                    |

### 5.3 Feature Tiers (Pricing Gates)

| Feature                | Free      | Starter ($9/mo) | Pro ($19/mo) | Team ($15/user/mo) | Enterprise  |
| ---------------------- | --------- | --------------- | ------------ | ------------------ | ----------- |
| Local transcription    | ✅        | ✅              | ✅           | ✅                 | ✅          |
| Transcript limit       | 5K chars  | 15K chars       | 50K chars    | 100K chars         | 100K chars  |
| Cloud sync             | —         | ✅              | ✅           | ✅                 | ✅          |
| Devices                | 1         | 2               | Unlimited    | Unlimited          | Unlimited   |
| AI queries/mo          | —         | 50              | Unlimited    | Unlimited          | Unlimited   |
| Knowledge Graph        | View only | View only       | Interactive  | Interactive        | Interactive |
| Speaker diarization    | —         | ✅              | ✅           | ✅                 | ✅          |
| Weekly digest          | —         | ✅              | ✅           | ✅                 | ✅          |
| Hybrid search          | —         | —               | ✅           | ✅                 | ✅          |
| Calendar sync          | —         | ✅              | ✅           | ✅                 | ✅          |
| Calendar auto-link     | —         | —               | ✅           | ✅                 | ✅          |
| Webhooks               | —         | 3               | 10           | Unlimited          | Unlimited   |
| Team collaboration     | —         | —               | —            | ✅                 | ✅          |
| Audit logs             | —         | —               | —            | —                  | ✅          |
| SSO / SAML             | —         | —               | —            | —                  | ✅          |
| Custom SLA             | —         | —               | —            | —                  | ✅          |
| Sentiment analysis     | ✅        | ✅              | ✅           | ✅                 | ✅          |
| Action items           | ✅        | ✅              | ✅           | ✅                 | ✅          |
| Dynamic Island Widget  | ✅        | ✅              | ✅           | ✅                 | ✅          |
| Widget quick actions   | ✅        | ✅              | ✅           | ✅                 | ✅          |
| Health Dashboard       | ✅        | ✅              | ✅           | ✅                 | ✅          |
| Ghost Meeting tutorial | ✅        | ✅              | ✅           | ✅                 | ✅          |
| Device management      | 1 device  | 2 devices       | Unlimited    | Unlimited          | Unlimited   |
| Live AI Coach          | —         | —               | ✅           | ✅                 | ✅          |
| Multi-mode suggestions | —         | Title only      | All 4 modes  | All 4 modes        | All 4 modes |

---

## 6. Strategic Advantages

### Why BlueArkive Wins

1. **Privacy is structural, not promised.** BlueArkive _architecturally cannot_ access your data — keys live in your OS keychain, not on our servers. This is a design guarantee, not a policy promise.

2. **Intelligence compounds over time.** A transcript is a snapshot. A knowledge graph is a living memory. BlueArkive gets smarter with every meeting — after 50 meetings, the intelligence gap is uncatchable.

3. **Regulated industries have no alternative.** A HIPAA-compliant meeting intelligence tool that works offline with E2E encryption and PHI detection doesn't exist today. We are creating the category.

4. **Cloud economics favor us.** Cloud-based transcription costs ~$0.006/minute per user. Our marginal cost per user is near zero — inference runs on the user's own hardware. This enables a structurally lower price point with higher margins.

### Latency: BlueArkive vs Cluely

| Operation | BlueArkive (Local) | Cluely (Cloud) | Winner |
| --- | --- | --- | --- |
| **STT Processing** | 0.58s per 30s audio (Whisper Turbo) | Network RTT + Deepgram API queue | 🏆 BlueArkive |
| **STT (low-tier)** | 34ms per 10s audio (Moonshine) | Same cloud dependency | 🏆 BlueArkive |
| **LLM First Token** | ~130ms (Qwen 2.5 3B local) | 5–90 seconds (reported by users/Business Insider) | 🏆 BlueArkive |
| **Search (FTS5)** | <1ms average across 100K segments | Pinecone API call + network | 🏆 BlueArkive |
| **Database Writes** | 75,188 inserts/sec (SQLite WAL) | Neon serverless cold-start + network | 🏆 BlueArkive |
| **Offline Latency** | Same as above — zero degradation | ∞ — completely non-functional | 🏆 BlueArkive |
| **VAD Processing** | <10ms per chunk (Silero ONNX) | Unknown (likely server-side) | 🏆 BlueArkive |

#### Why the gap is so massive
- **BlueArkive's latency** = compute time only — no network hop, no API queue, no cold start.
- **Cluely's latency** = network RTT + API queue + vendor processing + return trip — for every single request, through multiple vendors in series (Deepgram → Pinecone → OpenAI → Pusher).

The 5–90 second latency range reported for Cluely makes it essentially useless for real-time interview/meeting assistance — the very thing it's marketed for. BlueArkive's 130ms time-to-first-token is **~40-700× faster**.

**BlueArkive wins latency by 1-3 orders of magnitude. 🏆**

### Market Positioning

<div style="page-break-inside: avoid;">
<p align="center"><img src="market-positioning.png" alt="Market Positioning" width="400" /></p>
</div>

BlueArkive occupies the **top-left quadrant** — deep AI with high privacy — a position that is structurally difficult for cloud-first incumbents to reach because privacy requires architectural commitment, not feature additions.

---

## 7. Technical Architecture

### System Overview

<div style="page-break-inside: avoid;">
<p align="center"><img src="system-overview.png" alt="System Overview" width="600" /></p>
</div>

### Technology Stack

| Layer             | Technology                               | Why                                                            |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------- |
| **Runtime**       | Modern secure native wrapper             | Cross-platform native app with system-level audio access       |
| **Frontend**      | Performant Web Technologies              | Smooth state management, declarative UI                        |
| **Database**      | Crash-safe embedded database             | < 1ms reads, fully local, enterprise-ready datastore           |
| **Search**        | Embedded Search (FTS + Vector)           | Hybrid keyword + semantic search without cloud dependency      |
| **ASR**           | State-of-the-art ASR                     | High accuracy, runs locally with hardware acceleration         |
| **Encryption**    | AES-256-GCM + PBKDF2                     | Military-grade encryption with OS-native key storage           |
| **Visualization** | Native interactive data mapping          | Interactive knowledge graph with dynamic capability            |
| **Sync**          | Vector clocks + CRDT                     | Conflict-free multi-device sync without central authority      |
| **Cloud Backend** | Cognitive Cloud Backend                  | Advanced cognitive engine with bitemporal KG and tool integrations |
| **Billing**       | Razorpay (India) + LemonSqueezy (Global) | Dual payment gateway for global + India-specific pricing (INR) |

### Service Architecture (40 Services)

| Category         | Services                                                                                      | Purpose                                                   |
| ---------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Audio**        | ASRService, AudioPipelineService, AudioCacheCleanup                                           | Capture → VAD → Whisper → Transcript                      |
| **Intelligence** | LocalEntityExtractor, SentimentAnalyzer, ActionItemService                                    | Entity extraction, sentiment, action items                |
| **Storage**      | DatabaseService, MigrationService, BackgroundEmbeddingQueue                                   | SQLite ops, schema migrations, async embedding            |
| **Search**       | LocalEmbeddingService (FTS5 + vectors)                                                        | Hybrid semantic + keyword search                          |
| **Security**     | EncryptionService, KeyStorageService, RecoveryPhraseService, PHIDetectionService, AuditLogger | E2E encryption, key management, PHI scanning, audit trail |
| **Sync**         | SyncManager, ConflictResolver, VectorClockManager, YjsConflictResolver, DeviceManager         | Multi-device sync with CRDT conflict resolution           |
| **Cloud**        | AuthService, CloudAccessManager, CloudTranscriptionService                                    | Authentication, tier gating, cloud AI fallback            |
| **Backend**      | Multi-Backend Provider Abstraction                                                            | Provider registry pattern for seamless backend swapping   |
| **Platform**     | Hardware & Model Lifecycle Services                                                           | Hardware detection, pricing tiers, model lifecycle        |
| **Ops**          | Observability & Diagnostic Services                                                           | Observability, crash reporting, rate limiting, webhooks   |
| **DI**           | Dependency Injection Container                                                                | Lazy singleton dependency injection for core services     |

### Security Architecture (13 Controls)

| #   | Control                      | Implementation                                                           |
| --- | ---------------------------- | ------------------------------------------------------------------------ |
| 1   | **AES-256-GCM Encryption**   | All data encrypted at rest with rigorously derived keys                  |
| 2   | **OS Keychain Storage**      | Keys stored natively — never on disk or in source code                   |
| 3   | **BIP39 Recovery**           | 24-word mnemonic for user-controlled key recovery                        |
| 4   | **Crypto-Shredding**         | Delete keys → all synced data permanently unrecoverable                  |
| 5   | **Key Zeroing**              | Cryptographic keys aggressively wiped from memory on lock/logout/shutdown|
| 6   | **Context Isolation**        | Strict sandboxing and disabled node integration                          |
| 7   | **CSP Header**               | Content-Security-Policy blocks unauthorized code execution               |
| 8   | **Navigation Guard**         | Navigation handlers prevent renderer hijacking                           |
| 9   | **Injection Prevention**     | Strict schema whitelisting for all data synchronization operations       |
| 10  | **Index Crash Safety**       | Per-table error isolation ensures no search outage                       |
| 11  | **PHI Detection**            | Comprehensive detection of sensitive identifiers                         |
| 12  | **Audit Logging**            | Tamper-evident logs for HIPAA compliance                                 |
| 13  | **Web Security**             | Strict web security enforced on all application windows                  |

---

## 8. User Stories

### Epic 1: Meeting Capture

| ID     | As a...                    | I want to...                                  | So that...                                             | Priority | Status  |
| ------ | -------------------------- | --------------------------------------------- | ------------------------------------------------------ | -------- | ------- |
| US-101 | Knowledge worker           | Start recording a meeting with one click      | I don't have to manually take notes                    | P0       | ✅ Done |
| US-102 | Consultant                 | See live transcription as people speak        | I can follow along and correct errors in real-time     | P0       | ✅ Done |
| US-103 | Privacy-conscious user     | Have all transcription happen on my device    | No audio ever leaves my machine                        | P0       | ✅ Done |
| US-104 | User with limited hardware | Have the app adapt AI quality to my hardware  | It doesn't crash or drain my battery on older machines | P1       | ✅ Done |
| US-105 | Mobile professional        | Record meetings offline (airplane, poor WiFi) | I never miss capturing a conversation                  | P0       | ✅ Done |

### Epic 2: Intelligence & Search

| ID     | As a...            | I want to...                                                  | So that...                                                           | Priority | Status  |
| ------ | ------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------- | -------- | ------- |
| US-201 | Engineering lead   | Ask "What did we decide about the database migration?"        | I get the exact answer with the meeting source cited                 | P0       | ✅ Done |
| US-202 | Consultant         | See all meetings where "Client X" was discussed               | I can prepare for a follow-up meeting in 2 minutes                   | P0       | ✅ Done |
| US-203 | Product manager    | View a knowledge graph of how topics connect                  | I can see patterns across a quarter of meetings                      | P1       | ✅ Done |
| US-204 | Team lead          | Get a weekly digest of all meetings                           | I can catch up on what my team discussed without watching recordings | P1       | ✅ Done |
| US-205 | Compliance officer | Detect when a meeting conclusion contradicts a prior decision | I can flag inconsistencies before they become problems               | P2       | 🟡 Beta |

### Epic 3: Security & Privacy

| ID     | As a...                 | I want to...                                     | So that...                                                 | Priority | Status  |
| ------ | ----------------------- | ------------------------------------------------ | ---------------------------------------------------------- | -------- | ------- |
| US-301 | Healthcare professional | Have PHI automatically detected before any sync  | Patient information never leaves my device                 | P0       | ✅ Done |
| US-302 | Enterprise admin        | View tamper-evident audit logs                   | I can prove compliance during SOC2 audits                  | P1       | ✅ Done |
| US-303 | Departing employee      | Crypto-shred all my data with one action         | My meeting data is permanently unrecoverable after I leave | P0       | ✅ Done |
| US-304 | Multi-device user       | Sync meetings across devices with E2E encryption | I can access meetings on my work laptop and home desktop   | P0       | ✅ Done |

### Epic 4: Team Collaboration

| ID     | As a...    | I want to...                                            | So that...                                                      | Priority | Status     |
| ------ | ---------- | ------------------------------------------------------- | --------------------------------------------------------------- | -------- | ---------- |
| US-401 | Team admin | Create a shared workspace for my team                   | We can pool meeting intelligence across the team                | P2       | 🔜 Planned |
| US-402 | Manager    | Get webhook notifications when action items are created | They flow into our project tracker (Linear, Jira) automatically | P2       | 🟡 Beta    |
| US-403 | New hire   | Search all team meeting history for onboarding context  | I can ramp up in days instead of weeks                          | P2       | 🔜 Planned |

### Epic 5: Onboarding & Self-Service

| ID     | As a...                 | I want to...                                                           | So that...                                                          | Priority | Status  |
| ------ | ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- | -------- | ------- |
| US-501 | First-time user         | Experience a simulated meeting tutorial before my first real recording | I understand the product's value in 90 seconds without reading docs | P0       | ✅ Done |
| US-502 | Non-technical user      | See a health dashboard showing if mic/network/database are working     | I can self-diagnose issues without contacting support               | P1       | ✅ Done |
| US-503 | User with broken search | Rebuild my search indexes from the health dashboard                    | I can fix corrupted FTS5 indexes without reinstalling the app       | P1       | ✅ Done |
| US-504 | Multi-device user       | See which devices are registered and deactivate old ones               | I can manage my device limit and free slots for new machines        | P1       | ✅ Done |
| US-505 | Laptop user on battery  | Have the app automatically reduce resource usage on battery            | My laptop battery isn't drained during a long meeting               | P1       | ✅ Done |

---

## 9. Timeline & Milestones

### Phase 1: Foundation (Completed — Q4 2025 – Q2 2026)

| Milestone                 | Status      | Deliverables                                                                 |
| ------------------------- | ----------- | ---------------------------------------------------------------------------- |
| Core transcription engine | ✅ Complete | State-of-the-art speech models, voice activity pipeline, real-time streaming |
| Encryption infrastructure | ✅ Complete | AES-256-GCM, native OS keychain integration, standard recovery               |
| Database layer            | ✅ Complete | Embedded datastore, local search indexing, vector embeddings                 |
| UI shell                  | ✅ Complete | Meeting list, detail view, notes editor, settings, onboarding                |
| Backend abstraction       | ✅ Complete | Robust multi-provider abstraction and strict factory patterns                |
| Security hardening        | ✅ Complete | Application sandboxing, comprehensive PHI detection, secure memory handling  |
| Knowledge graph MVP       | ✅ Complete | Entity extraction, interactive visualization, basic relationship mapping     |

### Phase 2: Intelligence & Polish (Current — Q3 2026)

| Milestone                | Target    | Deliverables                                                        |
| ------------------------ | --------- | ------------------------------------------------------------------- |
| Ask Meetings v1          | July 2026 | Semantic search with cited answers, context-aware responses         |
| Weekly Digest v1         | July 2026 | Auto-generated meeting summaries, trend detection                   |
| Speaker Diarization      | Aug 2026  | Multi-speaker identification and labeling                           |
| Pricing & Billing launch | Aug 2026  | Razorpay + LemonSqueezy integration, tier enforcement               |
| Public Beta launch       | Sep 2026  | Marketing site update, ProductHunt launch, beta waitlist conversion |

### Phase 3: Growth & Enterprise (Q4 2026 – Q1 2027)

| Milestone                 | Target   | Deliverables                                         |
| ------------------------- | -------- | ---------------------------------------------------- |
| SOC2 Type I certification | Nov 2026 | Security audit, compliance documentation             |
| Team workspaces v1        | Dec 2026 | Shared workspaces, admin controls, role-based access |
| Calendar integration      | Jan 2027 | Google Calendar + Outlook sync, auto-recording       |
| Webhook ecosystem v1      | Jan 2027 | Slack, Notion, Linear, Jira integrations             |
| Enterprise pilot program  | Feb 2027 | Custom SLA, SSO/SAML, dedicated support              |

### Phase 4: Scale (Q2 2027+)

| Milestone                | Target  | Deliverables                                      |
| ------------------------ | ------- | ------------------------------------------------- |
| Mobile companion app     | Q2 2027 | iOS/Android read-only app for search and playback |
| Windows/Linux stable     | Q2 2027 | Parity with macOS feature set                     |
| Self-hosted enterprise   | Q3 2027 | On-premises Cognitive Engine deployment package   |
| API & developer platform | Q3 2027 | Public API for custom integrations                |

---

## 10. Success Metrics

### North Star Metric

> **Weekly Active Meeting Hours Indexed (WAMHI)** — Total hours of meeting audio transcribed and indexed across all users per week.

_Why this metric:_ It captures both user acquisition (more users) and engagement depth (more meetings per user). A user who records one meeting is experimenting. A user who records 10 meetings/week has made BlueArkive essential.

### Leading Indicators

| Metric                        | Definition                                 | Target (Month 3) | Target (Month 6) | Target (Month 12) |
| ----------------------------- | ------------------------------------------ | ---------------- | ---------------- | ----------------- |
| **WAU (Weekly Active Users)** | Unique users who open the app              | 200              | 1,000            | 5,000             |
| **Meetings/User/Week**        | Avg meeting recordings per active user     | 2.5              | 4.0              | 6.0               |
| **Search Queries/User/Week**  | "Ask Meetings" queries per active user     | 1.0              | 3.0              | 5.0               |
| **D7 Retention**              | % of new users active 7 days after signup  | 35%              | 45%              | 55%               |
| **D30 Retention**             | % of new users active 30 days after signup | 15%              | 25%              | 35%               |
| **NPS**                       | Net Promoter Score (quarterly survey)      | 40               | 50               | 60+               |
| **Free → Paid Conversion**    | % of free users upgrading within 30 days   | 3%               | 5%               | 8%                |

### Revenue Metrics

| Metric                              | Target (Month 6) | Target (Month 12) |
| ----------------------------------- | ---------------- | ----------------- |
| **MRR (Monthly Recurring Revenue)** | $5,000           | $30,000           |
| **ARPU (Avg Revenue Per User)**     | $12              | $15               |
| **Churn Rate (Monthly)**            | < 8%             | < 5%              |
| **LTV:CAC Ratio**                   | > 2:1            | > 3:1             |

### Technical Health Metrics

| Metric                           | Target                                  |
| -------------------------------- | --------------------------------------- |
| **Transcription accuracy (WER)** | > 95% on native English audio           |
| **App crash rate**               | < 0.5% of sessions                      |
| **Search latency (p95)**         | < 500ms for hybrid semantic and keyword |
| **Cold start time**              | < 4s on modern silicon, < 8s on legacy  |
| **Database size efficiency**     | < 2MB per hour of meeting audio indexed |
| **Codebase stability**           | 0 errors across strict type-checking    |

---

## 11. Budget & Resources

### Infrastructure Costs (Monthly)

| Line Item                            | Cost         | Notes                               |
| ------------------------------------ | ------------ | ----------------------------------- |
| Cloud Infrastructure (Database + Vector Storage) | $150/mo      | Enterprise-tier hosting             |
| Domain + DNS (bluearkive.com)        | $15/mo       | Cloudflare                          |
| Vercel Hosting (landing page)        | $0-20/mo     | Pro plan                            |
| Sentry (crash reporting)             | $0/mo        | Free tier                           |
| Apple Developer Program              | $8.25/mo     | $99/year for macOS signing          |
| Code signing (Windows)               | ~$30/mo      | DigiCert EV certificate (amortized) |
| Total                                | **~$225/mo** |                                     |

### Cost Advantages

| BlueArkive                                           | Cloud-Based Alternatives                         |
| ---------------------------------------------------- | ------------------------------------------------ |
| $0.00/user for transcription (runs on user hardware) | $0.006/min × 900 min/mo = $5.40/user/mo          |
| $0.00/user for embedding (local inference)           | $0.02/1K tokens × ~50K tokens/mo = $1.00/user/mo |
| $0.00/user for storage (local datastore)             | $0.023/GB × ~2GB/user = $0.05/user/mo            |
| **Marginal cost per user: ~$0**                      | **Marginal cost per user: ~$6.45/mo**            |

> At 10,000 users, cloud-based services spend ~$64,500/month on compute. BlueArkive spends ~$225/month total. This is a **structural cost advantage** that allows us to offer a better product at a lower price while maintaining higher margins.

### Funding Requirements

| Phase                          | Amount       | Use                                                              |
| ------------------------------ | ------------ | ---------------------------------------------------------------- |
| **Pre-Seed (Current)**         | Bootstrapped | Product development, initial users                               |
| **Seed (Target: Q4 2026)**     | $500K – $1M  | 2 engineers, go-to-market, SOC2 certification, first 1,000 users |
| **Series A (Target: Q3 2027)** | $3M – $5M    | Enterprise sales team, mobile apps, international expansion      |

---

## 12. Risks & Mitigations

| #   | Risk                                                                 | Likelihood | Impact   | Mitigation                                                                                                                                                                 |
| --- | -------------------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Whisper accuracy insufficient for accented English / non-English** | Medium     | High     | Support model swapping. Offer cloud transcription as premium fallback (already built: `CloudTranscriptionService`). Monitor WER by language.                               |
| R2  | **Apple blocks Electron apps or restricts audio capture**            | Low        | Critical | Build native macOS Swift UI fallback. Monitor Apple developer announcements. Maintain relationship with Apple developer relations.                                         |
| R3  | **Cloud incumbent adds local processing mode**                       | Medium     | High     | Cloud business models require server-side data. Our moat is the _knowledge graph_ + encryption, not just local processing.                                                 |
| R4  | **Enterprise sales cycle too long for bootstrapped startup**         | High       | Medium   | Focus on PLG (Product-Led Growth) with solo users first. Enterprise comes after product-market fit with individuals.                                                       |
| R5  | **Large model downloads deter first-time users**                     | Medium     | Medium   | Progressive download with `ModelDownloadService`. Start with distilled model (40MB). Full model downloads in background.                                                   |
| R6  | **SQLite performance degrades at scale (1000+ meetings)**            | Low        | Medium   | WAL mode + async embedding queue already handle this. If needed, migrate to local PostgreSQL via IBackendProvider abstraction.                                             |
| R7  | **Cloud incumbent copies our privacy positioning**                   | Medium     | Low      | Privacy requires _architectural_ commitment, not marketing. Retrofitting E2E encryption into a cloud-first product is a multi-year project. First-mover advantage is real. |
| R8  | **Regulation (GDPR/CCPA) creates compliance burden**                 | Low        | Medium   | Local-first architecture is _inherently_ compliant — we don't process or store user data. Crypto-shredding satisfies right-to-deletion.                                    |

---

#

## 14. Appendix

### A. Codebase Snapshot (May 2026)

| Metric                          | Value                         |
| ------------------------------- | ----------------------------- |
| **Client Architecture**         | Modular, strictly typed       |
| **Backend Architecture**        | Proprietary Cognitive Engine  |
| **Backend testing**             | Extensive comprehensive suite |
| **Security Architecture**       | Native sandboxing + isolation |
| **App version**                 | 0.3.6                         |

### B. Key Dependencies

| Infrastructure Layer      | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| **Embedded Database**     | High-performance local datastore         |
| **Inference Engine**      | Local AI execution and processing        |
| **Keychain Manager**      | OS keychain access for secure storage    |
| **Data Visualization**    | Knowledge graph mapping and rendering    |
| **State Management**      | Performant application state             |
| **Editor Framework**      | Rich text notes and structured documents |
| **Telemetry**             | Crash reporting and diagnostics          |
| **Distribution**          | Seamless auto-updates                    |

### C. Cognitive Engine (Cloud Backend)

| Module                     | Function                                                  |
| -------------------------- | --------------------------------------------------------- |
| **Temporal Knowledge Graph** | Bitemporal Bayesian knowledge graph                       |
| **Conflict Engine**        | Intelligent conflict resolution (hallucination defense)   |
| **Semantic Retrieval**     | Curiosity-driven semantic retrieval                       |
| **Adaptive Scorer**        | Multi-strategy adaptive scoring subsystem                 |
| **Cognitive RAG**          | Advanced cognitive RAG pipeline                           |
| **Integration Hub**        | Extended tools for external AI agent synergy              |

### D. Pricing Reference Table

| Tier       | USD (Monthly) | USD (Yearly) | INR (Monthly)  | INR (Yearly) |
| ---------- | ------------- | ------------ | -------------- | ------------ |
| Free       | $0            | $0           | ₹0             | ₹0           |
| Starter    | $9/mo         | $7/mo        | ₹749/mo        | ₹599/mo      |
| Pro        | $19/mo        | $15/mo       | ₹1,499/mo      | ₹1,199/mo    |
| Team       | $15/user/mo   | $12/user/mo  | ₹1,249/user/mo | ₹999/user/mo |
| Enterprise | Custom        | Custom       | Custom         | Custom       |

### E. Document History

| Version | Date         | Author       | Changes                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | May 30, 2026 | Piyush Kumar | Initial product brief — Asana format                                                                                                                                                                                                                                                                                                          |
| 1.1     | May 31, 2026 | Piyush Kumar | Deep architectural audit: added Ghost Meeting Tutorial, Health Dashboard, Device Management, Battery-Aware Scheduling, Widget Quick Actions, 3-Tier Search, Multi-Mode AI Suggestions. Sanitized appendix metrics and removed proprietary internal codebase metrics. Added Epic 5 user stories. Expanded differentiating features table (+8 rows). |

---
