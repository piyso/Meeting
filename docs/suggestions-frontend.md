# PiyAPI Notes — Frontend Suggestions

> **Scope:** All renderer components, hooks, CSS, views, onboarding, keyboard shortcuts, micro-interactions, accessibility, and frontend testing. Verified against **76 components**, **14 hooks**, **23 CSS files**, and the Zen Glass design system.

---

## Table of Contents

1. [Frontend Maturity Audit](#1-frontend-maturity-audit)
2. [Critical Frontend Gaps](#2-critical-frontend-gaps)
3. [The Native Floating Widget](#3-the-native-floating-widget)
4. [Onboarding Re-architecture](#4-onboarding-re-architecture)
5. [Privacy Dashboard UI](#5-privacy-dashboard-ui)
6. [Cross-Meeting AI Chat Interface](#6-cross-meeting-ai-chat-interface)
7. [Recipes UI](#7-recipes-ui)
8. [Keyboard Shortcuts & Power User Flow](#8-keyboard-shortcuts--power-user-flow)
9. [Visual Polish & Zen Glass Design System](#9-visual-polish--zen-glass-design-system)
10. [Accessibility & Internationalization](#10-accessibility--internationalization)
11. [Frontend Testing](#11-frontend-testing)
12. [Frontend Execution Roadmap](#12-frontend-execution-roadmap)

---

## 1. Frontend Maturity Audit

### Renderer Hooks (14 total — all functional)

| Hook                   | Status | Notes                                   |
| :--------------------- | :----: | :-------------------------------------- |
| `useTranscriptStream`  |   ✅   | Real-time transcript streaming via IPC  |
| `useNotes`             |   ✅   | CRUD for meeting notes                  |
| `useMeetings`          |   ✅   | Meeting list with React Query           |
| `useCurrentMeeting`    |   ✅   | Single meeting fetch                    |
| `useSearch`            |   ✅   | FTS5 search integration                 |
| `useAudioStatus`       |   ✅   | Pipeline status polling                 |
| `useLLMStream`         |   ✅   | LLM streaming responses                 |
| `useKeyboardShortcuts` |   ✅   | 7 bindings (2 Phase 2 stubs)            |
| `useSilentPrompter`    |   ✅   | 2-min interval, Ollama integration      |
| `useSyncEngine`        |   ✅   | 5-second polling, online/offline events |
| `useDigest`            |   ✅   | Post-meeting digest fetch               |
| `usePowerMode`         |   ✅   | Electron `powerMonitor` via IPC         |
| `useAudioSession`      |   ✅   | Audio session management                |
| `useToast`             |   ✅   | Toast notification hook                 |

### Zustand Store (`appStore.ts` — 89 lines)

States: `activeView`, `selectedMeetingId`, `isAuthenticated`, `recordingState`, `activeMeetingId`, `audioMode`, `isOnline`, `syncStatus`, `lastSyncTimestamp`, `focusMode`, `commandPaletteOpen`, `globalContextOpen`, `toasts`.

### CSS Architecture — Zen Glass Design System

`index.css` (300 lines): Geist font, 38 CSS custom properties, glass morphism with noise overlay, spring/fluid/snappy easing curves, skeleton shimmer, staggered entrance choreography, window blur state, GPU promotion, drag regions. + 22 component CSS files.

### Testing — Zero Renderer Tests

24 backend test files exist. **Zero renderer component tests across 76 components.**

---

## 2. Critical Frontend Gaps

### 2.1 PostMeetingDigest Receives No Real Data

**Files:** `PostMeetingDigest.tsx` (136 lines), `MeetingDetailView.tsx`
**Problem:** Beautiful tabbed UI (Summary/Actions/Pinned) with MD/PDF/JSON export exists — but `MeetingDetailView` only passes `meetingId`, `duration`, `participantCount`. The `summary`, `decisions`, `actionItems`, and `pinnedMoments` props are **never populated**.
**Fix:** When `recordingState` transitions to `processing`, call `digest.handlers.ts` via IPC, then pass results as props.

### 2.2 SettingsView Is a 10-Line Shell

**File:** `SettingsView.tsx` — only a wrapper.
**Impact:** No privacy dashboard, no device management UI, no quota display. Backend services all exist but have zero rendered UI.

### 2.3 ErrorBoundary Doesn't Report to CrashReporter

**Files:** `ErrorBoundary.tsx` (58 lines)
**Problem:** `componentDidCatch` only calls `console.error`. Never sends errors via IPC to `CrashReporter.ts`. Renderer crashes are invisible.
**Fix:** Add `crash:report` IPC call inside `componentDidCatch`.

### 2.4 SilentPrompter Misuses `note.expand`

**File:** `useSilentPrompter.ts` (line 33)
**Problem:** Calls `window.electronAPI.note.expand()` for meeting suggestions — semantically wrong and incorrectly consumes Starter quota.
**Fix:** Use a dedicated `intelligence:meetingSuggestion` IPC handler.

### 2.5 Keyboard Shortcuts Have Phase 2 Stubs

**File:** `useKeyboardShortcuts.ts` (61 lines)
**Problem:** `Cmd+Shift+K` (semantic search) and `Cmd+Shift+M` (MiniWidget toggle) are empty stubs.

### 2.6 No `lastSyncTimestamp` Persistence

**File:** `appStore.ts`
**Problem:** `lastSyncTimestamp` resets to `null` on every app restart.
**Fix:** Persist to SQLite's `settings` table via `settings.handlers.ts`.

### 2.7 DynamicIsland Ignores Processing State

**File:** `DynamicIsland.tsx` (95 lines)
**Problem:** During `recordingState === 'processing'`, shows nothing (same as idle).
**Fix:** Add `"✨ Generating digest..."` with pulse animation.

### 2.8 MiniWidget Is an In-App Overlay

**File:** `MiniWidget.tsx` (69 lines)
**Problem:** Uses `position: fixed` inside main BrowserWindow. Disappears when app is minimized.
**Fix:** Separate native BrowserWindow (see §3).

### 2.9 GhostMeeting Is Visual-Only

**File:** `GhostMeetingTutorial.tsx` (86 lines)
**Problem:** 4 hardcoded mock segments. Static `<p>` for notes. Can't press `Cmd+Enter`.
**Fix:** Real Tiptap editor with pre-baked AI response via `setTimeout`.

---

## 3. The Native Floating Widget

**#1 UX priority.** Users have Zoom/Teams fullscreen. Widget must float above everything.

### Architecture

```
Main Process:
  mainWindow (BrowserWindow) → AppLayout → MeetingDetailView
  widgetWindow (NEW BrowserWindow) → widget-index.html → WidgetApp.tsx
  AudioPipelineService → emits transcript events to BOTH windows
```

### BrowserWindow Config

```typescript
const widgetWindow = new BrowserWindow({
  width: 280,
  height: 72,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  type: 'panel',
  hasShadow: true,
  skipTaskbar: true,
  resizable: false,
  movable: true,
  webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
})
widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
```

### Two States

```
MINI (280×72)                     EXPANDED (280×400)
┌──────────────────────────┐      ┌──────────────────────────┐
│ 🔴 01:23:45   ⏸  ■  ⬜ │      │ 🔴 01:23:45   ⏸  ■  ⬜ │
│ Alex: We need to final...│      ├──────────────────────────┤
└──────────────────────────┘      │ Alex: We should cut 10%  │
                                  │ Sarah: But Q4 looks good │
                                  │ ┌────────────────────┐   │
                                  │ │ Quick note...      │   │
                                  │ └────────────────────┘   │
                                  ├──────────────────────────┤
                                  │ 📝 Save    🔖 Pin       │
                                  └──────────────────────────┘
```

### Files to Create

- `src/renderer/widget/WidgetApp.tsx` — widget renderer entry
- `widget-index.html` — separate HTML entry for widget window
- Widget CSS (minimal — inherits from `index.css` tokens)

---

## 4. Onboarding Re-architecture

### Current Flow (Too Much Friction)

```
auth → setup (model download) → recovery-key → plan-selection → ghost-meeting
```

### Proposed "Aha-First" Flow

```
auth/skip → ghost-meeting → model-download (background) → recovery-key → plan-selection (deferred)
```

**Changes to `OnboardingFlow.tsx`:**

1. Add "Try Without Account" button on auth screen
2. Move `GhostMeetingTutorial` to step 2
3. Replace static `TutorialNotePane` with real Tiptap editor + pre-baked `Cmd+Enter` AI response
4. Start model download in background during ghost meeting — show corner progress
5. Defer plan selection until user hits a premium feature

**North Star Metric:** `time_from_first_launch_to_first_transcript_segment` → Target: **< 30 seconds**

---

## 5. Privacy Dashboard UI

Build a "Trust & Security" tab in `SettingsView`:

```
┌────────────────────────────────────────┐
│  🛡️ Trust & Security                  │
├────────────────────────────────────────┤
│  ✅ Audio processed on-device          │
│  ✅ Notes encrypted (AES-256-GCM)      │
│  ✅ PBKDF2 (100,000 iterations)        │
│  ✅ PHI auto-redaction: active         │
│                                        │
│  📊 Data Locality Report              │
│  Local meetings: 47 · 12.3 MB         │
│  Synced (encrypted): 23 meetings      │
│  Data sent to 3rd parties: 0 bytes    │
│                                        │
│  🖥️ Devices (1 of 2 allowed)          │
│  ● MacBook Pro (this device)           │
│  ○ MacBook Air — Last sync: 2h ago    │
│                                        │
│  📈 AI Quota: 23/50 cloud queries     │
│  Resets: Mar 1, 2026                   │
└────────────────────────────────────────┘
```

**Backend APIs ready:** `DeviceManager.getDevices()`, `CloudAccessManager.getFeatureAccess()`, `QueryQuotaManager.checkQuota()`.

### DynamicIsland Processing Badge

| State              | Badge          |
| :----------------- | :------------- |
| Free tier, offline | `🔒 Local`     |
| Pro tier, online   | `🔒 Encrypted` |
| Pro tier, offline  | `📴 Queued`    |
| Processing digest  | `✨ Analyzing` |

---

## 6. Cross-Meeting AI Chat Interface

**#1 missing feature vs. Granola.** Build a conversational panel:

- "What did Alex say about the budget across all Q4 meetings?"
- "Find every contradicting decision in the last 30 days"

### UI Design

- Slide-in panel from right (like `globalContextOpen` in appStore)
- Chat input at bottom, AI responses above with transcript source citations
- Toggle via `Cmd+Shift+C` or Command Palette
- Results link back to specific meetings/timestamps

---

## 7. Recipes UI

### In PostMeetingDigest

Add a "Run Recipe" dropdown next to the MD/PDF/JSON export buttons:

- Shows list of available recipes (PRD Generator, Sales Scorecard, etc.)
- On click → sends transcript + recipe prompt to Ollama via IPC
- Result appears in a new "Recipe Output" tab in the digest view

### Recipe Manager in Settings

- List all built-in and custom recipes
- "Create Custom Recipe" with prompt template editor
- Free tier: 3 built-in only. Starter+: all built-in. Pro+: custom recipes.

---

## 8. Keyboard Shortcuts & Power User Flow

### Currently Implemented

| Shortcut      | Action             | Status  |
| :------------ | :----------------- | :-----: |
| `Cmd+K`       | Command Palette    |   ✅    |
| `Cmd+N`       | New Meeting Dialog |   ✅    |
| `Cmd+Shift+F` | Focus Mode         |   ✅    |
| `Cmd+\`       | Toggle split pane  |   ✅    |
| `Cmd+J`       | Toggle notes pane  |   ✅    |
| `Cmd+Enter`   | AI Note Expansion  |   ✅    |
| `Cmd+Shift+K` | Semantic Search    | ⚠️ Stub |
| `Cmd+Shift+M` | MiniWidget Toggle  | ⚠️ Stub |

### To Add

| Shortcut      | Action                        |
| :------------ | :---------------------------- |
| `Cmd+Shift+R` | Start/Stop Recording          |
| `Cmd+Shift+P` | Pin current transcript moment |
| `Cmd+Shift+E` | Quick Export as Markdown      |
| `Cmd+Shift+C` | Open Cross-Meeting Chat       |

### Command Palette Enhancements

Add searchable commands: "Start Recording", "Generate Digest Now", "Run Recipe…", "Open Privacy Dashboard", "Switch to Local Mode", "View Devices", "Export Diagnostics".

---

## 9. Visual Polish & Zen Glass Design System

### Color Tokens (Already Defined in `index.css`)

- **Root:** `#030303` (near-black)
- **Glass:** `rgba(255,255,255,0.02)` → `0.05` on hover
- **Emerald:** `#34d399` — success, recording states
- **Amber:** `#fbbf24` — warnings, PHI alerts, quota
- **Violet:** `#a78bfa` — AI expansions, entity chips, glow
- **Rose:** `#fb7185` — errors, destructive actions
- **Smart Chips:** Persons `#93c5fd`, Dates `#6ee7b7`, Amounts `#fcd34d`, Actions `#fda4af`

### Premium Effects (Already Implemented ✅)

- Glass morphism: `backdrop-filter: blur(24px) saturate(120%)`
- Film grain noise overlay
- Spring easing: `cubic-bezier(0.175, 0.885, 0.32, 1.1)`
- Staggered entrance choreography (40ms per child)
- Window blur desaturation state
- GPU promotion with `contain: layout style paint`

### Micro-Interactions to Add

| Element                    | Enhancement                                                 |
| :------------------------- | :---------------------------------------------------------- |
| New transcript segment     | `translateY(10px) → 0` with spring curve                    |
| AI expansion               | Typewriter effect (40ms/char) with violet left-border pulse |
| Recording dot              | Custom breathing: `scale(1→1.3→1)` over 2s                  |
| PostMeetingDigest sections | Staggered slide-in (150ms delay)                            |
| Widget expand              | `setBounds(animate: true)` for native macOS resize          |
| Mode transitions           | 300ms crossfade: recording → processing → idle              |

### The "Breathing App" Pattern

Idle = **calm**: subdued colors, slow noise texture. Recording = **alive**: pulsing indicators, emerald dot breathing, real-time transcript flow. This emotional shift creates product attachment.

---

## 10. Accessibility & Internationalization

### 10.1 Zero Accessibility Infrastructure

No ARIA labels, no keyboard focus management, no screen reader support.

**Fix priorities:**

1. `aria-label` on all interactive elements in `DynamicIsland.tsx`, `MeetingCard.tsx`, `CommandPalette.tsx`
2. `role="alert"` on toast notifications
3. Keyboard focus trap in dialogs (`NewMeetingDialog`, `CommandPalette`)
4. `aria-live="polite"` on `TranscriptPanel` for screen reader announcements
5. VoiceOver testing (macOS built-in)

### 10.2 UI Localization (i18n)

- Extract all strings to `locales/` directory using `react-i18next`
- Priority languages: Hindi, Spanish, Japanese, German, French

---

## 11. Frontend Testing

### Zero Renderer Tests — Fix This

Add **Vitest + React Testing Library**. Priority targets:

| Component           | What to Test                                     |
| :------------------ | :----------------------------------------------- |
| `PostMeetingDigest` | Tab switching, export buttons, prop rendering    |
| `TranscriptPanel`   | Virtualized list, auto-scroll, segment rendering |
| `DynamicIsland`     | Recording/idle/processing state transitions      |
| `OnboardingFlow`    | Step navigation, completion, skip functionality  |
| `CommandPalette`    | Search filtering, keyboard navigation            |
| `MeetingCard`       | Date display, context menu, click handler        |
| `ErrorBoundary`     | Error catching, retry button, fallback rendering |

---

## 12. Frontend Execution Roadmap

### Phase A: Critical Fixes (Days 1-5)

| #   | Task                                  | Files                           |
| :-- | :------------------------------------ | :------------------------------ |
| A1  | Wire PostMeetingDigest with real data | `MeetingDetailView.tsx`         |
| A2  | Build Privacy Dashboard tab           | New component in `SettingsView` |
| A3  | Fix `useSilentPrompter` IPC call      | `useSilentPrompter.ts`          |
| A4  | Wire `Cmd+Shift+K` and `Cmd+Shift+M`  | `useKeyboardShortcuts.ts`       |
| A5  | ErrorBoundary → CrashReporter IPC     | `ErrorBoundary.tsx`             |
| A6  | Persist `lastSyncTimestamp`           | `appStore.ts`                   |
| A7  | DynamicIsland processing indicator    | `DynamicIsland.tsx`             |

### Phase B: Widget + Onboarding (Days 6-10)

| #   | Task                                                   |
| :-- | :----------------------------------------------------- |
| B1  | Create `WidgetApp.tsx` + `widget-index.html`           |
| B2  | Widget expand/collapse with `setBounds(animate: true)` |
| B3  | Quick Note input in expanded widget                    |
| B4  | Reorder onboarding flow (Aha-First)                    |
| B5  | Make Ghost Meeting interactive (real Tiptap)           |

### Phase C: Competitive Features (Days 11-16)

| #   | Task                                                      |
| :-- | :-------------------------------------------------------- |
| C1  | Cross-Meeting AI Chat panel                               |
| C2  | Recipe UI (PostMeetingDigest dropdown + Settings manager) |
| C3  | Micro-interaction animations                              |
| C4  | Contradiction alert toasts                                |

### Phase D: Hardening (Days 17-22)

| #   | Task                                                |
| :-- | :-------------------------------------------------- |
| D1  | Add renderer tests (Vitest + RTL)                   |
| D2  | Accessibility (ARIA labels, focus traps, VoiceOver) |
| D3  | Transcript 500-segment cap                          |
| D4  | i18n infrastructure (react-i18next)                 |

---

> **Frontend bottom line:** The component architecture is solid. The remaining work is: **(1) wiring existing components to real data** (PostMeetingDigest, SettingsView, DynamicIsland processing), **(2) building new competitive features** (Cross-Meeting Chat, Recipes, native Widget), and **(3) quality layer** (tests, accessibility, i18n).
