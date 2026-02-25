# PiyAPI Notes — Frontend Architectural Blueprint
## The Definitive UI/UX Specification

> **Document Status:** Final · Based on exhaustive analysis of `piytes.md` (2945 lines), `ipc.ts` (732 lines), `database.ts` (219 lines), 17 existing renderer components, `electron/main.ts`, and competitive research (Granola, Otter.ai, Fireflies).

---

# PART 1: STRATEGIC CONTEXT

## 1.1 What Exists Today (Codebase Audit)

### Electron Shell (`electron/main.ts`)
- **Window:** 1200×800 default, 800×600 minimum. No `titleBarStyle` set (native OS chrome).
- **Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`.
- **Lifecycle:** Services init → IPC setup → Window creation. Graceful cleanup on quit.

### Renderer (`src/renderer/`)
- **Entry:** `main.tsx` → `App.tsx` (placeholder welcome card with feature list).
- **Styles:** `index.css` (40 lines, basic Inter font + light/dark media query), `App.css` (131 lines, gradient background).
- **Components (17 files, 100% audio/permission focused):**

| Component | Lines | Purpose | Reusable? |
|-----------|-------|---------|-----------|
| `PermissionRequestFlow.tsx` | 289 | Multi-state macOS Screen Recording permission wizard | ✅ Keep |
| `PermissionRequestFlow.css` | 608 | Full light/dark mode styles with animations | ✅ Keep |
| `ScreenRecordingPermissionDialog.tsx` | 153 | Denied-state dialog with fallback options | ✅ Keep |
| `AudioCaptureWithPermissions.tsx` | 200 | Orchestrates permission → capture flow | ✅ Integrate |
| `AudioTestUI.tsx` | 329 | Pre-flight audio test with level meter | ✅ Keep |
| `SystemAudioTest.tsx` | ~350 | System audio capture verification | ✅ Keep |
| `AudioSetup.tsx` | 152 | Stereo Mix detection + dialog trigger | ✅ Keep |
| `AudioFallbackNotification.tsx` | ~80 | Toast when falling back to microphone | ✅ Adapt |
| `StereoMixErrorDialog.tsx` | ~150 | Windows Stereo Mix guidance | ✅ Keep |
| `PermissionFlowDemo.tsx` | ~200 | Demo wrapper for permission flow | ❌ Dev-only |
| `Settings.tsx` | 74 | Skeleton settings page (Audio + 3 placeholder sections) | 🔄 Expand |
| `Settings.css` | ~50 | Basic settings styles | 🔄 Restyle |
| Various `.css` files | ~600 | Styles for above components | ✅ Keep |

- **Audio Pipeline:** `audioCapture.ts` (421 lines) — `AudioCaptureManager` singleton with macOS ScreenCaptureKit + Windows desktopCapturer + AudioWorklet pipeline at 16kHz.

### IPC Contract (`src/types/ipc.ts` — 732 lines)
**12 service groups** exposed via `window.electronAPI`:

| Group | Methods | Status |
|-------|---------|--------|
| `meeting` | `start`, `stop`, `get`, `list`, `update`, `delete`, `export` | ✅ Functional |
| `audio` | `listDevices`, `startCapture`, `stopCapture`, `getStatus`, `preFlightTest`, permissions | ✅ Functional |
| `note` | `create`, `get`, `list`, `update`, `delete`, `augment` | ⏳ Stubbed |
| `transcript` | `getSegments`, `search`, `updateSpeaker` | ⏳ Stubbed |
| `search` | `fullText`, `semantic`, `hybrid` | ⏳ Stubbed |
| `intelligence` | `expandNote`, `extractEntities`, `summarize`, `askQuestion` | ⏳ Stubbed |
| `settings` | `get`, `update`, `reset` | ⏳ Stubbed |
| `sync` | `start`, `stop`, `getStatus`, `forceSync` | ⏳ Stubbed |
| `graph` | `get`, `traverse`, `getStats` | ⏳ Stubbed |
| `digest` | `generate`, `getLatest`, `getHistory` | ⏳ Stubbed |
| `shell` | `openExternal` | ✅ Functional |
| Event streams | `transcriptChunk`, `llmToken`, `syncEvent`, `audioEvent`, `error` | ✅ Wired |

### Database Entities (`src/types/database.ts`)
6 core types: `Meeting`, `Transcript`, `Note`, `Entity` (with `EntityType` enum), `SyncQueueItem`, `EncryptionKey`.

### Local Embedding Service (NEW — From piytes.md Audit #1)
A lightweight `all-MiniLM-L6-v2` model (ONNX, 25MB) runs in the main process to generate 384-dimensional vector embeddings locally. This is critical for two reasons:
1. **Encrypted Sync Paradox:** When sync is enabled, content is AES-256-GCM encrypted before upload. The PiyAPI cloud server **cannot** generate embeddings from ciphertext. The client must generate unencrypted embeddings locally and send them alongside the encrypted payload with `skip_server_embedding: true`.
2. **Local Semantic Search:** Powers the `Cmd+Shift+K` Global Context Recovery feature and the RAG pipeline for `Ctrl+Enter` note expansion context, all 100% offline.

---

## 1.2 What Competitors Do (UX Benchmarking)

### Granola (Primary Competitor — $10/mo)
- **Layout:** Single-pane note editor. Transcript runs silently in background — user only sees their own notes + AI expansion.
- **Core UX:** User types shorthand → AI fills in context from transcript. "Human-AI collaborative notes."
- **Weakness:** Cloud-only (no offline), no entity extraction, no knowledge graph, no cross-meeting search.

### Otter.ai ($17/mo)
- **Layout:** Left sidebar (meeting list) + center pane (live transcript with speaker labels) + right pane (action items).
- **Core UX:** Full automatic transcription. User is passive — reads transcript after meeting.
- **Weakness:** Cloud-only, data privacy concerns, no local processing.

### Our Differentiation (from `piytes.md`)
1. **Split-pane** (transcript top, notes bottom) — user sees both simultaneously.
2. **Ctrl+Enter "Magic"** — brief note → AI-expanded sentence using transcript context.
3. **100% local processing** — works offline, zero cloud dependency for core features.
4. **Smart Chips** — entities (people, dates, amounts, actions) rendered as interactive colored chips in transcript.
5. **Knowledge Graph** — cross-meeting relationships, contradiction detection.

---

# PART 2: DESIGN SYSTEM — SOVEREIGN UI (ZEN GLASS)

## 2.1 The "Zen Glass" UX Philosophy
The application adheres to the **Sovereign Zen Glass** design language. The goal is a highly premium, distraction-free environment that feels like a physical piece of etched crystal on the user's screen. It relies on absolute blacks, multi-layered Gaussian blurs, ultra-subtle monochromatic noise grain, fluid spring animations, and typography-driven visual hierarchy. It feels undeniably expensive.

**Core UX Performance Principles:**
- **Perceived Speed > Actual Speed:** The UI must *feel* instant. Every navigation action shows immediate visual feedback (<50ms) even if data arrives later. Optimistic UI updates, skeleton shimmer, and progressive data loading are mandatory — never a blank screen.
- **Cognitive Load Reduction:** No more than 3 visual layers competing for attention at any time. The void black background is not decoration — it is active negative space that lets the brain breathe.
- **Motion as Information:** Animations are not decorative. Every transition communicates spatial relationships ("where did I come from, where am I going"). Staggered reveals tell the user that data is streaming in, not dumped.

## 2.2 Color Architecture (Deep & Calm)

```css
/* ── Base Surfaces (Infinite Depth) ── */
--color-bg-root:         #030303;   /* Void Black — absolute background for a calmer feel */
--color-bg-panel:        rgba(15, 15, 17, 0.6); /* Deep translucent panels */
--color-bg-glass:        rgba(255, 255, 255, 0.02); /* Glassmorphic cards */
--color-bg-glass-hover:  rgba(255, 255, 255, 0.05);

/* ── Borders & Lights ── */
--color-border-inset:    rgba(255, 255, 255, 0.04); /* Inner highlights mimicking glass reflections */
--color-border-subtle:   rgba(255, 255, 255, 0.08); /* Card outlines */
--color-glow-violet:     rgba(139, 92, 246, 0.15);  /* Ambient AI glow */

/* ── Text Hierarchy (High Contrast) ── */
--color-text-primary:    #FFFFFF;   /* Headings, active semantic states */
--color-text-secondary:  #A1A1AA;   /* Body text, deactivated items */
--color-text-tertiary:   #52525B;   /* Metadata, minor UI elements */

/* ── Semantic Accents (Desaturated & Elegant) ── */
--color-emerald:         #34D399;   /* Success, Recording Active (Calmer green) */
--color-amber:           #FBBF24;   /* Warnings, Mic Fallback */
--color-violet:          #A78BFA;   /* Brand, AI "Magic" Expansion */
--color-rose:            #FB7185;   /* Errors, Destructive actions */

/* ── Premium Smart Chip Entities ── */
--chip-person-bg:        rgba(96, 165, 250, 0.08);
--chip-person-text:      #93C5FD;
--chip-date-bg:          rgba(52, 211, 153, 0.08);
--chip-date-text:        #6EE7B7;
--chip-amount-bg:        rgba(251, 191, 36, 0.08);
--chip-amount-text:      #FCD34D;
--chip-action-bg:        rgba(251, 113, 133, 0.08);
--chip-action-text:      #FDA4AF;
```

## 2.3 Premium Typography

```css
/* Fonts: Geist or Inter for an ultra-modern, crisp tech aesthetic */
--font-heading:    'Geist', 'Inter', system-ui, sans-serif;
--font-body:       'Geist', 'Inter', system-ui, sans-serif;
--font-mono:       'Geist Mono', 'JetBrains Mono', monospace;

/* Scale (Fluid & Harmonious) */
--text-xs:    0.75rem;    /* 12px — chip labels, metadata */
--text-sm:    0.875rem;   /* 14px — sidebar items, secondary */
--text-base:  1rem;       /* 16px — active transcript */
--text-lg:    1.125rem;   /* 18px — card titles */
--text-xl:    1.5rem;     /* 24px — view headers */
--text-2xl:   2rem;       /* 32px — hero text */

/* Tracking Constraints */
--tracking-tight: -0.02em; /* Gives headings a high-end, editorial feel */
--tracking-wide:   0.05em; /* Used for tiny all-caps metadata */
```

**Font Loading Strategy (Zero FOIT):**
Fonts MUST be bundled locally with the Electron app, NOT fetched from Google CDN. Load them via `@font-face` with `font-display: block` combined with a `<link rel="preload">` in the HTML entry point. This guarantees the first frame renders with the correct typeface — no flash of unstyled text (FOUT) or invisible text (FOIT) that screams "web app."

## 2.4 Spacing, Radius, & Native Geometry

A "clean app" requires mathematically precise spatial harmony. We strictly enforce a **4px baseline grid** for internal component padding, and an **8px grid** for structural layouts.

```css
/* Structural Spacing (8px Grid) */
--space-8:  8px;   /* Tight element gap */
--space-16: 16px;  /* Standard container flow */
--space-24: 24px;  /* Section breaks */
--space-32: 32px;  /* Major page segments */
--space-64: 64px;  /* Void areas */

/* Component Internal Flow (4px Grid) */
--space-4:  4px;   /* Icon to text distance */
--space-12: 12px;  /* Medium button padding */
--space-20: 20px;

/* ── Native Component Heights (CRITICAL for OS feel) ── */
/* Web apps feel "clunky" because components are randomly sized. Native apps are exact. */
--h-sm: 24px;  /* Badges, tiny toggles */
--h-md: 32px;  /* Standard macOS control height (Inputs, secondary buttons) */
--h-lg: 40px;  /* Primary CTA buttons */
--h-xl: 48px;  /* The Zen Rail icons, Floating Island */

/* Radii (Squircle math) */
--radius-sm:  6px;   /* Inner elements (Chips, small buttons) */
--radius-md:  10px;  /* Standard inputs/cards */
--radius-lg:  16px;  /* Floating panels, Zen Rail */
--radius-full: 9999px; /* Pills (Dynamic Island), Avatars */
```

## 2.5 Advanced Motion & Physics

Standard `ease-out` is not premium enough. We use Apple-style spring physics transitions using custom cubic-beziers to create "weight" and "fluidity". There are no jarring snapping effects.

```css
/* ── Timing Functions ── */
--ease-spring:       cubic-bezier(0.175, 0.885, 0.32, 1.1); /* Bouncy enter */
--ease-fluid:        cubic-bezier(0.16, 1, 0.3, 1);         /* Silky smooth */
--ease-snappy:       cubic-bezier(0.4, 0, 0.2, 1);          /* Quick UI state */

--transition-fast:   150ms var(--ease-snappy);
--transition-base:   300ms var(--ease-fluid);
--transition-slow:   500ms var(--ease-fluid);

/* Premium Interactions */
/* Hover states don't just change color; they lift slightly and cast a subtle glow */
.premium-hover {
  transition: transform var(--transition-base), box-shadow var(--transition-base);
  will-change: transform; /* Promote to GPU layer for zero-jank hover */
}
.premium-hover:hover {
  transform: translateY(-1px) scale(1.01);
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5), 
              0 0 0 1px var(--color-border-subtle),
              0 0 12px var(--color-glow-violet); /* Ambient AI glow on hover */
}

/* ── Staggered Entrance Choreography ── */
/* Lists (meeting cards, search results, transcript segments on initial load) 
   use staggered fade-in-ups so content feels like it's streaming in, not dumped. */
@keyframes stagger-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stagger-child {
  animation: stagger-in 300ms var(--ease-fluid) both;
}
/* JS applies: style="animation-delay: ${index * 40}ms" per child. Max 12 items staggered, rest appear instant. */
```

## 2.6 The Premium Glass Texture Formula & Effects

Every elevated surface (cards, dialogs, sidebar) uses this multi-layer glassmorphism technique to mimic real frosted glass. 

**CRITICAL PERFORMANCE RULE:** Heavy CSS blurs (`backdrop-filter: blur(24px)`) are GPU destroyers if overused. We strictly limit the number of active blurs on screen to **three** (e.g., ZenRail, DynamicIsland, and one active Dialog). We never animate the `blur` radius itself.

```css
.surface-glass-premium {
  /* 1. Base translucent fill */
  background: linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.03) 0%,
    rgba(255, 255, 255, 0.01) 100%
  );
  
  /* 2. Heavy backdrop blur for frosted physical depth */
  backdrop-filter: blur(24px) saturate(120%);
  -webkit-backdrop-filter: blur(24px) saturate(120%);
  
  /* 3. Outer border + Inner highlight to mimic physical glass edges */
  box-shadow: 
    0 4px 24px -1px rgba(0, 0, 0, 0.4),          /* Deep drop shadow */
    0 1px 0 0 rgba(255, 255, 255, 0.1) inset,   /* Top inner rim light */
    0 0 0 1px rgba(255, 255, 255, 0.05);        /* Subtle outer stroke */
    
  border-radius: var(--radius-xl);
  
  /* Hardware acceleration trigger (essential for blurs) */
  transform: translateZ(0); 
}

/* 4. Film Grain Noise Overlay (Essential for the 'Premium' feel) */
.with-noise::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url('data:image/svg+xml,...'); /* SVG Noise */
  opacity: 0.03; /* Extremely subtle */
  mix-blend-mode: overlay;
  pointer-events: none;
  border-radius: inherit;
}
```

## 2.7 Native Scrollbars & Window Focus States

A premium desktop app must manage its window lifecycle visually. It also strictly forbids standard, chunky web browser scrollbars. This application is **Dark Mode Only** by design to reinforce its identity as a focused, calm tool.

```css
/* ── Overlay Scrollbars (macOS Native Feel) ── */
::-webkit-scrollbar {
  width: 8px; /* Slightly thicker than typical, but fully overlaid */
  height: 8px;
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* ── Window Blur (Lost Focus) State ── */
/* When the OS window loses focus, colors drop back to reduce visual noise */
.window-blurred {
  --color-bg-panel: rgba(15, 15, 17, 0.3);
  --color-border-subtle: rgba(255, 255, 255, 0.03);
  --color-glow-violet: transparent; /* Disable the AI glow when not active */
}
.window-blurred .surface-glass-premium {
  backdrop-filter: blur(12px) saturate(100%); /* Reduce expensive blur passes */
}
```

---

# PART 3: APPLICATION ARCHITECTURE

## 3.1 Window Configuration

The Electron `BrowserWindow` must be updated to support a custom title bar:

```typescript
// electron/main.ts — BrowserWindow config changes needed
mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  titleBarStyle: 'hiddenInset',  // ADD: macOS hidden title bar with inset traffic lights
  trafficLightPosition: { x: 16, y: 12 }, // ADD: position traffic lights
  frame: process.platform === 'darwin' ? true : false, // ADD: frameless on Windows
  // ... existing webPreferences unchanged
})
```

## 3.2 Spatial Layout & Navigation (The "Zen" Arrangement)

We discard the traditional, heavy persistence of a left sidebar. Instead, we use a spatial, layered arrangement that maximizes breathing room and focus.

1. **The Core Canvas:** The absolute background (`--color-bg-root`) is the void canvas.
2. **The Zen Rail (Global Nav):** A floating, blurred glass rail on the far left, decoupled from the top and bottom edges. It holds primary destinations (Home, Search, Settings) as minimalist icons.
3. **The Floating Command Center (Cmd+K):** A centralized, spotlight-style glass search bar that overlays the screen. This is the primary way power users navigate between specific meetings and global actions.
4. **The Dynamic Island (Header):** The title bar is hidden/frameless. Window controls (traffic lights on macOS) float directly on the canvas. The header controls (Sync, Recording Status, Stop) live in a floating, pill-shaped "Dynamic Island" at the top center.

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔴 🟡 🟢            [ ● REC 00:45 | ⏹ Stop ]           🟢 Sync │
│                                                                 │
│ ┌───┐  ┌──────────────────────────────────────────────────────┐ │
│ │ 📝│  │                                                      │ │
│ │   │  │   <MeetingDetailView /> or <MeetingListView />       │ │
│ │ 🔍│  │                                                      │ │
│ │   │  │   (This central pane takes up 90% of the window)     │ │
│ │ ⚙️│  │                                                      │ │
│ └───┘  └──────────────────────────────────────────────────────┘ │
│  Zen                                                            │
│  Rail                                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Focus Mode:** Clicking "Focus" or hitting `Cmd+Shift+F` slides the Zen Rail smoothly off-screen, expanding the central pane edge-to-edge for pure, distraction-free note-taking.

## 3.3 State Management (Zustand)

To guarantee 60FPS rendering and zero dropped frames during expensive DOM operations (like transcript auto-scrolling), we use **Zustand** instead of React Context. This enforces **Atomic State Updates**, meaning `ZenRail` and `DynamicIsland` will absolutely never re-render when the transcript updates.

```typescript
// src/renderer/store/appStore.ts
import { create } from 'zustand';

interface AppState {
  // Navigation
  activeView: 'meeting-list' | 'meeting-detail' | 'settings'; // Search is overlay
  selectedMeetingId: string | null;

  // Recording
  recordingState: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing';
  activeMeetingId: string | null;
  audioMode: 'system' | 'microphone' | 'none';

  // Connectivity
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncTimestamp: number | null;

  // UI State
  focusMode: boolean; // Hides ZenRail
  commandPaletteOpen: boolean; // Cmd+K
  toasts: Toast[];

  // Actions
  navigate: (view: AppState['activeView'], meetingId?: string) => void;
  setRecordingState: (state: AppState['recordingState'], mode?: AppState['audioMode']) => void;
  toggleFocusMode: () => void;
  toggleCommandPalette: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  // Implementation...
}));
```

**Why Zustand over Context:**
- **Zero Provider Wrapping:** Components subscribe specifically avoiding high-level tree re-renders. Component logic: `const activeView = useAppStore(s => s.activeView)`.
- **Bundle size:** Tiny (< 1KB).
- **Simplicity:** No complex `useReducer` dispatches.

## 3.4 Resilience (Error Boundaries & Loading)

For a premium feel, the app must handle latency and completely crash gracefully.
- `<ErrorBoundary />`: A global boundary at the `App.tsx` level, plus local boundary wrappers around `<TranscriptPanel>` and `<MeetingList>`. If SQLite throws an error on a specific component, only that component shows an amber warning box; the rest of the UI continues functioning.
- **Skeleton Shimmer Vectors:** We never show blocking spinners. If `useMeetings()` is loading, we render highly-polished CSS shimmer effect vectors in the exact geometry of `<MeetingCard />`. The UI structure holds fast, while the glass textures simulate data flowing in.

---

# PART 4: VIEWS & NAVIGATION FLOW

## 4.1 Meeting List View (The Spatial Grid)

**Visual:** Instead of a dense, enterprise table, meetings are presented as beautiful, floating physical cards on the void background.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    [ + Start New Meeting (Cmd+N) ]  ← Floating Glass Pill   │
│                                                             │
│    Today                                                    │
│    ┌────────────────────┐  ┌────────────────────┐          │
│    │ Q3 Budget Review   │  │ Design Sprint      │          │
│    │ 45 min · 4 people  │  │ 32 min · 2 people  │          │
│    └────────────────────┘  └────────────────────┘          │
```

- **Arrangement:** Cards are staggered in a fluid grid with generous padding (`--space-6`). Each card uses `.stagger-child` for choreographed entrance when the list first mounts.
- **Hover Physics:** Hovering (`.premium-hover`) lifts the card slightly, casting a subtle deep shadow and a delicate edge highlight, inviting interaction.
- **Hover Prefetch:** When a user hovers over a card for >200ms, the app silently fires `useQueryClient().prefetchQuery(['meeting', meetingId])` so that clicking through to the detail view shows data **instantly** — zero loading delay. This is the single most impactful perceived-speed trick.
- **Fluid Navigation:** Clicking a card physically expands it into the `<MeetingDetailView />` using a shared-element transition (the card gracefully morphs into the main detail pane rather than flashing white).

### Meeting Creation Flow (The "Start" Dialog)
Clicking "Start New Meeting" opens a minimal glass dialog:

| Field | Behavior |
|-------|----------|
| **Title** | Optional. If left blank, after ~60 seconds of transcript, the local LLM auto-suggests a title (e.g., "Q3 Budget Review with Sarah"). It appears as ghost-text; pressing `Enter` or clicking confirms it. |
| **Template** | Optional dropdown: `Blank`, `1:1`, `Standup`, `Client Call`, `Brainstorm`. Selecting a template pre-populates the Note Editor with starter bullets (e.g., "Standup" → _Yesterday / Today / Blockers_). |
| **Context Documents** | Optional drag-and-drop zone. User can attach 1–3 reference files (.pdf, .md, .txt). These are fed to the LLM during `Ctrl+Enter` expansion, enabling cross-referencing (e.g., "This contradicts the Q3 target in the attached Roadmap"). |

## 4.2 Meeting Detail View (The Dual-Pane Sanctuary)

This is where the magic happens. A meticulously balanced top/bottom split-pane that provides essential context without cognitive overload.

```
┌─────────────────────────────────────────────────────────────┐
│                                                 [⛶ Focus Mode]│
│                                                             │
│  LIVE TRANSCRIPT                                            │
│                                                             │
│  [00:12] Sarah:                                             │
│    We need to discuss the [Q3 budget] cuts.                 │
│                              └── 📊 AmountChip              │
│                                                             │
│  [01:22] ▌ (transcribing...)                                │
│                                                             │
├═════════════════ (Glowing Glass Divider) ═══════════════════┤
│                                                             │
│  YOUR NOTES                                      Ctrl+Enter │
│                                                             │
│  • Budget cuts                                              │
│    → Client requested 10% reduction in Q3 spending          │
│      due to deteriorating market conditions. (AI expanded)  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### UX & Arrangement Architecture (Deep Thought)

| Concept | Execution | Rationale for Premium Feel |
|---------|-----------|----------------------------|
| **The Divider** | A 1px subtle glowing line with an invisible 16px draggable hit area. No thick grey bars. | Avoids harsh visual breaks; maintains the illusion that the transcript and notes exist on a single, continuous sheet of physical glass. |
| **Reading Flow Alignment** | The transcript auto-scrolls at the top. The notes editor grows downwards at the bottom. | This arrangement anchors the user's eye to the lower-middle half of the screen. They can track live speech and type notes with minimum saccadic eye movement. |
| **Action Isolation** | High-level controls (Stop recording, Edit title) are pulled out of the content area and placed into the top Dynamic Island. | Keeps the text canvas sacred, completely clean, and focused solely on the content. |
| **Smart Chip Rhythm** | Entity chips are visually recessed (lower opacity background) until hovered, at which point they vividly illuminate. | Prevents the transcript from looking like a chaotic, overwhelming Christmas tree of colors. It reveals complex intelligence only to the user who asks for it. |
| **Focus State** | The `Cmd+Shift+F` trigger instantly collapses the Zen Rail and dynamically centers and expands the editor. | Gives power-users the ultimate command over their environment, physically morphing the app from a multi-tool to a singular writing instrument. |

### Transcript Panel (`<TranscriptPanel />`)
- Renders a `<TranscriptSegment />` for each segment.
- **Speaker Diarization Colors:** Each unique speaker is auto-assigned a color from a fixed palette (violet, teal, amber, rose, sky, lime). A small 8px colored dot appears left of each segment, creating instant visual lanes so users can scan "what did Sarah say?" without reading every word. Speaker names are editable (click to rename "Speaker 1" → "Sarah").
- **Pinned Moments:** A subtle ⭐ icon appears on hover to the right of each segment. Clicking pins that moment. Pinned moments aggregate into a dedicated "Key Moments" tab in the Post-Meeting Digest for instant review.
- **Transcript Corrections:** Post-meeting, clicking on any finalized transcript text makes it inline-editable. Edits save back to SQLite via `electronAPI.transcript.update()`. A tiny "edited" badge appears on corrected segments so the user knows which parts they've manually verified.
- Auto-scrolls to bottom. **Scroll lock physics:** If the user scrolls up, auto-scroll pauses intuitively with a haptic-style visual "bounce." A translucent "↓ Jump to latest" FAB smoothly fades in at the bottom right.
- **Audio Playback Timeline (Past Meetings):** When reviewing a completed meeting, a **Speaker Heatmap** timeline appears at the top of the transcript. Instead of a plain single-color waveform, the scrubber is divided into color-coded patches matching each speaker's diarization color (e.g., teal for Sarah, rose for John). This lets users visually scan the 2-hour timeline, instantly recognize "Sarah gave a 20-minute solo presentation here," and click to jump to that exact moment. The current playback position pulses with `--color-violet`.
- **Memory Management (Critical for 2+ Hour Meetings):** When segment count exceeds **500**, older segments beyond the visible viewport are pruned from React state but remain queryable from SQLite via `electronAPI.transcript.getSegments({ offset, limit })`. The user scrolling upward triggers lazy re-hydration of pruned segments. This caps the in-memory segment array at ~500 items maximum, preventing the renderer process from exceeding 200MB RAM.
- **Segment Memoization:** Every `<TranscriptSegment />` MUST be wrapped in `React.memo()` with a shallow comparison on `segment.id`. Once a segment is finalized (not the active streaming one), it will never re-render. Only the final "live" segment re-renders as new tokens stream in.

### Note Editor (`<NoteEditor />`)
- **Engine:** Tiptap (`@tiptap/react`).
- **Schema Constraints:** The `<NoteEditor>` strictly allows only: Paragraphs, Bullet Lists, Bold, Italic, Blockquotes, and the custom `<MagicExpansion />` node. 
- **Auto-Save Strategy (Crucial):** Triggers `electronAPI.note.update()` debounced by **1500ms** after the last keystroke to prevent IPC bridge flooding. A `useEffect` cleanup immediately flushes any pending save upon component unmount to guarantee zero data loss.
- **Default format:** Bullet list, promoting fast, shorthand capture during live meetings.
- **The Magic (`Ctrl+Enter`):** Captures exactly the current bullet. A high-end `<NoteExpansionLoader />` (smoothly pulsing violet dots) appears inline. The expanded text morphs into place below the original, styled in italic `--color-violet`, making the AI's contribution distinct yet harmonious.
- **AI Undo (Trust Mechanism):** Every `<MagicExpansion />` node has a subtle `✕ Reject` ghost button that appears on hover. Clicking it collapses the expansion back to the original bullet, restoring user control. This builds absolute trust — the AI is always a suggestion, never a mandate.
- **Tiptap Transaction Atomicity (CRITICAL):** The entire AI expansion (which may be 5–10 lines of generated text) MUST be committed to Tiptap as a **single ProseMirror `Transaction`**. If the AI text is appended node-by-node, pressing `Ctrl+Z` would undo it one letter or one line at a time — catastrophically annoying. By wrapping the insertion in `editor.chain().focus().insertContent(expandedContent).run()` within a single transaction, `Ctrl+Z` instantly collapses the entire AI block to the original bullet in one keystroke.
- **AI Trust Badges:** All AI-generated text in the editor displays a subtle 🤖 badge inline. Human-written text has no badge (or an optional ✍️ badge on hover). This makes it immediately scannable which content came from the AI and which the user typed themselves.
- **Yjs CRDT for Multi-Device Sync (piytes.md Audit #6):** When sync is enabled, notes edited in Tiptap use **Yjs** for character-level CRDT merging. Instead of syncing the full note JSON (which breaks under concurrent edits via last-write-wins), we sync Yjs binary updates. This guarantees zero data loss when editing the same note on two devices offline. Dependencies: `yjs`, `y-indexeddb`, `@tiptap/extension-collaboration`.

### The Symbiosis (Transcript ↔ Notes Interactivity)
The dual panes are not isolated; they interact physically and conceptually:
| Interaction | Behavior | UX Value |
|-------------|----------|----------|
| **Drag & Drop** | Dragging a transcript segment into the Note Editor instantly creates a heavily styled blockquote containing the exact quote and a linked timestamp. | Frictionless exact-quote capture. |
| **Bidirectional Anchors** | When `Ctrl+Enter` expands a note, it tags the note with the IDs of the transcript segments it used as context. Clicking the 🤖-badged AI note highlights the source segments in the top pane with a violet pulse. | Builds absolute trust in the AI by providing instant source attribution. Users can verify every AI claim against the original spoken words. |
| **Click-to-Play** | Clicking any timestamp (in the transcript OR attached to a note quote) instantly jumps the `<AudioIndicator />` playback (if reviewing a past meeting) to that exact millisecond. | Contextual recall is instant. |
| **Slash Commands** | Typing `/` in the editor brings up a localized command floating menu (e.g., `/action`, `/decision`, `/summarize-last-5m`). | Power-user speed without leaving the keyboard. |

## 4.3 Meeting Header Bar

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back  │  Q3 Budget Review (editable)  │  ● REC 00:45:12  │ ⏹ Stop │
└──────────────────────────────────────────────────────────────┘
```

- **Back button:** Returns to Meeting List.
- **Title:** Editable inline. Calls `meeting.update({ meetingId, updates: { title } })`.
- **Recording indicator:** Emerald pulsing dot + elapsed time (from `audioEvent` stream).
- **Stop button:** Red button, calls `meeting.stop()` + `audio.stopCapture()`.

## 4.4 The Final Output State (Post-Meeting)

The moment the user clicks **Stop**, the application aggressively shifts from "Capture Mode" to "Output Mode". The UI layout physically transitions to prioritize synthesis and export.

```
┌──────────────────────────────────────────────────────────────┐
│  TRANSCRIPT (scrollable)  │  POST-MEETING DIGEST              │
│  ...                      │                                   │
│  ...                      │  [ Summary ] [ Actions ] [ ⭐ ]   │
│  ...                      │                                   │
├═══════════════════════════┤  Executive Summary:               │
│  YOUR NOTES               │  "Q3 budget cut by 10%..."        │
│  ...                      │                                   │
│  ...                      │  Action Items:                    │
│                           │  ☐ Follow up on budget → Sarah    │
│                           │  ☐ Schedule Q4 review  → John     │
│                           │                                   │
│                           │  Key Decisions:                   │
│                           │  • Budget cut by 10%              │
│                           │                                   │
│                           │  Pinned Moments: (3)              │
│                           │  ⭐ [00:12] "We need to cut..."   │
│                           │                                   │
│                           │  [ Export ▾ ] [ Push Actions ]    │
└──────────────────────────────────────────────────────────────┘
```

- **The Shift:** The right third of the screen slides in, introducing the `<PostMeetingDigest />` component.
- **Automated Synthesis:** The local AI automatically processes the final transcript + user notes, extracting:
  - **Executive Summary** (3 sentences max)
  - **Action Items** with auto-detected assignees (parsed from transcript speaker names)
  - **Key Decisions** with confidence scores
  - **Pinned Moments** (user-starred segments aggregated here)
- **Action Item Lifecycle:** Each action item has a "Push" button that creates a native OS reminder (macOS Reminders / Windows To Do) with a deep-link `piyapi://meeting/123#segment-456` back to the exact transcript moment.
- **The "Export" Button:** A prominent dropdown:
  - `Copy as Markdown` — Perfect for Obsidian/Notion.
  - `Export as PDF` — For formal distribution.
  - `Copy as Slack Message` — Bold headers, bullet points, @mentions parsed from speakers.
  - `Copy for Email` — Clean HTML with proper formatting.
  - `Copy raw Transcript` — Unformatted text.

## 4.4.1 The Silent AI Prompter (Live Coaching — During Recording)

If the user selected a structured meeting template (e.g., "Sales Discovery"), the `DynamicIsland` becomes an active live coach.

| Behavior | UX |
|----------|----|
| The template defines **required discussion topics** (e.g., for Sales: Budget, Authority, Need, Timeline). | |
| The AI monitors the live transcript stream for topic coverage. | |
| If 30+ minutes pass and "Budget" hasn't been discussed, the Dynamic Island pulses softly with ghost text: _"Consider asking about the allocated budget."_ | |
| The suggestion fades after 10 seconds or is dismissed with a click. | |
| **Privacy:** All processing is local. No data leaves the machine. | |

This shifts PiyAPI from a **passive recorder** (capturing what happened) to an **active performance enhancer** (helping conduct better meetings in real-time).

## 4.4.2 Mini Floating Widget Mode (`Cmd+Shift+M`)

During a live meeting, users need PiyAPI visible alongside Zoom/Meet without consuming screen space.

```
┌─────────────────────────────┐
│ ● REC 00:45:12      [ ⏹ ]  │
│ Sarah: "...budget cuts..."  │
└─────────────────────────────┘
```

- **Size:** 280×72px, always-on-top, glassmorphic pill.
- **Content:** Recording timer, Stop button, last 1 transcript line.
- **Interaction:** Click anywhere on the pill to restore the full window.
- **Implementation:** Electron `BrowserWindow` with `alwaysOnTop: true`, `transparent: true`, `frame: false`.

## 4.5 The Floating Command Center (Cmd+K)

**Trigger:** `Cmd+K`, `Ctrl+K`, or Zenith Rail "Search" icon.

The Command Center is an immersive, spotlight-style glass overlay positioned at the exact center of the screen with a severe blur backdrop. It completely drops the user into high-speed navigation.

```
┌─────────────────────────────────────────────────────────────┐
│ (Heavy Backdrop Blur)                                       │
│                                                             │
│       ┌───────────────────────────────────────────────┐     │
│       │ 🔍 Search meetings, transcripts, notes...     │     │
│       ├───────────────────────────────────────────────┤     │
│       │ ACTIONS                                       │     │
│       │  ● Start New Meeting                      ↵   │     │
│       │  ⚙️ Open Settings                         ↵   │     │
│       │                                               │     │
│       │ MEETINGS (12)                                 │     │
│       │  Design Sprint · "...budget cuts in Q3..."    │     │
│       │  Weekly Sync  · "Timeline shifted to May"     │     │
│       └───────────────────────────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Data source:** `electronAPI.search.fullText({ query, limit: 10 })` + static actions.
- Results update live as user types.
- **Interaction:** fully traversable via Arrow Up/Down and Enter keys. Mouse not required.

## 4.6 Settings View

Expand the existing `Settings.tsx` skeleton to match the `piytes.md` §3.4 specification:

| Section | Controls | Status |
|---------|----------|--------|
| **Recording** | Microphone selector (dropdown from `audio.listDevices()`), Auto-start toggle, Save audio toggle | ✅ Build now |
| **Transcription** | Language selector, Show confidence toggle, Real-time delay selector | ⏳ Coming soon |
| **Intelligence** | Auto-expand toggle, Expansion style selector, Include timestamps toggle | ⏳ Coming soon |
| **Sync & Privacy** | Auto-sync toggle, Data location selector, Encryption status (always on) | ⏳ Coming soon |
| **Storage** | Local/cloud usage bars, Clear old meetings button | ✅ Build now (local only) |
| **Account** | Device count, Add device, GDPR export, Delete account | ⏳ Coming soon |

**Design principle:** "Settings should only contain choices users need to make. Everything else is automatic." — `piytes.md` §3.4.

## 4.7 Global Context Recovery (`Cmd+Shift+K`)

The ultimate power feature. A system-level Spotlight bar accessible even when PiyAPI is minimized.

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 "What did Sarah say about the marketing budget?"       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  "Sarah mentioned a 10% budget reduction in Q3 due to      │
│   market conditions. She recommended shifting the           │
│   remaining allocation to digital campaigns."               │
│                                                             │
│  Sources:                                                   │
│  📋 Q3 Budget Review — Feb 18, 00:12:34                    │
│  📋 Marketing Sync — Feb 15, 00:45:12                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Query:** Natural language question typed by the user.
- **Engine:** A 3-stage RAG (Retrieval-Augmented Generation) pipeline designed to respect local LLM context window limits:

| Stage | What Happens | Why |
|-------|-------------|-----|
| **1. Vectorize Query** | The user's question is converted into a 384-dimensional vector using a local embedding model (e.g., `all-MiniLM-L6-v2`). | Transforms free-text into a searchable numeric representation. |
| **2. Retrieve Top-K Chunks** | The vector is queried against `sqlite-vec` (or FAISS) to retrieve the **top 5 most relevant** transcript chunks across all meetings. BM25 keyword search runs in parallel for hybrid scoring. | This is the critical constraint: local LLMs (Qwen 2.5 3B) have 8k–32k token context windows. Feeding 50 meetings' worth of raw text would OOM or hallucinate. Retrieving only 5 chunks (~2000 tokens) keeps the LLM fast and accurate. |
| **3. Synthesize Answer** | The 5 retrieved chunks + the original question are passed to Qwen as a structured prompt. The LLM generates a 2–3 sentence answer citing the source meetings. | Focused context = accurate answer in ~1–2 seconds. |

- **Output:** A 2–3 sentence synthesized answer with deep-links to exact timestamps in the source meetings.
- **Privacy:** 100% local. Embeddings, vector store, and LLM all run on-device. No data ever leaves the machine.
- **Why this is the moat:** It turns the user's entire meeting history into a private, offline knowledge engine. No competitor offers this.
- **Query Quota Fallback (piytes.md Audit #22):** When the user has a Pro/Cloud account, `Cmd+Shift+K` routes through the PiyAPI cloud RAG for cross-meeting search with GPT-4o-mini synthesis. Cloud users have a monthly quota (e.g., 50 queries on Starter). When the quota is exhausted, the system **silently falls back** to the local Qwen pipeline described above — with reduced accuracy but zero downtime. The `<GlobalContextBar />` shows remaining quota as a subtle counter: `"4 cloud queries left this month"`. After 0, the badge changes to `"Local mode"` with no error or interruption.

## 4.8 Progressive Onboarding (First-Run Experience)

First-time users must not face a blank void screen. The app simulates a "Ghost Meeting":

1. A pre-recorded 30-second sample transcript streams in the top pane (showing how live transcription looks).
2. Pre-populated sample notes appear in the bottom pane with a pulsing `Ctrl+Enter` prompt.
3. Clicking `Ctrl+Enter` triggers a real AI expansion demonstration.
4. Tooltip overlays point to the Zen Rail, Dynamic Island, and Command Palette with glass-styled callouts.
5. After completion, the ghost meeting auto-clears and the user sees the real empty Meeting List.

This guarantees the user understands the core loop (Capture → Expand → Export) before their first real meeting.

---

# PART 5: COMPONENTS — THE MACRO TO MICRO

## 5.1 Native Component Geometry (Primitives)

To ensure this feels like a high-end desktop app and not a webpage, all primitive components are strictly constrained to `--h-md` (32px) or `--h-lg` (40px) heights. No component is allowed to "grow" arbitrarily based on its text content.

| Component | Standardized Height | Padding System | Physics |
|-----------|--------------------|----------------|---------|
| `<Button />` | `h-md` (32px) / `h-lg` (40px) | `px-12` | `.premium-hover` active shadow |
| `<IconButton />` | `32x32px` or `24x24px` | perfect center | Icon scales up 1.1x on hover |
| `<Input />` | `h-md` (32px) | `px-12` | `--color-violet` 1px glow on focus |
| `<Toggle />` | `h-sm` (24px) track | 20px thumb | Spring animation for thumb |
| `<Badge />` | `h-sm` (24px) | `px-8` | Static. |
| `<SmartChip/>` | `h-sm` (24px) inline | `px-6` | Expands slightly on hover |
| `<Dialog />` | fluid width/height | `p-24` | `slide-up` + global backdrop blur |
| `<ContextMenu />` | min-w 160px | `py-4` | Appears directly at click coords |

## 5.2 Domain Components (New)

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `<MeetingCard />` | Floating card with meeting preview | `meeting: Meeting`, `isActive: boolean` |
| `<MeetingSkeleton/>`| Shimmer vector for loading lists | — |
| `<TranscriptSegment />` | One spoken segment with speaker color, pin, and edit | `segment: Transcript`, `entities: Entity[]`, `speakerColor: string` |
| `<NoteExpansionLoader />` | Pulsing dots during AI expansion | — |
| `<MagicExpansion />` | AI-expanded note with source anchors and reject button | `originalText`, `expandedText`, `sourceSegmentIds: string[]` |
| `<AudioIndicator />` | Pulsing waveform during recording | `isActive: boolean`, `audioLevel: number` (MUST use OffscreenCanvas) |
| `<AudioTimeline />` | Waveform scrubber for past meeting playback | `meetingId: string`, `duration: number` |
| `<RecordingTimer />` | `00:00:00` elapsed time display | `startTime: number` (Runs on requestAnimationFrame) |
| `<PostMeetingDigest />`| Synthesized Actions/Decisions/Summary pane | `meetingId: string` |
| `<SilentPrompter />` | Ghost-text coaching suggestions in DynamicIsland | `template: MeetingTemplate`, `coveredTopics: string[]` |
| `<MiniWidget />` | Always-on-top floating pill during recording | `isRecording`, `elapsed`, `lastSegment` |
| `<CommandPalette />`| Center overlay search & actions | `isOpen: boolean`, `onClose` |
| `<GlobalContextBar />`| System-level Spotlight for cross-meeting Q&A | `isOpen: boolean` |
| `<SyncStatusIndicator />` | Dot + label in Island | `status: 'idle' | 'syncing' | 'error'` |
| `<EmptyState />` | Beautiful zero-data screens | `icon`, `title`, `description` |
| `<GhostMeetingTutorial />` | First-run onboarding simulation | — |
| `<OfflineBanner />` | Subtle top/bottom warning line | `isOnline: boolean` |

## 5.3 Existing Components to Integrate

These 17 components are **production-quality** and must be preserved:

- **Permission flow:** `PermissionRequestFlow` → triggered before first system audio capture on macOS.
- **Audio test:** `AudioTestUI` + `SystemAudioTest` → embedded in Settings view (already wired).
- **Audio capture:** `AudioCaptureWithPermissions` → orchestrates the permission → fallback → capture flow. This becomes the core of the "Start Meeting" action.
- **Fallback notification:** `AudioFallbackNotification` → adapt into the Toast system.
- **Platform dialogs:** `StereoMixErrorDialog` (Windows), `ScreenRecordingPermissionDialog` (macOS) → triggered contextually.

---

# PART 6: HOOKS & DATA LAYER

## 6.1 Custom Hooks

```typescript
// ── Data Fetching (Powered by @tanstack/react-query) ──

function useMeetings(params?: ListMeetingsParams) {
  // Must implement Infinite Queries or Cursor Pagination for large meeting lists (e.g. 1000+ meetings)
  // to avoid sending giant serialized JSON arrays over the IPC bridge and dropping frames.
  // Returns: useInfiniteQuery wrapper around electronAPI.meeting.list({ limit: 50, cursor })
}

function useCurrentMeeting(meetingId: string | null) {
  // Returns: useQuery wrapper around electronAPI.meeting.get(meetingId)
}

function useNotes(meetingId: string | null) {
  // Returns: useQuery wrapper around electronAPI.note.list(meetingId)
  // Mutations use useMutation and carefully orchestrate optimistic updates or cache invalidation.
}

// ── Real-time Streams (Memory Leak Prevention) ──

function useTranscriptStream(meetingId: string | null) {
  // Subscribes to electronAPI.on.transcriptChunk()
  // Maintains local segment array via useState
  // CRITICAL: The useEffect MUST return a cleanup function calling `electronAPI.off()` 
  // to prevent duplicated listeners and memory leaks when jumping between meetings.
  // Returns { segments, isStreaming, latestSegment }
  // Handles: auto-scroll logic, segment deduplication
}

function useLLMStream() {
  // Subscribes to electronAPI.on.llmToken()
  // CRITICAL: Requires strict listener cleanup on unmount.
  // Accumulates tokens into a string
  // Returns { partialText, isGenerating, reset }
}

function useAudioStatus(meetingId: string | null) {
  // Subscribes to electronAPI.on.audioEvent()
  // Returns { isCapturing, audioLevel, captureMode, duration }
}

// ── Audio Management ──

function useAudioSession() {
  // Wraps the full lifecycle:
  //   1. Check platform (darwin/win32)
  //   2. Check permissions (macOS screen recording)
  //   3. Start capture with fallback chain
  //   4. Monitor audio events
  //   5. Stop capture
  // Returns { start, stop, status, mode, showPermissionFlow }
}

// ── UI ──

function useToast() {
  // Returns { addToast, removeToast, toasts }
  // Auto-dismiss after 5 seconds
}

function useKeyboardShortcuts() {
  // Registers global shortcuts:
  //   Cmd+K / Ctrl+K → open search
  //   Cmd+N / Ctrl+N → new meeting
  //   Ctrl+Enter → expand note (handled by Tiptap extension)
}
```

## 6.2 Stubbed API Strategy

For APIs marked ⏳ Stubbed in the IPC contract:

1. **Hooks call the IPC method normally** — it will return `{ success: true, data: null }` or a stub response.
2. **If `data` is null/empty**, the UI shows the component's `<EmptyState />` variant with a "Coming soon" message.
3. **No mock data.** We don't fabricate fake meetings or transcripts. The UI must be testable with real data from the functional `meeting` API.
4. **Exception:** The `useTranscriptStream` hook will work with the real `transcriptChunk` event stream once the audio pipeline is connected. Before that, the transcript panel shows `<EmptyState icon="microphone" title="No transcript yet" description="Start a recording to see the live transcript" />`.

---

# PART 7: FILE STRUCTURE

```
src/renderer/
├── main.tsx                          # Entry point
├── App.tsx                           # Root: ErrorBoundary + Layouts + Toast
├── index.css                         # Full "Zen Glass" design system variables
├── audioCapture.ts                   # ✅ Keep (existing audio pipeline)
│
├── store/
│   └── appStore.ts                    # Global state: Zustand
│
├── hooks/
│   ├── useMeetings.ts
│   ├── useCurrentMeeting.ts
│   ├── useNotes.ts
│   ├── useTranscriptStream.ts
│   ├── useLLMStream.ts
│   ├── useAudioStatus.ts
│   ├── useAudioSession.ts
│   ├── usePowerMode.ts              # 🆕 Battery-aware AI scheduling
│   ├── useQueryQuota.ts             # 🆕 Cloud query quota tracking + fallback
│   ├── useToast.ts
│   └── useKeyboardShortcuts.ts
│
├── components/
│   ├── ui/                           # Design system primitives
│   │   ├── Button.tsx
│   │   ├── IconButton.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Toggle.tsx
│   │   ├── Badge.tsx
│   │   ├── Tooltip.tsx
│   │   ├── Dialog.tsx
│   │   ├── ContextMenu.tsx
│   │   ├── Toast.tsx
│   │   ├── EmptyState.tsx
│   │   ├── Skeletons.tsx              # Loading geometries
│   │   └── SplitPane.tsx
│   │
│   ├── layout/                       # App shell
│   │   ├── DynamicIsland.tsx          # Floating header controls
│   │   ├── ZenRail.tsx                # Floating left navbar
│   │   ├── AppLayout.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── OfflineBanner.tsx
│   │
│   ├── meeting/                      # Meeting-specific
│   │   ├── MeetingCard.tsx
│   │   ├── TranscriptPanel.tsx
│   │   ├── TranscriptSegment.tsx
│   │   ├── SmartChip.tsx
│   │   ├── NoteEditor.tsx
│   │   ├── NoteExpansionLoader.tsx
│   │   ├── MagicExpansion.tsx          # 🆕 AI-expanded node with trust badge + reject
│   │   ├── PostMeetingDigest.tsx       # 🆕 Summary/Actions/Decisions pane
│   │   ├── SpeakerHeatmap.tsx          # 🆕 Color-coded audio timeline scrubber
│   │   ├── AudioIndicator.tsx
│   │   ├── RecordingTimer.tsx
│   │   ├── MiniWidget.tsx              # 🆕 Always-on-top floating pill
│   │   ├── SilentPrompter.tsx          # 🆕 Live coaching ghost-text
│   │   └── NewMeetingDialog.tsx
│   │
│   ├── command/
│   │   ├── CommandPalette.tsx         # Cmd+K Overlay
│   │   └── GlobalContextBar.tsx      # 🆕 Cmd+Shift+K cross-meeting Q&A
│   │
│   ├── audio/                        # ✅ EXISTING — keep all 17 files
│   │   └── ... (AudioTestUI, PermissionRequestFlow, etc.)
│   │
│   └── settings/
│       └── SettingsView.tsx
│
└── views/                            # Top-level view wrappers
    ├── MeetingListView.tsx
    ├── MeetingDetailView.tsx
    └── SettingsView.tsx               # (Search is now an overlay)
```

**Total new files: ~40** (components + hooks + context + styles).
**Existing files preserved: 17** (all audio components) + `audioCapture.ts` + `main.tsx`.
**Files to modify: 3** (`App.tsx`, `index.css`, move `Settings.tsx` → `components/settings/`).
**Files to delete: 1** (`App.css` — replaced by design system).

---

# PART 8: IMPLEMENTATION SEQUENCE

### Phase A: Design System Foundation (Day 1)
1. Replace `index.css` with the full CSS variable system from Part 2.
2. Initialize Zustand `appStore.ts`.
3. Create `Button.tsx`, `Input.tsx`, `Badge.tsx`, `EmptyState.tsx`, `Skeletons.tsx` primitives.

### Phase B: App Shell (Day 2)
4. Build `DynamicIsland.tsx` (custom frameless bar with drag region).
5. Build `ZenRail.tsx` (navigation icons).
6. Build `AppLayout.tsx` (Rail + main area).
7. Build global `<ErrorBoundary>`.
8. Rewrite `App.tsx` stringing together Layouts and Providers.

### Phase C: Meeting List View (Day 3)
9. Create `useMeetings` hook.
10. Build `MeetingCard.tsx` + Context Menu.
11. Build `MeetingListView.tsx` with date-grouped card grid + Skeleton loader.
12. Build `NewMeetingDialog.tsx` using new Dialog primitive.
13. Wire "Start Meeting" → `meeting.start()` → navigate to detail view.

### Phase D: Meeting Detail — Transcript (Day 4)
14. Build `SplitPane.tsx` (resizable horizontal divider).
15. Create `useTranscriptStream` hook.
16. Build `TranscriptSegment.tsx` with timestamp + speaker + text.
17. Build `TranscriptPanel.tsx` with auto-scroll + scroll lock.
18. Build `SmartChip.tsx` for entity rendering.

### Phase E: Meeting Detail — Notes + Audio (Day 5)
19. Install Tiptap: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-bullet-list`, `@tiptap/extension-collaboration`.
20. Install Yjs: `yjs`, `y-indexeddb`.
21. Build `NoteEditor.tsx` with Ctrl+Enter expansion trigger + Yjs CRDT layer.
22. Build `NoteExpansionLoader.tsx` (pulsing violet dots).
23. Build `MagicExpansion.tsx` (AI trust badge + reject button + source anchors).
24. Create `useLLMStream` hook.
25. Create `usePowerMode` hook (battery-aware AI scheduling via `electron.powerMonitor`).
26. Move legacy `MeetingHeader.tsx` capabilities into the `DynamicIsland.tsx`.
27. Build `AudioIndicator.tsx` and `RecordingTimer.tsx`.
28. Integrate existing `AudioCaptureWithPermissions` into the recording start flow.

### Phase F: Secondary Views (Day 6)
26. Build `CommandPalette.tsx` handling `Cmd+K`.
27. Expand `SettingsView.tsx` with all 6 sections from spec.
28. Build `OfflineBanner.tsx`.
29. Build `Toast.tsx` + `useToast` hook.

### Phase G: Polish & Verification (Day 7)
31. Wire the "Stop Meeting" flow: `audio.stopCapture()` → `meeting.stop()` → update UI.
32. Test meeting CRUD: create → list → view → update title → delete.
33. Test audio permission flows on macOS.
34. Verify TypeScript: `npx tsc --noEmit`.
35. Verify build: `npm run dev` + `npm run electron:dev`.
36. Walk through every screen for visual consistency.

---

# PART 9: CRITICAL CONSTRAINTS

## 9.1 What NOT to Build (Scope Boundaries)

| Feature | Why Not Now | When |
|---------|-----------|------|
| Tiptap Smart Chip insertion (clicking chips in transcript) | Requires entity extraction backend | Phase 8 (Week 15) |
| Knowledge Graph visualization (d3-force) | Requires cloud graph API | Phase 8 (Week 15) |
| Weekly Digest view | Requires cloud digest API | Phase 8 (Week 17) |
| Onboarding flow (signup/login) | Requires auth backend | Phase 6 (Week 9) |
| Pricing/upgrade wall | Requires payment integration | Phase 9 (Week 19) |
| Cross-meeting AI (/ask) | Requires cloud RAG API | Phase 8 (Week 16) |
| Real-time transcript streaming | Requires Whisper worker thread | Phase 3 (Week 5) |

## 9.2 Rendering Architectures for Speed (60FPS Minimum)

Native desktop apps never drop frames. To guarantee our React UI runs blazingly fast even during a 2-hour meeting with 1,000+ transcript segments, we enforce a multi-layered optimization strategy:

### 9.2.1 Cold Start Acceleration

The app must feel **instant** on launch. The window appears in <500ms with a fully rendered shell.

| Optimization | Implementation |
|-------------|----------------|
| **Code Splitting** | `React.lazy()` for `MeetingDetailView`, `SettingsView`, and `CommandPalette`. Only the `MeetingListView` loads on initial paint. |
| **Font Preloading** | Geist/Inter font files bundled locally + `<link rel="preload" as="font">` in the HTML shell. Zero network font fetches. |
| **Deferred Hydration** | The Electron main process sends `electronAPI.meeting.list({ limit: 20 })` via IPC during window creation (in `main.ts`). By the time React hydrates, the first 20 meetings are already in memory — the list appears to load in 0ms. |
| **Splash Shell** | The `index.html` contains an inline CSS-only app shell (void black background + centered logo pulse) so the user sees branded content before React even initializes. |

### 9.2.2 Rendering Pipeline

| Optimization Vector | Strategy | Implementation Rule |
|---------------------|----------|---------------------|
| **Atomic State Updates** | Zustand store instead of Context. | Do not use `<AppContext.Provider>`. If the transcript updates, only the `TranscriptPanel` re-renders. The `ZenRail` and `DynamicIsland` absolutely must not re-render. |
| **DOM Virtualization** | `@tanstack/react-virtual` | The transcript panel MUST be virtualized. Only the ~15 currently visible paragraphs exist in the DOM. **CRITICAL:** Because transcript segments have dynamic word wrap heights, developers MUST use TanStack Virtual's dynamic measurement feature (`measureElement` ref on each segment) combined with a `ResizeObserver`, otherwise scrolling will severely glitch when traversing upward. |
| **CSS Containment** | `contain: strict;` | Complex glowing UI elements (like the Zen Rail and Split Pane) will use CSS containment so the browser does not recalculate layout globally when a micro-animation fires. |
| **Animation Threading** | CSS Transforms Only | Absolutely zero JavaScript-based animations (no Framer Motion for layout). All premium physics use CSS `transform` and `opacity` to stay on the GPU compositor thread. |
| **Icon SVGs** | Sprite maps / Lucide React | Icons are statically imported; no heavy SVG string parsing during render. |
| **Segment Memoization** | `React.memo()` on every `<TranscriptSegment />` | Finalized segments (non-streaming) are guaranteed to never re-render. Only the live segment updates per token. |
| **Waveform Rendering** | `OffscreenCanvas` API | The `<AudioIndicator />` continuous waveform MUST be drawn using an `OffscreenCanvas` in a WebWorker. If drawn on the main thread via standard `<canvas>` or DOM elements, it will drop frames when the transcript auto-scrolls. |
| **SQLite WAL Mode** | Database Level | The main process SQLite connection MUST execute `PRAGMA journal_mode = WAL;` (Write-Ahead Logging) to allow concurrent reads/writes and prevent DB locking when saving heavy note payloads. |

### 9.2.3 GPU & Compositing Strategy

```css
/* Elements that animate frequently get their own GPU layer */
.gpu-promoted {
  will-change: transform;
  transform: translateZ(0); /* Force layer creation */
  contain: layout style paint; /* Isolate from global reflow */
}
```

**Apply `.gpu-promoted` to:** `ZenRail`, `DynamicIsland`, `SplitPane` (divider), `CommandPalette` backdrop, and `Toast` container. These elements animate on hover/drag and must never trigger a full-page reflow.

**CAUTION:** Do NOT apply `will-change` globally or to >10 elements. Chromium allocates a separate VRAM texture for each promoted layer. Over-promotion causes GPU memory exhaustion and paradoxically *decreases* performance.

### 9.2.4 Memory Management (Long Meeting Resilience)

| Resource | Budget | Enforcement |
|----------|--------|-------------|
| Transcript segments in React state | ≤ 500 | Older segments pruned from state, lazy-loaded from SQLite on scroll-up |
| Tiptap editor nodes | ≤ 200 | Long notes paginate or collapse older sections |
| Renderer process RAM | ≤ 200MB | If exceeded, devtools profiling required |
| IPC payload per call | ≤ 100KB | Large datasets require cursor pagination |

### 9.2.5 SQLite WAL Size Management

WAL mode dramatically improves write performance, but the WAL file grows unboundedly during a long meeting.

```sql
-- Set at database initialization (DatabaseService constructor):
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA wal_autocheckpoint = 1000;  -- Auto-checkpoint every 1000 pages (~4MB)
```

**On Meeting Stop:** The moment `meeting.stop()` is called, the main process MUST execute a manual checkpoint in the background:
```sql
PRAGMA wal_checkpoint(TRUNCATE);
```
This forces all WAL data to merge into the main `.db` file and truncates the WAL to zero bytes, reclaiming disk space. Without this, a 3-hour meeting could leave a multi-GB WAL file on disk.

### 9.2.6 macOS Permission Denial Trap

macOS has a critical UX trap: if a user clicks "Deny" on the Screen Recording or Microphone permission prompt **even once**, the OS **permanently blocks** the app from ever showing that native prompt again. The user must manually navigate to System Settings.

**Implementation:**
```typescript
// In PermissionRequestFlow.tsx:
if (permissionStatus === 'denied') {
  // The native prompt will NEVER appear again.
  // Render a fallback UI with a deep-link button:
  const openSystemSettings = () => {
    window.electronAPI.shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    );
  };
  // Show: "Permission was denied. Click here to fix it in System Settings."
  // The button routes the user directly to the exact macOS privacy pane.
}
```

This fallback MUST be implemented. Without it, users who accidentally clicked "Deny" will see a broken app with no way to recover.

### 9.2.7 Perceived Performance Tricks

| Technique | Where Applied | Effect |
|-----------|--------------|--------|
| **Optimistic UI** | Meeting title edit, note save, meeting delete | UI updates instantly, IPC call fires in background. On failure, rollback with toast. |
| **Hover Prefetch** | Meeting List cards | After 200ms hover, silently prefetch meeting detail + notes. Click-through feels instant. |
| **Skeleton Shimmer** | Meeting List, Transcript Panel | Geometric shimmer matching exact card/segment shapes. No spinners, ever. |
| **Deferred Search** | Command Palette input | Use `React.useDeferredValue()` on the query string so typing never stutters, even if search results are expensive. |
| **Instant Navigation** | View switching | The new view's skeleton renders in <16ms. Data populates asynchronously. Navigation never blocks. |
| **Idle Pre-computation** | Main process & Renderer | Use `requestIdleCallback()` for computing heavy tasks like fuzzy-search indexing, Entity extraction pruning, and sending telemetry. Never block the main thread for these. |

### 9.2.6 Strict Performance Budgets

| Metric | Target | Measurement | Consequences |
|--------|--------|-------------|--------------|
| Cold start to interactive | < 500ms | Electron `ready` → first meaningful paint | If exceeded, profile code splitting boundaries. |
| Initial shell render | < 150ms | React mount → visible app shell | If > 150ms, the app feels web-based. Move logic out of main thread. |
| View navigation | < 50ms | Click → skeleton visible | User must see immediate response. No blank frames. |
| Split-pane drag | 60 FPS | `resize` event handler | Must rely on `requestAnimationFrame` + `transform`, never `width/height` re-layouts. |
| Transcript append | < 8ms | New segment → DOM update | Only 1 segment appends; the rest are memoized. |
| Note Expansion UI | < 16ms | Loader enters DOM | The pulsing violet loader must enter bounds without shifting other layout blocks. |
| Command Palette open | < 100ms | Keypress → visible palette | Lazy loaded React component, but pre-warmed backdrop blur. |
| Renderer memory | < 200MB | After 2-hour meeting | Enforce segment pruning + Tiptap node limits. |

## 9.3 Accessibility Minimums

- All interactive elements have `aria-label` or visible text.
- Focus management: Tab order follows visual order.
- Color contrast: All text meets WCAG AA (4.5:1 ratio) against dark backgrounds.
- Screen reader: Transcript segments use `role="log"` with `aria-live="polite"`.
- Keyboard: Every action reachable without mouse.

---

# PART 10: VERIFICATION PLAN

### Automated
```bash
# TypeScript compilation
npx tsc --noEmit

# Dev server starts
npm run dev

# Electron dev mode
npm run electron:dev
```

### Manual Checklist
- [ ] App launches without errors
- [ ] Custom title bar renders (macOS traffic lights visible)
- [ ] Sidebar shows meeting list from database
- [ ] "Start Meeting" creates a meeting and navigates to detail view
- [ ] Meeting detail shows split pane (transcript + notes)
- [ ] Split pane divider is draggable
- [ ] "Stop Meeting" updates duration and returns to list
- [ ] Meeting title is editable inline
- [ ] Meeting can be deleted from context menu
- [ ] Search view opens with Cmd+K
- [ ] Settings view shows audio test UI (existing component)
- [ ] Offline banner appears when network disconnects
- [ ] Toast notifications appear and auto-dismiss
- [ ] Empty states display for views with no data
- [ ] All 17 existing audio components remain functional
- [ ] No console errors in development
- [ ] Window resizes gracefully down to 800×600

---

# PART 11: piytes.md AUDIT CROSS-REFERENCE (22-Point Fix Tracker)

> **Source:** Deep analysis of `piytes.md` (2945 lines) cross-referenced with 96.7% API test validation (88/91 PASS).
> These items must be resolved before or during implementation. Items already injected into earlier sections are marked ✅.

### Frontend-Impacting Fixes (Applied Above)

| # | Issue | Where Fixed | Status |
|---|-------|-------------|--------|
| 1 | **Encrypted Search Paradox** — Client must generate local embeddings + send with `skip_server_embedding: true` | §1.1 (Local Embedding Service), §4.7 (RAG pipeline) | ✅ Injected |
| 2 | **Auth Endpoint Paths** — Must use `/api/v1/auth/*` not `/auth/*` | Backend SyncManager contract | ⚠️ Fix in `piytes.md` |
| 3 | **Namespace Format** — Use dots not slashes: `meetings.transcripts` not `meetings/transcripts` | Backend SyncManager contract | ⚠️ Fix in `piytes.md` |
| 6 | **Yjs CRDT for Tiptap Notes** — Replace LWW sync with Yjs binary updates | §4.2 (Note Editor), §7 (File Structure), §8 Phase E | ✅ Injected |
| 7 | **Battery-Aware Orchestration** — See below | §7 (`usePowerMode.ts` hook) | ✅ Injected |
| 9 | **AI Trust Badges** — 🤖 on AI text, bidirectional source highlighting | §4.2 (Note Editor + Symbiosis table) | ✅ Injected |
| 10 | **WAL Checkpoint** — autocheckpoint + TRUNCATE on stop | §9.2.5 | ✅ Injected |
| 20 | **API Key Exposed** — Rotate and replace with placeholder in `piytes.md` | Backend concern | ⚠️ Fix in `piytes.md` |
| 21 | **RAM Table References Phi-3** — Should be Qwen 2.5 3B | Backend concern | ⚠️ Fix in `piytes.md` |
| 22 | **Query Quota Fallback** — Silent fallback to local Qwen when cloud quota exhausted | §4.7 (Global Context Recovery) | ✅ Injected |

### Backend Fixes (Must Be Applied to piytes.md)

| # | Issue | Fix Required | Priority |
|---|-------|-------------|----------|
| 4 | **Batch Sync** — Each transcript segment must sync as individual memory, not one giant blob | Rewrite `sync()` to loop per-event | 🔴 Critical |
| 5 | **HKDF Salt/Info Reversed** — Salt should be empty, purpose goes in info param | Fix `crypto.hkdfSync()` call | 🔴 Critical |
| 8 | **Dodo Payments > Lemon Squeezy** — Switch global MoR gateway | Update payment strategy | 🟡 Phase 9 |
| 11 | **embedding_status returns 'ready' not 'completed'** | Check `=== 'ready'` in client code | 🟡 Phase 5 |
| 12 | **Export downloadUrl is relative** — Must prepend `API_BASE` | Add URL construction in SyncManager | 🟡 Phase 6 |
| 13 | **Graph types (contradicts/supersedes/parent) = 0 in production** | Need triggering content patterns | 🟡 Phase 8 |
| 17 | **Embedding status polling** — Wait ~4s after memory creation before searching | Add polling or delay in SyncManager | 🟡 Phase 6 |
| 18 | **Content size limit ~30KB** — Chunk transcripts to max 20KB per memory | Add chunking in SyncManager | 🔴 Phase 6 |
| 19 | **Compliance DELETE needs undocumented params** | Investigate before GDPR implementation | 🟡 Phase 8 |

### Battery-Aware PowerManager (`usePowerMode` Hook)

The `DynamicIsland` displays a subtle power indicator when on battery:

```typescript
// Uses Electron's powerMonitor API via IPC
function usePowerMode() {
  // Returns: { mode: 'performance' | 'balanced' | 'eco', isOnBattery: boolean }
  //
  // Mode logic:
  //   AC power          → 'performance' (4 threads, Whisper + Qwen concurrent)
  //   Battery, cool     → 'balanced'    (2 threads, Qwen single-thread)
  //   Battery, critical → 'eco'         (1 thread, Qwen disabled — queued until plug-in)
  //
  // The DynamicIsland shows:
  //   ⚡ Performance  |  🔋 Balanced  |  🪫 Eco Mode
  //
  // In 'eco' mode, Ctrl+Enter shows: "AI expansion paused — plug in to resume"
  // instead of an error.
}
```

### WAL Interval Checkpoint (Enhancement to §9.2.5)

In addition to the `TRUNCATE` on meeting stop, add a **passive checkpoint every 10 minutes** during recording to prevent the WAL from growing unboundedly during very long meetings:

```typescript
// In AudioPipelineService (main process):
let walCheckpointInterval: NodeJS.Timeout | null = null;

function onMeetingStart() {
  // Passive checkpoint every 10 min (non-blocking during recording)
  walCheckpointInterval = setInterval(() => {
    db.pragma('wal_checkpoint(PASSIVE)');
  }, 10 * 60 * 1000);
}

function onMeetingEnd() {
  clearInterval(walCheckpointInterval);
  db.pragma('wal_checkpoint(TRUNCATE)'); // Aggressive reclaim
}

// Emergency: if -wal > 500MB, force a passive checkpoint immediately
async function checkWalHealth() {
  const walSize = (await fs.stat(dbPath + '-wal')).size;
  if (walSize > 500 * 1024 * 1024) db.pragma('wal_checkpoint(PASSIVE)');
}
```

