# PiyAPI Notes — Frontend Architectural Blueprint (2-Phase)
## The Definitive UI/UX Specification

> **Document Status:** Final · Restructured into 2 clear phases for execution clarity.
> Based on exhaustive analysis of `piytes.md` (2945 lines), `ipc.ts` (732 lines), `database.ts` (219 lines), 17 existing renderer components, `electron/main.ts`, and competitive research (Granola, Otter.ai, Fireflies).

---

# ════════════════════════════════════════════════════════════════
# PHASE 1: DESIGN & BUILD THE UI SHELL
# ════════════════════════════════════════════════════════════════

> **Phase 1 Scope:** Everything that can be built, styled, and visually verified **without any running backend service, AI model, or audio pipeline**. A pure frontend developer can complete this entire phase using mock/empty data and visual verification only.

---

## P1.1 Design System — Sovereign UI (Zen Glass)

### The "Zen Glass" UX Philosophy
The application adheres to the **Sovereign Zen Glass** design language. The goal is a highly premium, distraction-free environment that feels like a physical piece of etched crystal on the user's screen. It relies on absolute blacks, multi-layered Gaussian blurs, ultra-subtle monochromatic noise grain, fluid spring animations, and typography-driven visual hierarchy. It feels undeniably expensive.

**Core UX Performance Principles:**
- **Perceived Speed > Actual Speed:** The UI must *feel* instant. Every navigation action shows immediate visual feedback (<50ms) even if data arrives later. Optimistic UI updates, skeleton shimmer, and progressive data loading are mandatory — never a blank screen.
- **Cognitive Load Reduction:** No more than 3 visual layers competing for attention at any time. The void black background is not decoration — it is active negative space that lets the brain breathe.
- **Motion as Information:** Animations are not decorative. Every transition communicates spatial relationships ("where did I come from, where am I going"). Staggered reveals tell the user that data is streaming in, not dumped.

### Color Architecture (Deep & Calm)

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

### Premium Typography

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

### Spacing, Radius, & Native Geometry

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

### Advanced Motion & Physics

Standard `ease-out` is not premium enough. We use Apple-style spring physics transitions using custom cubic-beziers to create "weight" and "fluidity".

```css
/* ── Timing Functions ── */
--ease-spring:       cubic-bezier(0.175, 0.885, 0.32, 1.1); /* Bouncy enter */
--ease-fluid:        cubic-bezier(0.16, 1, 0.3, 1);         /* Silky smooth */
--ease-snappy:       cubic-bezier(0.4, 0, 0.2, 1);          /* Quick UI state */

--transition-fast:   150ms var(--ease-snappy);
--transition-base:   300ms var(--ease-fluid);
--transition-slow:   500ms var(--ease-fluid);

/* Premium Interactions */
.premium-hover {
  transition: transform var(--transition-base), box-shadow var(--transition-base);
  will-change: transform;
}
.premium-hover:hover {
  transform: translateY(-1px) scale(1.01);
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5), 
              0 0 0 1px var(--color-border-subtle),
              0 0 12px var(--color-glow-violet);
}

/* ── Staggered Entrance Choreography ── */
@keyframes stagger-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stagger-child {
  animation: stagger-in 300ms var(--ease-fluid) both;
}
/* JS applies: style="animation-delay: ${index * 40}ms" per child. Max 12 items staggered, rest appear instant. */
```

### Premium Glass Texture Formula & Effects

Every elevated surface uses this multi-layer glassmorphism technique.

**CRITICAL PERFORMANCE RULE:** Heavy CSS blurs (`backdrop-filter: blur(24px)`) are GPU destroyers if overused. Limit active blurs to **three** (e.g., ZenRail, DynamicIsland, and one active Dialog). Never animate the `blur` radius itself.

```css
.surface-glass-premium {
  background: linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.03) 0%,
    rgba(255, 255, 255, 0.01) 100%
  );
  backdrop-filter: blur(24px) saturate(120%);
  -webkit-backdrop-filter: blur(24px) saturate(120%);
  box-shadow: 
    0 4px 24px -1px rgba(0, 0, 0, 0.4),
    0 1px 0 0 rgba(255, 255, 255, 0.1) inset,
    0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-xl);
  transform: translateZ(0); 
}

/* Film Grain Noise Overlay */
.with-noise::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url('data:image/svg+xml,...'); /* SVG Noise */
  opacity: 0.03;
  mix-blend-mode: overlay;
  pointer-events: none;
  border-radius: inherit;
}
```

### Native Scrollbars & Window Focus States

Dark Mode Only by design. Premium overlay scrollbars.

```css
/* ── Overlay Scrollbars (macOS Native Feel) ── */
::-webkit-scrollbar { width: 8px; height: 8px; background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: var(--radius-full); }
::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

/* ── Window Blur (Lost Focus) State ── */
.window-blurred {
  --color-bg-panel: rgba(15, 15, 17, 0.3);
  --color-border-subtle: rgba(255, 255, 255, 0.03);
  --color-glow-violet: transparent;
}
.window-blurred .surface-glass-premium {
  backdrop-filter: blur(12px) saturate(100%);
}
```

---

## P1.2 Window Configuration

```typescript
// electron/main.ts — BrowserWindow config changes needed
mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  titleBarStyle: 'hiddenInset',  // macOS hidden title bar with inset traffic lights
  trafficLightPosition: { x: 16, y: 12 },
  frame: process.platform === 'darwin' ? true : false, // frameless on Windows
  // ... existing webPreferences unchanged
})
```

---

## P1.3 Spatial Layout & Navigation (The "Zen" Arrangement)

We discard the traditional heavy left sidebar. Instead, we use a spatial, layered arrangement:

1. **The Core Canvas:** `--color-bg-root` void canvas
2. **The Zen Rail (Global Nav):** Floating blurred glass rail on the far left with icon destinations
3. **The Floating Command Center (Cmd+K):** Spotlight-style glass search bar overlay
4. **The Dynamic Island (Header):** Frameless, floating pill-shaped header with controls

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

**Focus Mode:** `Cmd+Shift+F` slides the Zen Rail off-screen, expanding the central pane edge-to-edge.

---

## P1.4 State Management (Zustand)

```typescript
// src/renderer/store/appStore.ts
import { create } from 'zustand';

interface AppState {
  activeView: 'meeting-list' | 'meeting-detail' | 'settings';
  selectedMeetingId: string | null;
  recordingState: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing';
  activeMeetingId: string | null;
  audioMode: 'system' | 'microphone' | 'none';
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncTimestamp: number | null;
  focusMode: boolean;
  commandPaletteOpen: boolean;
  toasts: Toast[];

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

**Why Zustand:** Zero provider wrapping, <1KB bundle, atomic updates (ZenRail never re-renders when transcript updates).

---

## P1.5 Resilience (Error Boundaries & Loading)

- **`<ErrorBoundary />`**: Global boundary at `App.tsx` + local boundaries around `<TranscriptPanel>` and `<MeetingList>`. If one component crashes, only that component shows an amber warning — the rest of the UI continues.
- **Skeleton Shimmer Vectors:** Never blocking spinners. Loading states render CSS shimmer effects in the exact geometry of the target component (e.g., `<MeetingSkeleton />` matches `<MeetingCard />` dimensions).

---

## P1.6 Views & Visual Components

### P1.6.1 Meeting List View (Spatial Card Grid)

```
┌─────────────────────────────────────────────────────────────┐
│    [ + Start New Meeting (Cmd+N) ]  ← Floating Glass Pill   │
│                                                             │
│    Today                                                    │
│    ┌────────────────────┐  ┌────────────────────┐          │
│    │ Q3 Budget Review   │  │ Design Sprint      │          │
│    │ 45 min · 4 people  │  │ 32 min · 2 people  │          │
│    └────────────────────┘  └────────────────────┘          │
```

- **Cards:** Fluid grid, generous padding, `.stagger-child` entrance
- **Hover Physics:** `.premium-hover` lift + shadow + edge highlight
- **Hover Prefetch:** After 200ms hover, silently prefetch meeting details (instant click-through)
- **Fluid Navigation:** Card expands into detail view via shared-element transition

**New Meeting Dialog:** Title (optional, LLM auto-suggests after 60s), Template dropdown (Blank, 1:1, Standup, Client Call, Brainstorm), Context Documents drag-and-drop zone (1–3 files).

### P1.6.2 Meeting Detail View (Dual-Pane Layout Shell)

```
┌─────────────────────────────────────────────────────────────┐
│                                                 [⛶ Focus]   │
│  LIVE TRANSCRIPT                                            │
│  [00:12] Sarah:                                             │
│    We need to discuss the [Q3 budget] cuts.                 │
│                              └── 📊 AmountChip              │
│  [01:22] ▌ (transcribing...)                                │
├═════════════════ (Glowing Glass Divider) ═══════════════════┤
│  YOUR NOTES                                      Ctrl+Enter │
│  • Budget cuts                                              │
│    → Client requested 10% reduction (AI expanded)           │
└─────────────────────────────────────────────────────────────┘
```

**Layout Architecture:**

| Concept | Execution | Rationale |
|---------|-----------|-----------|
| **Divider** | 1px glowing line, 16px invisible drag hit area | Maintains single glass sheet illusion |
| **Reading Flow** | Transcript top (auto-scroll), notes bottom (grows down) | Minimizes saccadic eye movement |
| **Action Isolation** | Controls in Dynamic Island, not content area | Keeps text canvas sacred |
| **Smart Chip Rhythm** | Chips recessed until hovered, then illuminate | Prevents visual overload |
| **Focus State** | `Cmd+Shift+F` collapses Rail, centers editor | Morphs app to singular writing instrument |

**Transcript Panel (Visual Only):**
- Speaker diarization colors (violet, teal, amber, rose, sky, lime) with 8px colored dots
- ⭐ Pin icon on hover per segment
- "Edited" badge on corrected segments
- Scroll lock: user scrolls up → "↓ Jump to latest" FAB fades in

**Note Editor (Tiptap Shell):**
- Engine: Tiptap (`@tiptap/react`)
- Schema: Paragraphs, Bullet Lists, Bold, Italic, Blockquotes
- Default: Bullet list for fast shorthand capture
- Auto-save: Debounced 1500ms, `useEffect` cleanup flush on unmount

### P1.6.3 Meeting Header Bar

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back  │  Q3 Budget Review (editable)  │  ● REC 00:45:12  │ ⏹ Stop │
└──────────────────────────────────────────────────────────────┘
```

### P1.6.4 Post-Meeting Digest (Visual Layout Shell)

```
┌──────────────────────────────────────────────────────────────┐
│  TRANSCRIPT (scrollable)  │  POST-MEETING DIGEST              │
│  ...                      │  [ Summary ] [ Actions ] [ ⭐ ]   │
│  ...                      │  Executive Summary: "..."          │
│  ...                      │  Action Items: ☐ Follow up...      │
├═══════════════════════════┤  Key Decisions: • Budget cut...     │
│  YOUR NOTES               │  Pinned Moments: (3)               │
│  ...                      │  [ Export ▾ ] [ Push Actions ]      │
└──────────────────────────────────────────────────────────────┘
```

### P1.6.5 Mini Floating Widget (Visual Shell)

```
┌─────────────────────────────┐
│ ● REC 00:45:12      [ ⏹ ]  │
│ Sarah: "...budget cuts..."  │
└─────────────────────────────┘
```
280×72px, always-on-top, glassmorphic pill. Click to restore full window.

### P1.6.6 Command Palette (Cmd+K) — Visual

```
┌─────────────────────────────────────────────────────────────┐
│ (Heavy Backdrop Blur)                                       │
│       ┌───────────────────────────────────────────────┐     │
│       │ 🔍 Search meetings, transcripts, notes...     │     │
│       ├───────────────────────────────────────────────┤     │
│       │ ACTIONS                                       │     │
│       │  ● Start New Meeting                      ↵   │     │
│       │  ⚙️ Open Settings                         ↵   │     │
│       │ MEETINGS (12)                                 │     │
│       │  Design Sprint · "...budget cuts in Q3..."    │     │
│       └───────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

Fully keyboard-navigable (Arrow Up/Down + Enter).

### P1.6.7 Settings View

| Section | Controls | Phase 1 Status |
|---------|----------|----------------|
| **Recording** | Mic selector, auto-start toggle, save audio toggle | ✅ Build UI |
| **Transcription** | Language selector, confidence toggle, delay selector | 🎨 Layout only |
| **Intelligence** | Auto-expand toggle, expansion style, timestamps toggle | 🎨 Layout only |
| **Sync & Privacy** | Auto-sync toggle, data location, encryption status | 🎨 Layout only |
| **Storage** | Local/cloud usage bars, clear old meetings | ✅ Build UI |
| **Account** | Device count, add device, GDPR export, delete account | 🎨 Layout only |

### P1.6.8 Global Context Bar (Visual Shell)

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 "What did Sarah say about the marketing budget?"       │
├─────────────────────────────────────────────────────────────┤
│  "Sarah mentioned a 10% budget reduction..."               │
│  Sources: 📋 Q3 Budget Review — Feb 18                     │
└─────────────────────────────────────────────────────────────┘
```

Visual overlay only in Phase 1. RAG pipeline wiring in Phase 2.

### P1.6.9 Progressive Onboarding (Ghost Meeting)

1. Pre-recorded 30-second sample transcript streams in top pane
2. Pre-populated sample notes with pulsing `Ctrl+Enter` prompt
3. Tooltip overlays point to Zen Rail, Dynamic Island, Command Palette
4. Ghost meeting auto-clears after completion

---

## P1.7 Component Library

### UI Primitives

| Component | Height | Padding | Physics |
|-----------|--------|---------|---------|
| `<Button />` | 32px / 40px | `px-12` | `.premium-hover` active shadow |
| `<IconButton />` | 32×32 / 24×24 | center | Icon scales 1.1x on hover |
| `<Input />` | 32px | `px-12` | `--color-violet` 1px glow on focus |
| `<Toggle />` | 24px track | 20px thumb | Spring animation |
| `<Badge />` | 24px | `px-8` | Static |
| `<SmartChip />` | 24px inline | `px-6` | Expands slightly on hover |
| `<Dialog />` | fluid | `p-24` | `slide-up` + backdrop blur |
| `<ContextMenu />` | min-w 160px | `py-4` | Appears at click coords |

### Domain Components (Visual Shells)

| Component | Purpose |
|-----------|---------|
| `<MeetingCard />` | Floating card with meeting preview |
| `<MeetingSkeleton />` | Shimmer vector for loading |
| `<TranscriptSegment />` | Segment with speaker color, pin, edit |
| `<NoteExpansionLoader />` | Pulsing violet dots |
| `<MagicExpansion />` | AI-expanded node visual (trust badge + reject button) |
| `<AudioIndicator />` | Pulsing waveform (uses OffscreenCanvas) |
| `<AudioTimeline />` | Waveform scrubber for past meetings |
| `<RecordingTimer />` | `00:00:00` elapsed display (requestAnimationFrame) |
| `<PostMeetingDigest />` | Summary/Actions/Decisions pane layout |
| `<SilentPrompter />` | Ghost-text coaching in DynamicIsland |
| `<MiniWidget />` | Always-on-top floating pill |
| `<CommandPalette />` | Center overlay search & actions |
| `<GlobalContextBar />` | System-level Spotlight shell |
| `<SyncStatusIndicator />` | Dot + label in Island |
| `<EmptyState />` | Beautiful zero-data screens |
| `<GhostMeetingTutorial />` | First-run onboarding simulation |
| `<OfflineBanner />` | Subtle offline warning line |

### Existing Components (KEEP all 17)

- **Permission flow:** `PermissionRequestFlow` → macOS screen recording
- **Audio test:** `AudioTestUI` + `SystemAudioTest` → Settings view
- **Audio capture:** `AudioCaptureWithPermissions` → permission → fallback → capture flow
- **Fallback notification:** `AudioFallbackNotification` → adapt into Toast system
- **Platform dialogs:** `StereoMixErrorDialog` (Windows), `ScreenRecordingPermissionDialog` (macOS)

---

## P1.8 UI Hooks

```typescript
function useToast() {
  // Returns { addToast, removeToast, toasts }. Auto-dismiss after 5 seconds.
}

function useKeyboardShortcuts() {
  // Registers: Cmd+K (search), Cmd+N (new meeting), Cmd+Shift+F (focus mode)
}
```

---

## P1.9 File Structure

```
src/renderer/
├── main.tsx                          # Entry point
├── App.tsx                           # Root: ErrorBoundary + Layouts + Toast
├── index.css                         # Full "Zen Glass" design system variables
├── audioCapture.ts                   # ✅ Keep (existing)
│
├── store/
│   └── appStore.ts                   # Zustand global state
│
├── hooks/
│   ├── useToast.ts                   # Phase 1
│   └── useKeyboardShortcuts.ts       # Phase 1
│
├── components/
│   ├── ui/                           # Design system primitives
│   │   ├── Button.tsx, IconButton.tsx, Input.tsx, Select.tsx
│   │   ├── Toggle.tsx, Badge.tsx, Tooltip.tsx
│   │   ├── Dialog.tsx, ContextMenu.tsx, Toast.tsx
│   │   ├── EmptyState.tsx, Skeletons.tsx, SplitPane.tsx
│   │
│   ├── layout/                       # App shell
│   │   ├── DynamicIsland.tsx, ZenRail.tsx, AppLayout.tsx
│   │   ├── ErrorBoundary.tsx, OfflineBanner.tsx
│   │
│   ├── meeting/                      # Meeting-specific
│   │   ├── MeetingCard.tsx, TranscriptPanel.tsx, TranscriptSegment.tsx
│   │   ├── SmartChip.tsx, NoteEditor.tsx, NoteExpansionLoader.tsx
│   │   ├── MagicExpansion.tsx, PostMeetingDigest.tsx
│   │   ├── SpeakerHeatmap.tsx, AudioIndicator.tsx, RecordingTimer.tsx
│   │   ├── MiniWidget.tsx, SilentPrompter.tsx, NewMeetingDialog.tsx
│   │
│   ├── command/
│   │   ├── CommandPalette.tsx, GlobalContextBar.tsx
│   │
│   ├── audio/                        # ✅ EXISTING — keep all 17 files
│   │
│   └── settings/
│       └── SettingsView.tsx
│
└── views/
    ├── MeetingListView.tsx, MeetingDetailView.tsx, SettingsView.tsx
```

**Totals:** ~40 new files, 17 existing preserved, 3 modified, 1 deleted (`App.css`).

---

## P1.10 Performance & Rendering (60FPS Minimum)

### Cold Start Acceleration

| Optimization | Implementation |
|-------------|----------------|
| **Code Splitting** | `React.lazy()` for MeetingDetailView, SettingsView, CommandPalette |
| **Font Preloading** | Bundled locally + `<link rel="preload" as="font">` |
| **Deferred Hydration** | Main process pre-fetches meetings during window creation |
| **Splash Shell** | `index.html` inline CSS: void black + centered logo pulse |

### Rendering Pipeline

| Vector | Strategy |
|--------|----------|
| **Atomic Updates** | Zustand (no Context Provider cascade) |
| **DOM Virtualization** | `@tanstack/react-virtual` with dynamic measurement (`measureElement` + `ResizeObserver`) |
| **CSS Containment** | `contain: strict;` on Zen Rail, Split Pane |
| **Animation Threading** | CSS transforms only, zero JS animations |
| **Icon SVGs** | Lucide React, static imports |
| **Segment Memoization** | `React.memo()` on every `<TranscriptSegment />` |
| **Waveform** | `OffscreenCanvas` in WebWorker for `<AudioIndicator />` |

### GPU & Compositing

```css
.gpu-promoted {
  will-change: transform;
  transform: translateZ(0);
  contain: layout style paint;
}
```

Apply to: ZenRail, DynamicIsland, SplitPane divider, CommandPalette backdrop, Toast container. **Max 10 elements** — over-promotion causes GPU memory exhaustion.

### Perceived Performance Tricks

| Technique | Where | Effect |
|-----------|-------|--------|
| **Optimistic UI** | Title edit, note save, delete | Instant UI → background IPC → rollback on failure |
| **Hover Prefetch** | Meeting List cards | 200ms hover → silent prefetch → instant click |
| **Skeleton Shimmer** | Lists, transcript | Exact-geometry shimmer, never spinners |
| **Deferred Search** | Command Palette | `useDeferredValue()` — typing never stutters |
| **Instant Navigation** | View switching | Skeleton in <16ms, data async |
| **Idle Pre-computation** | Fuzzy indexing | `requestIdleCallback()` for non-critical work |

### Performance Budgets

| Metric | Target |
|--------|--------|
| Cold start to interactive | < 500ms |
| Initial shell render | < 150ms |
| View navigation | < 50ms |
| Split-pane drag | 60 FPS |
| Transcript append | < 8ms |
| Command Palette open | < 100ms |
| Renderer memory | < 200MB |

---

## P1.11 Accessibility

- All interactive elements have `aria-label` or visible text
- Tab order follows visual order
- Color contrast: WCAG AA (4.5:1) against dark backgrounds
- Screen reader: Transcript uses `role="log"` + `aria-live="polite"`
- Every action reachable without mouse

---

## P1.12 Phase 1 Implementation Sequence

### Day 1: Design System Foundation
1. Replace `index.css` with full CSS variable system
2. Initialize Zustand `appStore.ts`
3. Create `Button`, `Input`, `Badge`, `EmptyState`, `Skeletons` primitives

### Day 2: App Shell
4. Build `DynamicIsland.tsx` (custom frameless bar with drag region)
5. Build `ZenRail.tsx` (navigation icons)
6. Build `AppLayout.tsx` (Rail + main area)
7. Build global `<ErrorBoundary>`
8. Rewrite `App.tsx` with layouts and providers

### Day 3: Meeting List View
9. Build `MeetingCard.tsx` + Context Menu
10. Build `MeetingListView.tsx` with date-grouped card grid + skeleton loader
11. Build `NewMeetingDialog.tsx` using Dialog primitive
12. Build `CommandPalette.tsx` (Cmd+K overlay)

### Day 4: Meeting Detail View (Layout)
13. Build `SplitPane.tsx` (resizable divider)
14. Build `TranscriptSegment.tsx` (visual component)
15. Build `TranscriptPanel.tsx` (visual with scroll lock UI)
16. Build `SmartChip.tsx` (visual rendering)
17. Build `NoteEditor.tsx` (Tiptap shell with basic editing)
18. Build `NoteExpansionLoader.tsx`, `MagicExpansion.tsx` (visual shells)
19. Build `AudioIndicator.tsx`, `RecordingTimer.tsx` (visual)
20. Expand `SettingsView.tsx` with 6 sections
21. Build `OfflineBanner.tsx`, `Toast.tsx` + `useToast`

---

## P1.13 Phase 1 Verification

### Automated
```bash
npx tsc --noEmit
npm run dev
npm run electron:dev
```

### Visual Checklist
- [ ] App launches without errors
- [ ] Custom title bar renders (macOS traffic lights visible)
- [ ] Zen Rail shows navigation icons
- [ ] Meeting List shows cards (or empty state)
- [ ] Meeting Detail shows split pane layout
- [ ] Split pane divider is draggable at 60FPS
- [ ] Command Palette opens with Cmd+K
- [ ] Settings view shows all 6 sections
- [ ] Focus Mode (Cmd+Shift+F) collapses Zen Rail
- [ ] Offline banner appears on disconnect
- [ ] Toasts appear and auto-dismiss
- [ ] Empty states display for views with no data
- [ ] All 17 existing audio components remain functional
- [ ] Window resizes gracefully down to 800×600
- [ ] No console errors in development
- [ ] All animations feel smooth (spring physics, stagger)

---
---

# ════════════════════════════════════════════════════════════════
# PHASE 2: WIRE THE INTELLIGENCE
# ════════════════════════════════════════════════════════════════

> **Phase 2 Scope:** Everything that requires a **running service** — audio capture, Whisper transcription, LLM inference, local embeddings, encrypted sync, IPC wiring to real backend data, and all AI-powered features. Phase 2 builds ON TOP of Phase 1's visual shells, filling them with real data and intelligence.
>
> **Prerequisite:** Phase 1 must be complete and visually verified before Phase 2 begins.

---

## P2.1 Strategic Context — What Exists Today

### Codebase Audit

**Electron Shell (`electron/main.ts`):** 1200×800 default, 800×600 minimum. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`. Services init → IPC setup → Window creation → graceful cleanup.

**Renderer (`src/renderer/`):** `main.tsx` → `App.tsx` (placeholder). `index.css` (40 lines), `App.css` (131 lines). 17 audio/permission components (100% functional).

**Audio Pipeline:** `audioCapture.ts` (421 lines) — `AudioCaptureManager` singleton with macOS ScreenCaptureKit + Windows desktopCapturer + AudioWorklet pipeline at 16kHz.

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

### Competitive Differentiation

| Us vs Competition | Our Advantage |
|---|---|
| **100% Local Processing** | Audio never leaves device |
| **Offline-First** | Works without internet |
| **Ctrl+Enter Magic** | Brief note → AI-expanded sentence using transcript context |
| **Smart Chips** | Entities (people, dates, amounts, actions) as interactive colored chips |
| **Knowledge Graph** | Cross-meeting relationships, contradiction detection |

### Local Embedding Service (CRITICAL)
A lightweight `all-MiniLM-L6-v2` model (ONNX, 25MB) runs in main process for 384-dimensional vector embeddings locally. Solves the **Encrypted Search Paradox**: when sync is enabled, content is AES-256-GCM encrypted before upload — the server cannot generate embeddings from ciphertext. Client generates unencrypted embeddings locally alongside encrypted payload with `skip_server_embedding: true`.

---

## P2.2 Audio Pipeline (Capture → VAD → Chunks)

### Multi-Stage Pipeline Architecture

```typescript
// ─── audio-vad-worklet.ts (AudioWorklet processor, runs on audio thread) ───
class VADWorkletProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0]?.[0];
    if (input && input.length > 0) {
      this.port.postMessage({ type: 'audio_chunk', data: new Float32Array(input) });
    }
    return true;
  }
}
registerProcessor('vad-worklet', VADWorkletProcessor);

// ─── AudioPipeline.ts (Main process orchestrator) ───
class AudioPipeline {
  private audioContext: AudioContext;
  private stream: MediaStream;
  private workletNode: AudioWorkletNode;
  private vadWorker: Worker;
  private audioBuffer: Float32Array[] = [];
  
  async startCapture() {
    // Platform-specific capture
    if (process.platform === 'win32') this.stream = await this.captureWindows();
    else if (process.platform === 'darwin') this.stream = await this.captureMac();
    else throw new Error('Linux support coming soon');
    
    // Audio context at 16kHz (Whisper's expected sample rate)
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.stream);
    
    // AudioWorklet for real-time capture
    await this.audioContext.audioWorklet.addModule('./audio-vad-worklet.js');
    this.workletNode = new AudioWorkletNode(this.audioContext, 'vad-worklet');
    source.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
    
    // VAD in separate Worker Thread
    this.vadWorker = new Worker('./vad-worker.js');
    this.workletNode.port.onmessage = (e) => {
      if (e.data.type === 'audio_chunk') this.vadWorker.postMessage(e.data);
    };
    
    // Only buffer audio with detected speech
    this.vadWorker.on('message', (msg) => {
      if (msg.type === 'vad_result' && msg.hasVoice) {
        this.audioBuffer.push(msg.audioChunk);
        if (this.getDuration() >= 30) this.processChunk(); // 30-second chunks
      }
    });
  }
}
```

### Voice Activity Detection (VAD) — Silero

**Problem:** Transcribing silence wastes 40% of CPU.

```typescript
// ─── vad-worker.ts (Dedicated Worker Thread) ───
class SileroVAD {
  private model: any;
  private threshold = 0.5;
  
  async init() {
    const ort = require('onnxruntime-node');
    this.model = await ort.InferenceSession.create('./models/silero_vad.onnx');
  }
  
  async detect(audioChunk: Float32Array): Promise<boolean> {
    const tensor = new ort.Tensor('float32', audioChunk, [1, audioChunk.length]);
    const output = await this.model.run({ input: tensor });
    return output.output.data[0] > this.threshold;
  }
}
```

**Impact:** 40% CPU reduction, <10ms latency, runs on dedicated thread.

### Platform-Specific Capture

- **macOS:** ScreenCaptureKit (Electron 25+). Requires manual Screen Recording permission grant.
- **Windows:** `desktopCapturer` → Stereo Mix / System Audio source.
- **Fallback:** Microphone capture with `AudioFallbackNotification` toast.

---

## P2.3 Transcription Engine (Whisper Worker)

### Model Selection (Phase 0 Validated — Feb 2026)

| Model | Size | Speed (M4) | Accuracy | RAM | Target |
|-------|------|-------|----------|-----|--------|
| **turbo** | 1.6 GB | **51.8x RT** | ~10% WER | ~1.5 GB | ✅ **16GB machines** |
| **Moonshine Base** | ~250 MB | ~290x RT | 12% WER | ~300 MB | ✅ **8GB machines** |

```typescript
// whisper-worker.ts (separate Worker Thread)
const tier = detectHardwareTier();
const modelPath = tier.model === 'turbo'
  ? './models/ggml-large-v3-turbo.bin'
  : './models/moonshine-base.onnx';

function detectHardwareTier() {
  const totalRAM = Math.round(os.totalmem() / (1024 ** 3));
  return { ram: totalRAM, model: totalRAM >= 16 ? 'turbo' : 'moonshine' };
}

const model = await whisper.load({ modelPath, quantized: true, threads: 4 });

parentPort.on('message', async (msg) => {
  if (msg.type === 'transcribe') {
    const result = await model.transcribe(msg.audio, {
      language: 'en',
      word_timestamps: true,
      temperature: 0.0
    });
    parentPort.postMessage({ type: 'transcription', segments: result.segments });
  }
});
```

---

## P2.4 Local Embedding Service (Solves Encrypted Search Paradox)

```typescript
// ─── embedding-service.ts (Main Process, Singleton) ───
class LocalEmbeddingService {
  private session: ort.InferenceSession | null = null;
  
  async init() {
    this.session = await ort.InferenceSession.create('./models/all-MiniLM-L6-v2.onnx', {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all'
    });
  }
  
  async embed(text: string): Promise<Float32Array> {
    const tokens = encode(text).slice(0, 512);
    const feeds = {
      input_ids: new ort.Tensor('int32', new Int32Array(tokens), [1, tokens.length]),
      attention_mask: new ort.Tensor('int32', new Int32Array(tokens.length).fill(1), [1, tokens.length])
    };
    const output = await this.session.run(feeds);
    return this.meanPooling(output.last_hidden_state.data, tokens.length);
  }
}
```

### Integration with Sync (Encrypted Content + Unencrypted Embeddings)

```typescript
// SyncManager.ts — sends BOTH encrypted content AND searchable embeddings
async syncTranscript(transcript: Transcript) {
  const embedding = await embeddingService.embed(transcript.text);  // Before encryption
  const encryptedContent = await this.encrypt(transcript.text);      // AES-256-GCM
  
  await fetch(`${API_BASE}/api/v1/memories`, {
    body: JSON.stringify({
      namespace: 'meetings.transcripts',
      content: encryptedContent,
      embedding: Array.from(embedding),
      skip_server_embedding: true,  // CRITICAL
      metadata: { meeting_id, timestamp, speaker_id, encrypted: true }
    })
  });
}
```

### Local Semantic Search (Cmd+Shift+K offline)

Cosine similarity search across all locally-stored embeddings in SQLite. Each embedding ~1.5KB (384 floats). 1000 transcripts = ~1.5MB overhead. Search latency: ~100ms.

| Operation | Latency |
|-----------|---------|
| Model Load | ~200ms (one-time) |
| Single Embed | ~50ms |
| Batch Embed (10) | ~300ms |
| Local Search (1000 transcripts) | ~100ms |
| Memory Overhead | 25MB |

---

## P2.5 Real-Time Transcript Streaming

### Data Hooks (Powered by @tanstack/react-query)

```typescript
function useMeetings(params?: ListMeetingsParams) {
  // Infinite Queries with cursor pagination for 1000+ meetings
  // Avoids giant serialized JSON arrays over IPC bridge
}

function useCurrentMeeting(meetingId: string | null) {
  // useQuery wrapper around electronAPI.meeting.get(meetingId)
}

function useNotes(meetingId: string | null) {
  // useQuery + useMutation with optimistic updates / cache invalidation
}

function useTranscriptStream(meetingId: string | null) {
  // Subscribes to electronAPI.on.transcriptChunk()
  // CRITICAL: useEffect MUST return cleanup calling electronAPI.off()
  // Returns { segments, isStreaming, latestSegment }
  // Handles: auto-scroll, segment deduplication
}

function useLLMStream() {
  // Subscribes to electronAPI.on.llmToken()
  // CRITICAL: Strict listener cleanup on unmount
  // Returns { partialText, isGenerating, reset }
}

function useAudioStatus(meetingId: string | null) {
  // Subscribes to electronAPI.on.audioEvent()
  // Returns { isCapturing, audioLevel, captureMode, duration }
}

function useAudioSession() {
  // Full lifecycle: check platform → check permissions → start capture → monitor → stop
  // Returns { start, stop, status, mode, showPermissionFlow }
}
```

### Transcript Memory Management (2+ Hour Meetings)

When segment count exceeds **500**, older segments beyond the viewport are pruned from React state but remain queryable from SQLite via `electronAPI.transcript.getSegments({ offset, limit })`. Scrolling up triggers lazy re-hydration. Caps in-memory segments at ~500, prevents renderer from exceeding 200MB.

Every `<TranscriptSegment />` wrapped in `React.memo()` with shallow comparison on `segment.id`. Only the live streaming segment re-renders.

### Stubbed API Strategy

1. Hooks call IPC methods normally — stubs return `{ success: true, data: null }`
2. If `data` is null, UI shows `<EmptyState />` with "Coming soon"
3. No mock data — test with real data from functional `meeting` API
4. `useTranscriptStream` works with real `transcriptChunk` events once audio pipeline connected

---

## P2.6 AI Note Expansion (Ctrl+Enter → LLM)

### The Magic Flow

1. User types shorthand bullet: "Budget cuts"
2. Presses `Ctrl+Enter`
3. `<NoteExpansionLoader />` appears (pulsing violet dots)
4. Current bullet + nearby transcript context sent to Qwen 2.5 3B
5. AI-expanded text streams in, styled italic `--color-violet`
6. `<MagicExpansion />` node shows 🤖 trust badge + `✕ Reject` ghost button on hover

### Critical Implementation Rules

**Tiptap Transaction Atomicity:** The entire AI expansion MUST be committed as a **single ProseMirror `Transaction`**. If appended node-by-node, `Ctrl+Z` would undo one letter at a time (catastrophically annoying). Wrapping in `editor.chain().focus().insertContent(expandedContent).run()` makes `Ctrl+Z` collapse the entire AI block in one keystroke.

**AI Trust Badges:** All AI-generated text shows 🤖 badge inline. Human-written text has no badge (optional ✍️ on hover). Instantly scannable which content is AI vs human.

**Bidirectional Source Anchors:** When `Ctrl+Enter` expands, it tags the note with IDs of transcript segments used as context. Clicking the 🤖-badged note highlights source segments in the transcript with a violet pulse. Builds absolute trust via source attribution.

---

## P2.7 Yjs CRDT Multi-Device Sync

When sync is enabled, notes edited in Tiptap use **Yjs** for character-level CRDT merging instead of last-write-wins JSON sync (which breaks under concurrent edits). Dependencies: `yjs`, `y-indexeddb`, `@tiptap/extension-collaboration`.

---

## P2.8 Transcript ↔ Notes Symbiosis

| Interaction | Behavior | UX Value |
|-------------|----------|----------|
| **Drag & Drop** | Dragging a transcript segment into notes creates a styled blockquote with linked timestamp | Frictionless exact-quote capture |
| **Bidirectional Anchors** | AI-expanded notes link back to source transcript segments; clicking highlights sources | Source attribution builds trust |
| **Click-to-Play** | Clicking any timestamp jumps audio playback to that millisecond | Instant contextual recall |
| **Slash Commands** | `/action`, `/decision`, `/summarize-last-5m` | Power-user speed |
| **Speaker Heatmap** | Color-coded audio timeline by speaker diarization color | Visual scan for "who spoke when" |

---

## P2.9 Silent AI Prompter (Live Coaching)

If user selected a structured meeting template (e.g., "Sales Discovery"), the `DynamicIsland` becomes a live coach:

- Template defines required discussion topics (e.g., Budget, Authority, Need, Timeline)
- AI monitors live transcript for topic coverage
- If 30+ minutes pass and a topic is missed, Island pulses ghost text: _"Consider asking about the allocated budget."_
- Suggestion fades after 10 seconds or dismissed with click
- 100% local processing

---

## P2.10 Global Context Recovery — RAG Pipeline (Cmd+Shift+K)

A 3-stage RAG pipeline using local models:

| Stage | What Happens | Why |
|-------|-------------|-----|
| **1. Vectorize Query** | User question → 384-dim vector via all-MiniLM-L6-v2 | Transforms text into searchable numeric representation |
| **2. Retrieve Top-K** | Query vector against sqlite-vec/FAISS for top 5 chunks. BM25 keyword search in parallel | Local LLMs have 8k–32k context windows. Only 5 chunks (~2000 tokens) keeps LLM fast and accurate |
| **3. Synthesize** | 5 chunks + question → Qwen generates 2–3 sentence answer with source citations | Focused context = accurate answer in ~1–2s |

**Query Quota Fallback:** Cloud users (Pro) get monthly quota (e.g., 50 queries). When exhausted, silently falls back to local Qwen pipeline — reduced accuracy but zero downtime. `<GlobalContextBar />` shows: `"4 cloud queries left"` → `"Local mode"`.

---

## P2.11 Post-Meeting Intelligence (AI Synthesis + Export)

When user clicks **Stop**, UI transitions from "Capture Mode" to "Output Mode":

- **Executive Summary** (3 sentences max)
- **Action Items** with auto-detected assignees (from speaker names)
- **Key Decisions** with confidence scores
- **Pinned Moments** (user-starred segments aggregated)

**Action Item Lifecycle:** "Push" button creates native OS reminder (macOS Reminders / Windows To Do) with deep-link `piyapi://meeting/123#segment-456` back to exact transcript moment.

**Export:**
- Copy as Markdown (Obsidian/Notion)
- Export as PDF
- Copy as Slack Message (bold headers, @mentions)
- Copy for Email (clean HTML)
- Copy raw Transcript

---

## P2.12 Battery-Aware Power Management

```typescript
function usePowerMode() {
  // Returns: { mode: 'performance' | 'balanced' | 'eco', isOnBattery: boolean }
  // AC power          → 'performance' (4 threads, Whisper + Qwen concurrent)
  // Battery, cool     → 'balanced'    (2 threads, Qwen single-thread)
  // Battery, critical → 'eco'         (1 thread, Qwen disabled — queued until plug-in)
  //
  // DynamicIsland shows: ⚡ Performance | 🔋 Balanced | 🪫 Eco Mode
  // In 'eco': Ctrl+Enter shows "AI expansion paused — plug in to resume"
}

function useQueryQuota() {
  // Tracks cloud query quota + handles silent fallback to local
}
```

---

## P2.13 Database Optimizations

### SQLite WAL Mode

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA wal_autocheckpoint = 1000;  -- Auto-checkpoint every ~4MB
```

**On Meeting Stop:** Manual `PRAGMA wal_checkpoint(TRUNCATE)` to merge WAL into main DB and reclaim disk space.

**During Recording:** Passive checkpoint every 10 minutes:
```typescript
walCheckpointInterval = setInterval(() => {
  db.pragma('wal_checkpoint(PASSIVE)');
}, 10 * 60 * 1000);

// Emergency: if -wal > 500MB, force passive checkpoint
async function checkWalHealth() {
  const walSize = (await fs.stat(dbPath + '-wal')).size;
  if (walSize > 500 * 1024 * 1024) db.pragma('wal_checkpoint(PASSIVE)');
}
```

### Memory Management Budgets

| Resource | Budget | Enforcement |
|----------|--------|-------------|
| Transcript segments in React state | ≤ 500 | Older segments pruned, lazy-loaded on scroll-up |
| Tiptap editor nodes | ≤ 200 | Long notes paginate or collapse |
| Renderer process RAM | ≤ 200MB | DevTools profiling required if exceeded |
| IPC payload per call | ≤ 100KB | Large datasets use cursor pagination |

---

## P2.14 macOS Permission Recovery

macOS has a critical UX trap: clicking "Deny" on Screen Recording/Microphone **permanently blocks** the native prompt. The user must manually navigate to System Settings.

```typescript
// In PermissionRequestFlow.tsx:
if (permissionStatus === 'denied') {
  const openSystemSettings = () => {
    window.electronAPI.shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    );
  };
  // Show: "Permission was denied. Click here to fix it in System Settings."
}
```

This fallback MUST be implemented. Without it, users who clicked "Deny" see a broken app with no recovery.

---

## P2.15 Scope Boundaries (What NOT to Build Yet)

| Feature | Why Not Now | When |
|---------|-----------|------|
| Smart Chip insertion from transcript | Requires entity extraction backend | Phase 8 (Week 15) |
| Knowledge Graph visualization (d3-force) | Requires cloud graph API | Phase 8 (Week 15) |
| Weekly Digest view | Requires cloud digest API | Phase 8 (Week 17) |
| Onboarding flow (signup/login) | Requires auth backend | Phase 6 (Week 9) |
| Pricing/upgrade wall | Requires payment integration | Phase 9 (Week 19) |
| Cross-meeting AI (/ask) | Requires cloud RAG API | Phase 8 (Week 16) |
| Real-time transcript streaming | Requires Whisper worker thread | Phase 3 (Week 5) |

---

## P2.16 Phase 2 Implementation Sequence

### Day 5: Data Layer + Transcript Streaming
1. Create `useMeetings`, `useCurrentMeeting`, `useNotes` hooks with @tanstack/react-query
2. Create `useTranscriptStream` hook with IPC subscription + cleanup
3. Create `useAudioStatus` hook
4. Wire `MeetingCard` → real `meeting.list()` data
5. Wire `MeetingListView` → `useMeetings` with infinite scroll
6. Wire "Start Meeting" → `meeting.start()` → navigate to detail

### Day 6: Audio + Notes + AI
7. Install Tiptap extensions: `@tiptap/extension-bullet-list`, `@tiptap/extension-collaboration`
8. Install Yjs: `yjs`, `y-indexeddb`
9. Wire `NoteEditor` → real `note.update()` with debounced auto-save
10. Create `useLLMStream` hook
11. Wire `Ctrl+Enter` → `intelligence.expandNote()` → `MagicExpansion` with source anchors
12. Create `usePowerMode` hook (battery-aware AI scheduling)
13. Create `useAudioSession` hook (full lifecycle)
14. Integrate `AudioCaptureWithPermissions` into recording start flow
15. Build `AudioIndicator` with real audio levels (OffscreenCanvas)
16. Wire "Stop Meeting" → `audio.stopCapture()` → `meeting.stop()` → update UI

### Day 7: Polish, Wire Remaining, Verify
17. Build `CommandPalette` search → real `search.fullText()` IPC
18. Wire `PostMeetingDigest` → real AI synthesis (summary, actions, decisions)
19. Wire export buttons (Markdown, PDF, Slack, Email, raw)
20. Wire `OfflineBanner` → real network status detection
21. Wire `SyncStatusIndicator` → real sync status
22. Test meeting CRUD: create → list → view → update title → delete
23. Test audio permission flows on macOS
24. Verify TypeScript: `npx tsc --noEmit`
25. Verify build: `npm run dev` + `npm run electron:dev`
26. Walk through every screen for visual + functional correctness

---

## P2.17 Phase 2 Verification

### Automated
```bash
npx tsc --noEmit
npm run dev
npm run electron:dev
```

### Functional Checklist
- [ ] "Start Meeting" creates a real meeting in SQLite
- [ ] Audio capture starts (system audio or microphone fallback)
- [ ] Live transcript segments stream into TranscriptPanel
- [ ] Speaker diarization colors are assigned correctly
- [ ] Smart Chips render for detected entities
- [ ] Note Editor saves to SQLite (verify with DB query)
- [ ] Ctrl+Enter triggers AI expansion with violet styling
- [ ] AI expansion can be rejected (✕ button reverts to original)
- [ ] Ctrl+Z undoes entire AI expansion in one keystroke
- [ ] "Stop Meeting" updates duration and transitions to output mode
- [ ] Post-Meeting Digest shows summary, actions, decisions
- [ ] Export buttons produce correct output formats
- [ ] Command Palette search returns real results
- [ ] Meeting title editable inline (optimistic UI)
- [ ] Meeting deletable from context menu
- [ ] Audio permission denial shows recovery UI on macOS
- [ ] Offline banner appears/disappears with network changes
- [ ] All 17 existing audio components remain functional
- [ ] No memory leaks after 30+ minute simulated meeting
- [ ] No console errors in development

---

## P2.18 piytes.md Audit Cross-Reference (22-Point Fix Tracker)

> **Source:** Deep analysis of `piytes.md` (2945 lines) cross-referenced with 96.7% API test validation (88/91 PASS).

### Frontend-Impacting Fixes

| # | Issue | Where Fixed | Status |
|---|-------|-------------|--------|
| 1 | **Encrypted Search Paradox** — Client must generate local embeddings + `skip_server_embedding: true` | P2.4 (Embedding Service) | ✅ Injected |
| 6 | **Yjs CRDT for Tiptap Notes** — Replace LWW sync with Yjs binary updates | P2.7 | ✅ Injected |
| 7 | **Battery-Aware Orchestration** | P2.12 (`usePowerMode`) | ✅ Injected |
| 9 | **AI Trust Badges** — 🤖 on AI text, bidirectional source highlighting | P2.6 | ✅ Injected |
| 10 | **WAL Checkpoint** — autocheckpoint + TRUNCATE on stop | P2.13 | ✅ Injected |
| 22 | **Query Quota Fallback** — Silent fallback to local Qwen | P2.10 | ✅ Injected |

### Backend Fixes (Must Be Applied to piytes.md)

| # | Issue | Fix Required | Priority |
|---|-------|-------------|----------|
| 2 | **Auth Endpoint Paths** — Must use `/api/v1/auth/*` not `/auth/*` | Fix in `piytes.md` | ⚠️ |
| 3 | **Namespace Format** — Dots not slashes: `meetings.transcripts` | Fix in `piytes.md` | ⚠️ |
| 4 | **Batch Sync** — Each transcript segment as individual memory | Rewrite `sync()` to loop per-event | 🔴 Critical |
| 5 | **HKDF Salt/Info Reversed** — Salt empty, purpose in info param | Fix `crypto.hkdfSync()` | 🔴 Critical |
| 8 | **Dodo Payments > Lemon Squeezy** | Update payment strategy | 🟡 Phase 9 |
| 11 | **embedding_status returns 'ready' not 'completed'** | Check `=== 'ready'` in client | 🟡 Phase 5 |
| 12 | **Export downloadUrl is relative** — Prepend `API_BASE` | URL construction in SyncManager | 🟡 Phase 6 |
| 13 | **Graph types = 0 in production** | Need triggering content patterns | 🟡 Phase 8 |
| 17 | **Embedding status polling** — Wait ~4s after creation | Add polling/delay in SyncManager | 🟡 Phase 6 |
| 18 | **Content size limit ~30KB** — Chunk to max 20KB per memory | Add chunking in SyncManager | 🔴 Phase 6 |
| 19 | **Compliance DELETE needs undocumented params** | Investigate before GDPR impl | 🟡 Phase 8 |
| 20 | **API Key Exposed** — Rotate and replace with placeholder | Fix in `piytes.md` | ⚠️ |
| 21 | **RAM Table References Phi-3** — Should be Qwen 2.5 3B | Fix in `piytes.md` | ⚠️ |
