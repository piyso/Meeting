# PiyAPI Notes — UI/UX Phase 1 Implementation Guide
## AI-Optimized · 9 Self-Contained Parts

> **Purpose:** Every spec value is explicit. Every file has an exact path. Every instruction is imperative. Follow parts 1–9 sequentially. Each part lists prerequisites and verification steps.
>
> **Source:** Extracted from `frontend_blueprint_v2.md` P1.1–P1.13.

---

# ═══════════════════════════════════════════
# PART 1 — PROJECT SETUP
# ═══════════════════════════════════════════

## Prerequisites
- Node.js ≥ 18, npm ≥ 9
- Existing Electron + React + TypeScript project at project root
- Existing `src/renderer/` directory with `main.tsx`, `App.tsx`, `audioCapture.ts`
- Existing 17 audio/permission components in `src/renderer/components/audio/`

## 1.1 Install Phase 1 Dependencies

Run this exact command:

```bash
npm install zustand lucide-react @tiptap/react @tiptap/starter-kit @tiptap/extension-bullet-list @tiptap/extension-collaboration @tanstack/react-query @tanstack/react-virtual yjs y-indexeddb
```

## 1.2 Download & Bundle Fonts

1. Download Geist fonts from [vercel/geist-font releases](https://github.com/vercel/geist-font/releases). You need `.woff2` format only.
2. Create directory `resources/fonts/` at project root.
3. Place these exact files:

```
resources/fonts/
├── geist-regular.woff2
├── geist-medium.woff2
├── geist-semibold.woff2
├── geist-bold.woff2
└── geist-mono-regular.woff2
```

## 1.3 Create File Tree

Create all directories and empty files. Every path is relative to project root.

```
src/renderer/
├── main.tsx                              # ✅ EXISTS — keep
├── App.tsx                               # ✅ EXISTS — rewrite in Part 6
├── index.css                             # ✅ EXISTS — replace in Part 2
├── audioCapture.ts                       # ✅ EXISTS — keep
│
├── store/
│   └── appStore.ts                       # NEW — Part 4
│
├── hooks/
│   ├── useToast.ts                       # NEW — Part 4
│   └── useKeyboardShortcuts.ts           # NEW — Part 4
│
├── components/
│   ├── ui/                               # NEW — Part 5
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
│   │   ├── Skeletons.tsx
│   │   └── SplitPane.tsx
│   │
│   ├── layout/                           # NEW — Part 6
│   │   ├── DynamicIsland.tsx
│   │   ├── ZenRail.tsx
│   │   ├── AppLayout.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── OfflineBanner.tsx
│   │
│   ├── meeting/                          # NEW — Parts 7 & 8
│   │   ├── MeetingCard.tsx
│   │   ├── TranscriptPanel.tsx
│   │   ├── TranscriptSegment.tsx
│   │   ├── SmartChip.tsx
│   │   ├── NoteEditor.tsx
│   │   ├── NoteExpansionLoader.tsx
│   │   ├── MagicExpansion.tsx
│   │   ├── PostMeetingDigest.tsx
│   │   ├── SpeakerHeatmap.tsx
│   │   ├── AudioIndicator.tsx
│   │   ├── RecordingTimer.tsx
│   │   ├── MiniWidget.tsx
│   │   ├── SilentPrompter.tsx
│   │   └── NewMeetingDialog.tsx
│   │
│   ├── command/                          # NEW — Part 7
│   │   ├── CommandPalette.tsx
│   │   └── GlobalContextBar.tsx
│   │
│   ├── audio/                            # ✅ EXISTS — keep all 17 files
│   │
│   └── settings/                         # NEW — Part 9
│       └── SettingsView.tsx
│
└── views/                                # NEW — Parts 7 & 8
    ├── MeetingListView.tsx
    ├── MeetingDetailView.tsx
    └── SettingsView.tsx
```

## 1.4 Delete Obsolete File

Delete `src/renderer/App.css` — replaced by Zen Glass tokens in `index.css`.

## Part 1 Verification

- [ ] All dependencies installed without errors (`node_modules/zustand`, `node_modules/@tiptap/react`, etc. exist)
- [ ] `resources/fonts/` contains 5 `.woff2` files
- [ ] All directories created under `src/renderer/`
- [ ] `App.css` deleted

---

# ═══════════════════════════════════════════
# PART 2 — DESIGN SYSTEM CSS
# ═══════════════════════════════════════════

## Prerequisites
- Part 1 complete
- Font files in `resources/fonts/`

## 2.1 Replace `src/renderer/index.css`

Delete all existing content. Write this complete file:

```css
/* ════════════════════════════════════════════════
   PiyAPI Notes — Zen Glass Design System
   Complete token system + effects + utilities
   ════════════════════════════════════════════════ */

/* ── Font Face Declarations (MUST be first) ── */
@font-face {
  font-family: 'Geist';
  src: url('../resources/fonts/geist-regular.woff2') format('woff2');
  font-weight: 400;
  font-display: block;
}
@font-face {
  font-family: 'Geist';
  src: url('../resources/fonts/geist-medium.woff2') format('woff2');
  font-weight: 500;
  font-display: block;
}
@font-face {
  font-family: 'Geist';
  src: url('../resources/fonts/geist-semibold.woff2') format('woff2');
  font-weight: 600;
  font-display: block;
}
@font-face {
  font-family: 'Geist';
  src: url('../resources/fonts/geist-bold.woff2') format('woff2');
  font-weight: 700;
  font-display: block;
}
@font-face {
  font-family: 'Geist Mono';
  src: url('../resources/fonts/geist-mono-regular.woff2') format('woff2');
  font-weight: 400;
  font-display: block;
}

/* ── CSS Custom Properties (Design Tokens) ── */
:root {
  /* Base Surfaces (Infinite Depth) */
  --color-bg-root:         #030303;
  --color-bg-panel:        rgba(15, 15, 17, 0.6);
  --color-bg-glass:        rgba(255, 255, 255, 0.02);
  --color-bg-glass-hover:  rgba(255, 255, 255, 0.05);

  /* Borders & Lights */
  --color-border-inset:    rgba(255, 255, 255, 0.04);
  --color-border-subtle:   rgba(255, 255, 255, 0.08);
  --color-glow-violet:     rgba(139, 92, 246, 0.15);

  /* Text Hierarchy (High Contrast) */
  --color-text-primary:    #FFFFFF;
  --color-text-secondary:  #A1A1AA;
  --color-text-tertiary:   #52525B;

  /* Semantic Accents (Desaturated & Elegant) */
  --color-emerald:         #34D399;
  --color-amber:           #FBBF24;
  --color-violet:          #A78BFA;
  --color-rose:            #FB7185;

  /* Premium Smart Chip Entities */
  --chip-person-bg:        rgba(96, 165, 250, 0.08);
  --chip-person-text:      #93C5FD;
  --chip-date-bg:          rgba(52, 211, 153, 0.08);
  --chip-date-text:        #6EE7B7;
  --chip-amount-bg:        rgba(251, 191, 36, 0.08);
  --chip-amount-text:      #FCD34D;
  --chip-action-bg:        rgba(251, 113, 133, 0.08);
  --chip-action-text:      #FDA4AF;

  /* Typography */
  --font-heading:    'Geist', 'Inter', system-ui, sans-serif;
  --font-body:       'Geist', 'Inter', system-ui, sans-serif;
  --font-mono:       'Geist Mono', 'JetBrains Mono', monospace;

  /* Type Scale */
  --text-xs:    0.75rem;
  --text-sm:    0.875rem;
  --text-base:  1rem;
  --text-lg:    1.125rem;
  --text-xl:    1.5rem;
  --text-2xl:   2rem;

  /* Tracking */
  --tracking-tight: -0.02em;
  --tracking-wide:   0.05em;

  /* Structural Spacing (8px Grid) */
  --space-8:  8px;
  --space-16: 16px;
  --space-24: 24px;
  --space-32: 32px;
  --space-64: 64px;

  /* Component Internal Flow (4px Grid) */
  --space-4:  4px;
  --space-12: 12px;
  --space-20: 20px;

  /* Native Component Heights */
  --h-sm: 24px;
  --h-md: 32px;
  --h-lg: 40px;
  --h-xl: 48px;

  /* Radii (Squircle Math) */
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   16px;
  --radius-xl:   20px;
  --radius-full: 9999px;

  /* Timing Functions */
  --ease-spring:       cubic-bezier(0.175, 0.885, 0.32, 1.1);
  --ease-fluid:        cubic-bezier(0.16, 1, 0.3, 1);
  --ease-snappy:       cubic-bezier(0.4, 0, 0.2, 1);

  --transition-fast:   150ms var(--ease-snappy);
  --transition-base:   300ms var(--ease-fluid);
  --transition-slow:   500ms var(--ease-fluid);
}

/* ── Global Reset ── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
  background: var(--color-bg-root);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
}

/* ── Premium Glass Texture Formula ── */
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

/* ── Film Grain Noise Overlay ── */
.with-noise::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
  opacity: 0.03;
  mix-blend-mode: overlay;
  pointer-events: none;
  border-radius: inherit;
}

/* ── Premium Hover Effect ── */
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
/* JS applies: style="animation-delay: ${index * 40}ms" per child. Max 12 staggered, rest instant. */

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

/* ── GPU Compositing (apply to max 10 elements) ── */
.gpu-promoted {
  will-change: transform;
  transform: translateZ(0);
  contain: layout style paint;
}

/* ── Skeleton Shimmer ── */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.03) 25%,
    rgba(255, 255, 255, 0.06) 50%,
    rgba(255, 255, 255, 0.03) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}

/* ── Slide Up Animation (for Dialogs) ── */
@keyframes slide-up {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Drag Region (macOS title bar) ── */
.drag-region {
  -webkit-app-region: drag;
}
.no-drag {
  -webkit-app-region: no-drag;
}
```

## Part 2 Verification

- [ ] `src/renderer/index.css` contains all tokens listed above
- [ ] No `var(--...)` references any undefined token
- [ ] All 5 `@font-face` declarations are present before `:root`
- [ ] `.surface-glass-premium`, `.premium-hover`, `.stagger-child`, `.skeleton`, `.gpu-promoted` classes exist
- [ ] `.window-blurred` overrides 3 custom properties
- [ ] SVG noise data URI is complete (not truncated)

---

# ═══════════════════════════════════════════
# PART 3 — ELECTRON & HTML CONFIGURATION
# ═══════════════════════════════════════════

## Prerequisites
- Part 2 complete (index.css ready)

## 3.1 Update `electron/main.ts` — BrowserWindow Config

Find the `new BrowserWindow({...})` call. Set these exact properties:

```typescript
mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  titleBarStyle: 'hiddenInset',
  trafficLightPosition: { x: 16, y: 12 },
  frame: process.platform === 'darwin' ? true : false,
  // ... keep all existing webPreferences unchanged
})
```

| Property | Value | Rationale |
|----------|-------|-----------|
| `titleBarStyle` | `'hiddenInset'` | macOS hidden title bar with inset traffic lights |
| `trafficLightPosition` | `{ x: 16, y: 12 }` | Precise traffic light placement for Zen Rail alignment |
| `frame` | `true` on macOS, `false` on Windows | Frameless on Windows for custom chrome |
| `minWidth` | `800` | Minimum graceful resize target |
| `minHeight` | `600` | Minimum graceful resize target |

## 3.2 Update `index.html` — Splash Shell

Add font preload in `<head>` and inline splash CSS. The splash ensures void black + centered logo pulse on first frame — no white flash.

Add inside `<head>`:

```html
<link rel="preload" href="resources/fonts/geist-regular.woff2" as="font" type="font/woff2" crossorigin>
<style>
  /* Inline splash — renders before any JS loads */
  body {
    margin: 0;
    background: #030303;
    overflow: hidden;
  }
  #splash {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #030303;
    z-index: 9999;
  }
  #splash .logo {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(167, 139, 250, 0.15);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.05); }
  }
</style>
```

Add as first child of `<body>`:

```html
<div id="splash"><div class="logo"></div></div>
<div id="root"></div>
```

Remove the splash in `main.tsx` after React mounts:

```typescript
// At end of main.tsx, after ReactDOM.createRoot(...).render(...)
const splash = document.getElementById('splash');
if (splash) splash.remove();
```

## Part 3 Verification

- [ ] `electron/main.ts` has `titleBarStyle: 'hiddenInset'` and `trafficLightPosition: { x: 16, y: 12 }`
- [ ] `index.html` preloads `geist-regular.woff2`
- [ ] `index.html` inline CSS sets `body { background: #030303 }`
- [ ] Splash div renders void black with centered violet pulse
- [ ] React mount removes splash div
- [ ] App launches without white flash

---

# ═══════════════════════════════════════════
# PART 4 — STATE & HOOKS
# ═══════════════════════════════════════════

## Prerequisites
- Part 1 complete (`zustand` installed)

## 4.1 Create `src/renderer/store/appStore.ts`

```typescript
import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number; // ms, default 5000
}

interface AppState {
  // ── Navigation ──
  activeView: 'meeting-list' | 'meeting-detail' | 'settings';
  selectedMeetingId: string | null;

  // ── Recording ──
  recordingState: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing';
  activeMeetingId: string | null;
  audioMode: 'system' | 'microphone' | 'none';

  // ── Connectivity ──
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncTimestamp: number | null;

  // ── UI State ──
  focusMode: boolean;
  commandPaletteOpen: boolean;
  toasts: Toast[];

  // ── Actions ──
  navigate: (view: AppState['activeView'], meetingId?: string) => void;
  setRecordingState: (state: AppState['recordingState'], mode?: AppState['audioMode']) => void;
  toggleFocusMode: () => void;
  toggleCommandPalette: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  // Navigation
  activeView: 'meeting-list',
  selectedMeetingId: null,

  // Recording
  recordingState: 'idle',
  activeMeetingId: null,
  audioMode: 'none',

  // Connectivity
  isOnline: navigator.onLine,
  syncStatus: 'idle',
  lastSyncTimestamp: null,

  // UI State
  focusMode: false,
  commandPaletteOpen: false,
  toasts: [],

  // Actions
  navigate: (view, meetingId) =>
    set({ activeView: view, selectedMeetingId: meetingId ?? null }),

  setRecordingState: (recordingState, audioMode) =>
    set((s) => ({ recordingState, audioMode: audioMode ?? s.audioMode })),

  toggleFocusMode: () =>
    set((s) => ({ focusMode: !s.focusMode })),

  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
```

**Why Zustand:** Zero provider wrapping, <1KB bundle, atomic updates (ZenRail never re-renders when transcript updates).

## 4.2 Create `src/renderer/hooks/useToast.ts`

```typescript
import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';

export function useToast() {
  const toasts = useAppStore((s) => s.toasts);
  const addToast = useAppStore((s) => s.addToast);
  const removeToast = useAppStore((s) => s.removeToast);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    toasts.forEach((toast) => {
      const duration = toast.duration ?? 5000;
      const timer = setTimeout(() => removeToast(toast.id), duration);
      timers.push(timer);
    });
    return () => timers.forEach(clearTimeout);
  }, [toasts, removeToast]);

  const toast = useCallback(
    (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => {
      addToast({ type, title, message });
    },
    [addToast]
  );

  return { toasts, toast, removeToast };
}
```

## 4.3 Create `src/renderer/hooks/useKeyboardShortcuts.ts`

```typescript
import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';

export function useKeyboardShortcuts() {
  const toggleCommandPalette = useAppStore((s) => s.toggleCommandPalette);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const navigate = useAppStore((s) => s.navigate);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K → Command Palette (actions)
      if (meta && !e.shiftKey && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }

      // Cmd+Shift+K → Semantic Search (content, wired in Phase 2)
      if (meta && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        // TODO Phase 2: open semantic search overlay
      }

      // Cmd+N → New Meeting dialog
      if (meta && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        // Dispatched via custom event; NewMeetingDialog listens
        window.dispatchEvent(new CustomEvent('open-new-meeting'));
      }

      // Cmd+Shift+F → Focus Mode (collapse Zen Rail)
      if (meta && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        toggleFocusMode();
      }

      // Cmd+Shift+M → Mini Widget (always-on-top floating pill)
      if (meta && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        // TODO Phase 2: toggle mini widget via IPC
      }

      // Cmd+\ → Toggle split pane orientation
      if (meta && e.key === '\\') {
        e.preventDefault();
        // Dispatched via custom event; SplitPane listens
        window.dispatchEvent(new CustomEvent('toggle-split-orientation'));
      }

      // Cmd+J → Collapse/expand notes pane
      if (meta && !e.shiftKey && e.key === 'j') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('toggle-notes-pane'));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCommandPalette, toggleFocusMode, navigate]);
}
```

## Part 4 Verification

- [ ] `appStore.ts` exports `useAppStore` with all 11 state fields and 6 actions
- [ ] `useAppStore.getState().activeView` returns `'meeting-list'`
- [ ] `useToast` auto-dismisses toasts after 5000ms (default)
- [ ] `useKeyboardShortcuts` registers 7 shortcuts without errors
- [ ] TypeScript compiles: `npx tsc --noEmit` passes for these 3 files

---

# ═══════════════════════════════════════════
# PART 5 — UI PRIMITIVES
# ═══════════════════════════════════════════

## Prerequisites
- Part 2 complete (index.css tokens available)
- `lucide-react` installed

## 5.1 Create `src/renderer/components/ui/Button.tsx`

```tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}

/*
  Styles:
  - primary:   bg var(--color-violet), text #FFFFFF, height var(--h-lg) (40px)
  - secondary: bg var(--color-bg-glass), border 1px var(--color-border-subtle), height var(--h-md) (32px)
  - ghost:     bg transparent, text var(--color-text-secondary), height var(--h-md) (32px)
  - danger:    bg transparent, text var(--color-rose), hover bg rgba(251,113,133,0.1)
  - padding:   px var(--space-12)
  - radius:    var(--radius-sm) (6px)
  - font:      var(--font-body), var(--text-sm), font-weight 500
  - hover:     Apply .premium-hover class effect
  - disabled:  opacity 0.5, cursor not-allowed
  - loading:   Show pulsing opacity animation, disable click
  - icon:      Render left of text with var(--space-4) gap
*/

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', icon, loading, children, ...props }) => {
  // Implementation: apply styles based on variant/size, render icon + children
  return <button {...props}>{icon}{children}</button>;
};
```

## 5.2 Create `src/renderer/components/ui/IconButton.tsx`

```tsx
import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  size?: 'sm' | 'md';
  tooltip?: string;
  active?: boolean;
}

/*
  Styles:
  - sm: 24×24px
  - md: 32×32px
  - bg: transparent
  - hover: bg var(--color-bg-glass-hover), icon scales 1.1x
  - active: bg var(--color-bg-glass), border 1px var(--color-border-subtle)
  - radius: var(--radius-sm)
  - transition: var(--transition-fast)
  - center icon with flexbox
*/
```

## 5.3 Create `src/renderer/components/ui/Input.tsx`

```tsx
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

/*
  Styles:
  - height: var(--h-md) (32px)
  - padding: 0 var(--space-12)
  - bg: var(--color-bg-glass)
  - border: 1px solid var(--color-border-subtle)
  - radius: var(--radius-md) (10px)
  - font: var(--font-body), var(--text-sm)
  - color: var(--color-text-primary)
  - placeholder color: var(--color-text-tertiary)
  - focus: border-color var(--color-violet), box-shadow 0 0 0 1px var(--color-glow-violet)
  - error: border-color var(--color-rose)
  - icon: position absolute left, input padding-left 32px
  - label: display above, var(--text-xs), var(--color-text-secondary), margin-bottom var(--space-4)
*/
```

## 5.4 Create `src/renderer/components/ui/Select.tsx`

```tsx
import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

/*
  Styles: Same as Input (height, bg, border, radius, font, focus glow)
  - Custom dropdown arrow icon (lucide ChevronDown), positioned right
  - appearance: none (remove native select style)
*/
```

## 5.5 Create `src/renderer/components/ui/Toggle.tsx`

```tsx
import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/*
  Styles:
  - Track: 40px wide × var(--h-sm) (24px) tall
  - Thumb: 20px × 20px circle, 2px inset from track edge
  - Track off: bg var(--color-bg-glass), border 1px var(--color-border-subtle)
  - Track on: bg var(--color-violet)
  - Thumb: bg #FFFFFF
  - Transition: transform var(--ease-spring) 300ms (spring animation on thumb slide)
  - Disabled: opacity 0.5, cursor not-allowed
  - Label: var(--text-sm), var(--color-text-secondary), right of toggle with var(--space-8) gap
*/
```

## 5.6 Create `src/renderer/components/ui/Badge.tsx`

```tsx
import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'violet';
}

/*
  Styles:
  - height: var(--h-sm) (24px)
  - padding: 0 var(--space-8)
  - radius: var(--radius-sm) (6px)
  - font: var(--text-xs), font-weight 500
  - display: inline-flex, align-items center
  - default:  bg var(--color-bg-glass), text var(--color-text-secondary)
  - success:  bg rgba(52,211,153,0.1), text var(--color-emerald)
  - warning:  bg rgba(251,191,36,0.1), text var(--color-amber)
  - error:    bg rgba(251,113,133,0.1), text var(--color-rose)
  - violet:   bg rgba(167,139,250,0.1), text var(--color-violet)
  - Static — no hover effects
*/
```

## 5.7 Create `src/renderer/components/ui/Tooltip.tsx`

```tsx
import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number; // ms, default 400
}

/*
  Styles:
  - bg: #1a1a1e
  - border: 1px solid var(--color-border-subtle)
  - padding: var(--space-4) var(--space-8)
  - radius: var(--radius-sm)
  - font: var(--text-xs), var(--color-text-secondary)
  - box-shadow: 0 4px 12px rgba(0,0,0,0.4)
  - Enter animation: fade + slide 4px from opposite of position, 150ms var(--ease-snappy)
  - z-index: 1000
  - Show after delay (default 400ms hover)
*/
```

## 5.8 Create `src/renderer/components/ui/Dialog.tsx`

```tsx
import React from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: number; // px, default 480
}

/*
  Styles:
  - Backdrop: position fixed, inset 0, bg rgba(0,0,0,0.6), backdrop-filter blur(8px), z-index 100
  - Panel: centered, width (default 480px), max-height 80vh, overflow-y auto
  - Panel applies .surface-glass-premium class
  - Panel padding: var(--space-24) (24px)
  - Panel enter animation: slide-up keyframe 300ms var(--ease-fluid)
  - Title: var(--text-lg), font-weight 600, var(--tracking-tight), margin-bottom var(--space-16)
  - Close on backdrop click and Escape key
  - PERFORMANCE: This is one of max 3 active blur surfaces
*/
```

## 5.9 Create `src/renderer/components/ui/ContextMenu.tsx`

```tsx
import React from 'react';

interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

/*
  Styles:
  - position: fixed at { x, y } (click coordinates)
  - min-width: 160px
  - bg: rgba(30, 30, 34, 0.95)
  - backdrop-filter: blur(16px) saturate(120%)
  - border: 1px solid var(--color-border-subtle)
  - radius: var(--radius-md) (10px)
  - padding: var(--space-4) 0
  - box-shadow: 0 8px 32px rgba(0,0,0,0.5)
  - z-index: 200
  - Each item: height 32px, padding 0 var(--space-12), font var(--text-sm)
  - Item hover: bg var(--color-bg-glass-hover)
  - Danger item: text var(--color-rose)
  - Separator: 1px solid var(--color-border-subtle), margin var(--space-4) 0
  - Shortcut text: float right, var(--text-xs), var(--color-text-tertiary)
  - Close on click outside or Escape
*/
```

## 5.10 Create `src/renderer/components/ui/Toast.tsx`

```tsx
import React from 'react';
import type { Toast as ToastType } from '../../store/appStore';

interface ToastContainerProps {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
}

/*
  Container:
  - position: fixed, bottom var(--space-24), right var(--space-24)
  - z-index: 300
  - display: flex, flex-direction column-reverse, gap var(--space-8)

  Each Toast:
  - width: 360px
  - padding: var(--space-12) var(--space-16)
  - bg: rgba(30, 30, 34, 0.95)
  - backdrop-filter: blur(16px)
  - border: 1px solid var(--color-border-subtle)
  - radius: var(--radius-md)
  - Enter: slide-in from right 300ms var(--ease-fluid)
  - Exit: fade-out + slide-right 200ms
  - Icon per type: info=Info, success=CheckCircle, warning=AlertTriangle, error=XCircle (lucide-react)
  - Icon color: info=var(--color-violet), success=var(--color-emerald), warning=var(--color-amber), error=var(--color-rose)
  - Title: var(--text-sm), font-weight 500, var(--color-text-primary)
  - Message: var(--text-xs), var(--color-text-secondary)
  - Dismiss X button: top-right, IconButton size sm
*/
```

## 5.11 Create `src/renderer/components/ui/EmptyState.tsx`

```tsx
import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

/*
  Styles:
  - Centered vertically and horizontally in parent
  - Icon: 48×48px, opacity 0.3, margin-bottom var(--space-16)
  - Title: var(--text-lg), font-weight 500, var(--color-text-secondary), margin-bottom var(--space-8)
  - Description: var(--text-sm), var(--color-text-tertiary), max-width 320px, text-align center
  - Action: Button variant="secondary" with margin-top var(--space-16)
  - Entrance animation: stagger-in
*/
```

## 5.12 Create `src/renderer/components/ui/Skeletons.tsx`

```tsx
import React from 'react';

/* All skeleton components use the .skeleton class from index.css */

interface MeetingCardSkeletonProps {
  count?: number; // default 6
}

/*
  MeetingCardSkeleton:
  - Matches MeetingCard exact geometry
  - Title bar: height 16px, width 60%, radius var(--radius-sm)
  - Meta bar: height 12px, width 40%, margin-top var(--space-8)
  - Container: padding var(--space-16), height ~120px, radius var(--radius-md)
  - Apply .skeleton class to each bar

  TranscriptSkeleton:
  - 5 rows of varying width (100%, 85%, 92%, 78%, 95%)
  - Each row: height 14px, margin-bottom var(--space-12)
  - Left dot: 8px circle (speaker indicator placeholder)

  DigestSkeleton:
  - Header block: height 20px, width 50%
  - 3 text rows: height 14px, widths 90%, 70%, 85%
  - Action items block: 2 rows with checkbox placeholder (16×16px square)
*/
```

## 5.13 Create `src/renderer/components/ui/SplitPane.tsx`

```tsx
import React from 'react';

interface SplitPaneProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
  defaultRatio?: number; // 0-1, default 0.55 (55% transcript / 45% notes)
  minTopHeight?: number; // px, default 200
  minBottomHeight?: number; // px, default 150
  orientation?: 'horizontal' | 'vertical'; // default horizontal (top/bottom)
}

/*
  Layout:
  - display: flex, flex-direction column (horizontal) or row (vertical)
  - Each pane: overflow-y auto, overflow-x hidden

  Divider:
  - Visual: 1px line, bg linear-gradient(90deg, transparent 0%, var(--color-border-subtle) 20%, var(--color-glow-violet) 50%, var(--color-border-subtle) 80%, transparent 100%)
  - Hit area: 16px invisible drag zone centered on the 1px line (cursor: row-resize / col-resize)
  - Drag: update ratio with requestAnimationFrame, enforce min heights
  - Must maintain 60 FPS during drag — use CSS transform not height recalculation
  - Apply .gpu-promoted to divider element

  Listen for 'toggle-split-orientation' custom event (Cmd+\)
  Listen for 'toggle-notes-pane' custom event (Cmd+J) — collapse/expand bottom pane
*/
```

## 5.14 Create `src/renderer/components/meeting/SmartChip.tsx`

```tsx
import React from 'react';

type EntityType = 'PERSON' | 'DATE' | 'AMOUNT' | 'ACTION_ITEM';

interface SmartChipProps {
  type: EntityType;
  label: string;
  onClick?: () => void;
}

/*
  Styles by type:
  - PERSON:      bg var(--chip-person-bg), text var(--chip-person-text) #93C5FD
  - DATE:        bg var(--chip-date-bg),   text var(--chip-date-text)   #6EE7B7
  - AMOUNT:      bg var(--chip-amount-bg), text var(--chip-amount-text) #FCD34D
  - ACTION_ITEM: bg var(--chip-action-bg), text var(--chip-action-text) #FDA4AF

  All chips:
  - height: var(--h-sm) (24px)
  - padding: 0 6px
  - radius: var(--radius-sm) (6px)
  - font: var(--text-xs), font-weight 500
  - display: inline-flex, align-items center, gap var(--space-4)
  - Icon prefix: 👤 / 📅 / 📊 / ✅ per type
  - Rest state: recessed (dim, opacity 0.7)
  - Hover: illuminate (opacity 1.0), bg opacity increases to 0.15
  - Click: opens contextual popover with cross-meeting results
  - transition: var(--transition-fast)

  Click Actions:
  - PERSON: Filter all meetings by person
  - DATE: Add to calendar
  - AMOUNT: Compare across meetings
  - ACTION_ITEM: Add to task list
*/
```

## Part 5 Verification

- [ ] All 14 primitive component files created in `src/renderer/components/ui/` and `SmartChip.tsx` in `meeting/`
- [ ] Every component has a typed Props interface
- [ ] Every CSS value references an explicit token (no "similar to" or "approximately")
- [ ] `Button` supports 4 variants and 3 sizes
- [ ] `Toggle` uses spring animation (`--ease-spring`)
- [ ] `Dialog` applies `.surface-glass-premium`
- [ ] `SplitPane` listens for custom keyboard events
- [ ] `SmartChip` maps 4 entity types to 4 distinct color pairs
- [ ] TypeScript compiles: `npx tsc --noEmit`

---

# ═══════════════════════════════════════════
# PART 6 — APP SHELL
# ═══════════════════════════════════════════

## Prerequisites
- Parts 2, 4, 5 complete
- `lucide-react` installed

## 6.1 Create `src/renderer/components/layout/ZenRail.tsx`

```tsx
import React from 'react';

interface ZenRailProps {
  activeView: 'meeting-list' | 'meeting-detail' | 'settings';
  onNavigate: (view: 'meeting-list' | 'settings') => void;
  focusMode: boolean; // when true, Rail slides off-screen
}

/*
  Layout:
  - position: fixed, left 0, top 0, bottom 0
  - width: 56px
  - padding: var(--space-16) var(--space-8)
  - Apply .surface-glass-premium (one of max 3 blurred surfaces)
  - Apply .gpu-promoted
  - border-radius: 0 var(--radius-lg) var(--radius-lg) 0
  - z-index: 50
  - display: flex, flex-direction column, align-items center, gap var(--space-8)

  Focus Mode:
  - transition: transform var(--transition-base)
  - focusMode=true → transform: translateX(-56px)
  - focusMode=false → transform: translateX(0)

  Nav Items (top, vertical stack):
  - Meeting List icon: FileText (lucide) — active: bg var(--color-bg-glass), text var(--color-text-primary)
  - Search icon: Search (lucide)
  - Settings icon: Settings (lucide) — positioned at bottom with margin-top auto

  Each item:
  - IconButton size="md" (32×32px)
  - Active indicator: 2px wide × 16px tall rounded bar, bg var(--color-violet), absolute left 0
  - Tooltip on hover (delay 400ms)

  CSS Containment:
  - contain: layout style paint (NOT strict — strict clips tooltips)

  macOS traffic light spacing:
  - Add 56px top padding to account for traffic lights at (16, 12)
*/
```

## 6.2 Create `src/renderer/components/layout/DynamicIsland.tsx`

```tsx
import React from 'react';

interface DynamicIslandProps {
  recordingState: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing';
  meetingTitle?: string;
  elapsedTime?: string; // "00:45:12"
  syncStatus: 'idle' | 'syncing' | 'error';
  isOnline: boolean;
  onBack?: () => void;
  onStopRecording?: () => void;
  onTitleChange?: (title: string) => void;
}

/*
  Layout:
  - position: fixed, top var(--space-8), left 72px (56px Rail + 16px gap), right var(--space-16)
  - height: var(--h-xl) (48px)
  - Apply .surface-glass-premium (one of max 3 blurred surfaces)
  - Apply .gpu-promoted
  - border-radius: var(--radius-full) — pill shape
  - z-index: 40
  - display: flex, align-items center, padding 0 var(--space-16)
  - Apply .drag-region to the Island background (window draggable)
  - All interactive elements: Apply .no-drag

  Left Section:
  - Back button (← ChevronLeft icon) when in meeting-detail view — IconButton
  - Meeting title: inline-editable text, var(--text-sm), font-weight 500

  Center Section:
  - Recording indicator (when recording):
    - Red dot: 8px circle, bg var(--color-rose), with pulsing animation
    - "REC" label: var(--text-xs), var(--tracking-wide), uppercase, var(--color-rose)
    - Elapsed time: var(--font-mono), var(--text-sm)
    - Stop button: IconButton with Square icon
  - Power mode badge placeholder: "⚡ Performance" | "🔋 Balanced" | "🪫 Eco Mode"
    - Badge component, variant based on mode

  Right Section:
  - Sync status dot: 8px circle
    - online + idle: bg var(--color-emerald), title "Synced"
    - syncing: bg var(--color-amber), pulsing animation, title "Syncing"
    - error/offline: bg var(--color-rose), title "Offline"
  - No progress bars — dot indicator only

  Focus Mode adjustment:
  - When focusMode=true, left changes to var(--space-16) (Rail hidden)
*/
```

## 6.3 Create `src/renderer/components/layout/AppLayout.tsx`

```tsx
import React, { Suspense, lazy } from 'react';
import { useAppStore } from '../../store/appStore';
import { ZenRail } from './ZenRail';
import { DynamicIsland } from './DynamicIsland';
import { ErrorBoundary } from './ErrorBoundary';
import { OfflineBanner } from './OfflineBanner';
import { useToast } from '../../hooks/useToast';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

// Code-split heavy views
const MeetingListView = lazy(() => import('../../views/MeetingListView'));
const MeetingDetailView = lazy(() => import('../../views/MeetingDetailView'));
const SettingsView = lazy(() => import('../../views/SettingsView'));

/*
  Layout structure:
  <div className="app-root" style={{ height: '100vh', display: 'flex' }}>
    <ZenRail />
    <DynamicIsland />
    <OfflineBanner />
    <main style={{
      marginLeft: focusMode ? 0 : 56,  // Rail width
      marginTop: 64,                    // Island height + gap
      flex: 1,
      overflow: 'hidden',
      padding: 'var(--space-16)',
      transition: 'margin-left var(--transition-base)',
    }}>
      <ErrorBoundary>
        <Suspense fallback={<MeetingListSkeleton />}>
          {activeView === 'meeting-list' && <MeetingListView />}
          {activeView === 'meeting-detail' && <MeetingDetailView />}
          {activeView === 'settings' && <SettingsView />}
        </Suspense>
      </ErrorBoundary>
    </main>
    <ToastContainer />
    <CommandPalette /> (conditionally rendered)
  </div>

  Register:
  - useKeyboardShortcuts() at top level
  - Window focus/blur listener: toggle .window-blurred on document.body
*/
```

## 6.4 Create `src/renderer/components/layout/ErrorBoundary.tsx`

```tsx
import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/*
  Implementation:
  - Class component (React error boundaries require class)
  - static getDerivedStateFromError(error) → { hasError: true, error }
  - componentDidCatch(error, info) → console.error for dev debugging
  - render():
    - If hasError: show amber warning card (NOT a modal block)
      - bg: rgba(251, 191, 36, 0.05)
      - border: 1px solid rgba(251, 191, 36, 0.2)
      - radius: var(--radius-md)
      - padding: var(--space-16)
      - Icon: AlertTriangle (lucide), color var(--color-amber)
      - Title: "Something went wrong", var(--text-sm), font-weight 500
      - Message: error.message, var(--text-xs), var(--color-text-tertiary)
      - Retry button: Button variant="secondary" onClick → this.setState({ hasError: false })
    - Else: render children

  Usage:
  - Global boundary at App.tsx level
  - Local boundaries around <TranscriptPanel> and <MeetingListView>
  - If one component crashes, only that component shows warning — rest continues
*/
```

## 6.5 Create `src/renderer/components/layout/OfflineBanner.tsx`

```tsx
import React from 'react';

interface OfflineBannerProps {
  isOnline: boolean;
}

/*
  Render only when isOnline=false.

  Styles:
  - position: fixed, bottom 0, left 0, right 0
  - height: 28px
  - bg: rgba(30, 30, 34, 0.9)
  - border-top: 1px solid var(--color-border-subtle)
  - z-index: 30
  - display: flex, align-items center, justify-content center, gap var(--space-4)
  - Content: "🔴 Offline · Working locally"
  - font: var(--text-xs), var(--color-text-tertiary)
  - Entrance: slide-up from bottom, 300ms var(--ease-fluid)
  - Exit: slide-down, 200ms

  NON-INTRUSIVE: No spinner, no progress bar. Subtle line only.
*/
```

## 6.6 Rewrite `src/renderer/App.tsx`

```tsx
import React from 'react';
import { AppLayout } from './components/layout/AppLayout';

export default function App() {
  return <AppLayout />;
}
```

## Part 6 Verification

- [ ] ZenRail renders as 56px floating glass rail on left with 3 nav icons
- [ ] DynamicIsland renders as pill-shaped bar at top with drag region
- [ ] Sync status shows as color dot (🟢/🟡/🔴), NOT a progress bar
- [ ] Focus Mode (`Cmd+Shift+F`) slides Rail off-screen and expands main content
- [ ] ErrorBoundary shows amber warning (not modal) when component crashes
- [ ] OfflineBanner shows "🔴 Offline · Working locally" as subtle bottom line
- [ ] Views code-split with `React.lazy()` and `Suspense`
- [ ] Window blur adds `.window-blurred` class to body
- [ ] `App.tsx` renders `<AppLayout />` only

---

# ═══════════════════════════════════════════
# PART 7 — MEETING LIST
# ═══════════════════════════════════════════

## Prerequisites
- Parts 4, 5, 6 complete
- `@tanstack/react-virtual` installed

## 7.1 Create `src/renderer/components/meeting/MeetingCard.tsx`

```tsx
import React from 'react';

interface MeetingCardProps {
  id: string;
  title: string;
  date: Date;
  duration: number; // seconds
  participantCount: number;
  hasTranscript: boolean;
  hasNotes: boolean;
  onClick: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

/*
  Layout:
  - padding: var(--space-16)
  - bg: var(--color-bg-glass)
  - border: 1px solid var(--color-border-subtle)
  - radius: var(--radius-md) (10px)
  - Apply .premium-hover (lift + shadow + edge highlight on hover)
  - Apply .stagger-child (entrance animation, JS sets animation-delay per card)
  - cursor: pointer

  Content:
  - Title: var(--text-lg), font-weight 500, var(--tracking-tight), var(--color-text-primary)
    - Truncate with text-overflow: ellipsis (single line)
  - Meta row: var(--text-xs), var(--color-text-tertiary), margin-top var(--space-8)
    - Format: "45 min · 4 people" | "32 min · 2 people"
    - Duration: Math.round(duration / 60) + " min"
  - Status indicators (bottom right): inline Badge components
    - hasTranscript → Badge "Transcribed" variant="violet"
    - hasNotes → Badge "Notes" variant="default"

  Hover Prefetch:
  - After 200ms hover, fire custom event 'prefetch-meeting' with id
    - Phase 2: wires to silent meeting detail fetch for instant click-through

  Context Menu:
  - Right-click triggers onContextMenu
  - Items: "Open", separator, "Rename", "Duplicate", separator, "Delete" (danger)
*/
```

## 7.2 Create `src/renderer/views/MeetingListView.tsx`

```tsx
import React from 'react';

/*
  Layout:
  - padding: 0 (padding comes from AppLayout main)
  - max-width: 960px, margin: 0 auto (centered content)

  Header:
  - "Start New Meeting" floating glass pill button (top, full-width centered)
    - Button variant="secondary", icon Plus (lucide), shortcut label "Cmd+N"
    - Apply .surface-glass-premium
    - border-radius: var(--radius-full) — pill shape
    - margin-bottom: var(--space-24)

  Date-Grouped Sections:
  - Group meetings by date: "Today", "Yesterday", "February 23", etc.
  - Section header: var(--text-xs), var(--tracking-wide), uppercase, var(--color-text-tertiary), margin-bottom var(--space-12)
  - Cards: CSS Grid, grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)), gap var(--space-16)
  - Each card: <MeetingCard /> with stagger-child animation

  Empty State:
  - When no meetings: <EmptyState icon={FileText} title="No meetings yet" description="Start your first meeting to begin capturing transcripts and notes." action={{ label: "Start New Meeting", onClick: openNewMeeting }} />

  Loading State:
  - <MeetingCardSkeleton count={6} /> in same grid layout

  New Meeting Dialog:
  - Listen for 'open-new-meeting' custom event (from Cmd+N shortcut)
  - Open <NewMeetingDialog /> as <Dialog />

  Default export (for React.lazy)
*/
```

## 7.3 Create `src/renderer/components/meeting/NewMeetingDialog.tsx`

```tsx
import React from 'react';

interface NewMeetingDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (config: NewMeetingConfig) => void;
}

interface NewMeetingConfig {
  title: string;
  template: 'blank' | '1on1' | 'standup' | 'client-call' | 'brainstorm';
  contextFiles: File[];
}

/*
  Content inside Dialog (width 520px):

  1. Title Input:
     - <Input label="Meeting Title" placeholder="Optional — AI suggests after 60s" />

  2. Template Selector:
     - Label: "Template", var(--text-xs), var(--color-text-secondary)
     - 5 template options as horizontal radio-style cards (each 96px wide):
       | Template      | Icon | Pre-populated Content |
       |---------------|------|-----------------------|
       | Blank         | 📝   | Empty bullet list |
       | 1:1           | 👥   | ## Wins, ## Blockers, ## Action Items |
       | Standup       | 🏃   | ## Yesterday, ## Today, ## Blockers |
       | Client Call   | 📞   | ## Agenda, ## Key Points, ## Next Steps, ## Follow-ups |
       | Brainstorm    | 💡   | ## Problem Statement, ## Ideas, ## Voted Favorites |
     - Selected: border var(--color-violet), bg rgba(167,139,250,0.05)
     - Unselected: border var(--color-border-subtle), bg transparent
     - Each card: padding var(--space-8), radius var(--radius-md), text-align center

  3. Context Documents Drop Zone:
     - Label: "Context Documents (optional)"
     - Dashed border: 2px dashed var(--color-border-subtle)
     - radius: var(--radius-md)
     - padding: var(--space-24), text-align center
     - Text: "Drop .pdf, .md, or .txt files here (1–3 files)"
     - Accepts: .pdf, .md, .txt — max 3 files
     - Drag-over state: border-color var(--color-violet), bg rgba(167,139,250,0.05)
     - File list renders below with filename + X remove button

  4. Footer:
     - Button "Cancel" variant="ghost"
     - Button "Start Meeting" variant="primary" icon={Play}
*/
```

## 7.4 Create `src/renderer/components/command/CommandPalette.tsx`

```tsx
import React from 'react';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  type: 'action' | 'meeting';
  icon: React.ReactNode;
  label: string;
  description?: string;
  shortcut?: string;
  onSelect: () => void;
}

/*
  Backdrop:
  - position: fixed, inset 0
  - bg: rgba(0, 0, 0, 0.5)
  - backdrop-filter: blur(8px) — heavy backdrop blur
  - z-index: 100

  Panel:
  - Centered horizontally, top 20%
  - width: 560px, max-height: 420px
  - Apply .surface-glass-premium (one of max 3 blurred surfaces)
  - padding: 0
  - overflow: hidden
  - Enter animation: scale(0.96) + opacity 0 → scale(1) + opacity 1, 200ms var(--ease-fluid)

  Search Input:
  - Full-width, height var(--h-xl) (48px)
  - padding: 0 var(--space-16)
  - bg: transparent, border: none
  - border-bottom: 1px solid var(--color-border-subtle)
  - font: var(--text-base), var(--color-text-primary)
  - placeholder: "Search meetings, transcripts, notes..."
  - Icon: Search (lucide) left, var(--color-text-tertiary)
  - Auto-focus on open

  Results List:
  - overflow-y: auto, max-height: calc(420px - 48px)
  - padding: var(--space-4)

  Section Headers:
  - "ACTIONS", "MEETINGS (count)"
  - var(--text-xs), var(--tracking-wide), uppercase, var(--color-text-tertiary)
  - padding: var(--space-8) var(--space-12)

  Each Result Item:
  - height: 40px, padding: 0 var(--space-12)
  - radius: var(--radius-sm)
  - display: flex, align-items center, gap var(--space-8)
  - hover: bg var(--color-bg-glass-hover)
  - selected (keyboard): bg var(--color-bg-glass), border 1px var(--color-border-subtle)
  - Icon: 20×20px, var(--color-text-tertiary)
  - Label: var(--text-sm), var(--color-text-primary)
  - Description: var(--text-xs), var(--color-text-tertiary)
  - Shortcut: right-aligned, Badge variant="default"

  Keyboard Navigation:
  - Arrow Up/Down: move selection
  - Enter: execute selected item
  - Escape: close palette
  - Type to filter: useDeferredValue() — typing never stutters

  Default Actions:
  - "Start New Meeting" shortcut "Cmd+N"
  - "Open Settings" shortcut "Cmd+,"
  - "Toggle Focus Mode" shortcut "Cmd+Shift+F"

  Cmd+Shift+K — Semantic Search Shell:
  - Same visual structure but different placeholder: "Ask across all meetings..."
  - Results show match percentage: "Q3 Budget Review — Feb 18 (92% match)"
  - Wired to local embedding search in Phase 2
*/
```

## 7.5 Create `src/renderer/components/command/GlobalContextBar.tsx`

```tsx
import React from 'react';

interface GlobalContextBarProps {
  open: boolean;
  onClose: () => void;
}

/*
  Visual overlay only in Phase 1. RAG pipeline wiring in Phase 2.

  Layout:
  - position: fixed, top 20%, left 50%, transform translateX(-50%)
  - width: 640px
  - Apply .surface-glass-premium
  - z-index: 100

  Input:
  - placeholder: "What did Sarah say about the marketing budget?"
  - Same style as CommandPalette input

  Response Area:
  - Below input, showing placeholder AI response
  - var(--text-sm), var(--color-text-secondary)
  - Sources: list of meeting references with 📋 icon
*/
```

## Part 7 Verification

- [ ] MeetingCard has `.premium-hover` lift effect and `.stagger-child` entrance
- [ ] MeetingListView shows date-grouped grid with "Today", "Yesterday" headers
- [ ] Empty state renders `<EmptyState />` with "No meetings yet"
- [ ] NewMeetingDialog shows 5 template cards with correct pre-populated content table
- [ ] Context doc drop zone accepts .pdf, .md, .txt (max 3 files)
- [ ] CommandPalette opens centered with search input auto-focused
- [ ] Arrow Up/Down + Enter keyboard navigation works
- [ ] `useDeferredValue()` prevents typing stutter
- [ ] `Cmd+K` opens action palette, `Cmd+Shift+K` opens semantic search shell
- [ ] GlobalContextBar renders as visual shell overlay

---

# ═══════════════════════════════════════════
# PART 8 — MEETING DETAIL
# ═══════════════════════════════════════════

## Prerequisites
- Parts 5, 6, 7 complete
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-bullet-list`, `@tiptap/extension-collaboration`, `yjs`, `y-indexeddb` installed

## 8.1 Create `src/renderer/views/MeetingDetailView.tsx`

```tsx
import React from 'react';

/*
  Layout:
  - Full height of main content area
  - <SplitPane top={<TranscriptPanel />} bottom={<NoteEditor />} defaultRatio={0.55} />
  - Post-meeting: switches to side-by-side layout
    - Left: Transcript + Notes (stacked via SplitPane)
    - Right: <PostMeetingDigest />
    - Split at 60/40

  Default export (for React.lazy)
*/
```

## 8.2 Create `src/renderer/components/meeting/TranscriptSegment.tsx`

```tsx
import React from 'react';

interface TranscriptSegmentProps {
  id: string;
  speakerName: string;
  speakerColor: 'violet' | 'teal' | 'amber' | 'rose' | 'sky' | 'lime';
  timestamp: string; // "[00:12]"
  text: string;
  isPinned: boolean;
  isEdited: boolean;
  isLive: boolean; // currently streaming
  entities?: Array<{ type: 'PERSON' | 'DATE' | 'AMOUNT' | 'ACTION_ITEM'; text: string; start: number; end: number }>;
  onPin: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
}

/*
  Must be wrapped in React.memo() with shallow comparison on segment.id.
  Only live streaming segment re-renders.

  Layout:
  - display: flex, gap var(--space-8), padding var(--space-8) 0
  - min-height: 36px

  Speaker Color Dot:
  - 8px circle, positioned left of segment
  - Color mapping:
    | Color   | CSS Value |
    |---------|-----------|
    | violet  | #A78BFA   |
    | teal    | #2DD4BF   |
    | amber   | #FBBF24   |
    | rose    | #FB7185   |
    | sky     | #38BDF8   |
    | lime    | #A3E635   |

  Timestamp:
  - var(--font-mono), var(--text-xs), var(--color-text-tertiary)
  - width: 48px, flex-shrink 0

  Speaker Name:
  - var(--text-xs), font-weight 500, same color as dot
  - Editable post-meeting (inline click-to-edit)

  Text Content:
  - var(--text-base), var(--color-text-primary)
  - line-height: 1.6
  - Entities rendered as inline <SmartChip /> components
  - Recessed (dim) at rest, illuminate on hover

  Pin Icon:
  - ⭐ icon, visible only on hover (right side)
  - If isPinned: always visible, filled star
  - Click toggles pin → aggregates in PostMeetingDigest "Pinned Moments"

  Edited Badge:
  - If isEdited: tiny "edited" Badge variant="default" next to timestamp
  - Post-meeting: text is inline-editable

  Live Indicator:
  - If isLive: cursor blinking animation at end of text
    - "▌" character, opacity pulsing 0→1→0 at 1s interval

  AI vs Human Text Distinction:
  - Original user notes: var(--color-text-primary) #FFFFFF
  - AI-expanded text: var(--color-violet) #A78BFA + font-style italic + 🤖 badge inline
  - Human text: optional ✍️ on hover

  Bidirectional Source Highlighting:
  - Click 🤖 badge → highlight source transcript segments with violet pulse animation
  - CSS: @keyframes violet-pulse { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 0 2px var(--color-glow-violet); } }
*/
```

## 8.3 Create `src/renderer/components/meeting/TranscriptPanel.tsx`

```tsx
import React from 'react';

interface TranscriptPanelProps {
  segments: TranscriptSegmentProps[];
  isRecording: boolean;
}

/*
  Layout:
  - overflow-y: auto, flex 1
  - padding: var(--space-16)

  Scroll Behavior:
  - If isRecording and user has NOT scrolled up: auto-scroll to bottom on new segment
  - If user scrolls up: disable auto-scroll
  - Show "↓ Jump to latest" floating action button (FAB) when NOT at bottom
    - FAB: position absolute, bottom var(--space-16), right var(--space-16)
    - Apply .surface-glass-premium on a smaller scale
    - border-radius: var(--radius-full)
    - padding: var(--space-4) var(--space-12)
    - Icon: ArrowDown (lucide) + "Jump to latest"
    - Click: smooth scroll to bottom, re-enable auto-scroll

  Transcript aria semantics:
  - role="log", aria-live="polite"

  Virtualization (for 2+ hour meetings):
  - Use @tanstack/react-virtual with dynamic measurement (measureElement + ResizeObserver)
  - When segment count > 500: older segments pruned from React state
  - Scrolling up triggers lazy re-hydration from data store
  - Caps in-memory segments at ~500

  Loading State:
  - <TranscriptSkeleton /> from Skeletons.tsx

  Empty State:
  - <EmptyState icon={Mic} title="Waiting for audio" description="Start recording to see live transcription." />

  Wrap entire component in local <ErrorBoundary /> — if transcript crashes, notes still work
*/
```

## 8.4 Create `src/renderer/components/meeting/NoteEditor.tsx`

```tsx
import React from 'react';

interface NoteEditorProps {
  meetingId: string;
}

/*
  Engine: Tiptap (@tiptap/react) + Yjs (yjs, y-indexeddb, @tiptap/extension-collaboration)

  Setup:
  - Create Y.Doc() per meeting (keyed by meetingId)
  - Initialize IndexeddbPersistence for local CRDT persistence
  - Extensions: StarterKit, BulletList, Collaboration (with Y.Doc provider)
  - Default mode: bullet list — editor auto-starts in bullet list

  Schema:
  - Paragraphs, Bullet Lists, Bold, Italic, Blockquotes

  Auto-save:
  - Debounced 1500ms via useEffect
  - Cleanup: flush pending save on unmount

  AI Text Distinction:
  - Original text: var(--color-text-primary) #FFFFFF
  - AI-expanded text: var(--color-violet) #A78BFA + italic + 🤖 badge
  - Use custom Tiptap Mark for AI-generated content

  Ctrl+Enter — AI Expansion (Visual Shell in Phase 1):
  - On Ctrl+Enter: show <NoteExpansionLoader /> below current bullet
  - Phase 2 wires to intelligence.expandNote() IPC

  Layout:
  - overflow-y: auto, flex 1
  - padding: var(--space-16)
  - Tiptap editor fills container
  - Placeholder text: "Start typing your notes..."
  - Typography: var(--font-body), var(--text-base), line-height 1.6

  Why Yjs in Phase 1: piynotes.md §4.1 says "Implement with Yjs from day 1
  (prevents painful retrofit later)". Retrofitting CRDT after rich text exists
  causes data migration pain.
*/
```

## 8.5 Create `src/renderer/components/meeting/NoteExpansionLoader.tsx`

```tsx
import React from 'react';

/*
  Visual shell for AI expansion loading state.

  Styles:
  - 3 pulsing dots in a row, each 6px circle
  - Color: var(--color-violet)
  - Animation: sequential pulse (scale 1→1.4→1) with 150ms stagger
  - Container: inline-flex, gap var(--space-4), padding var(--space-4) 0
  - Appears below the bullet being expanded
*/
```

## 8.6 Create `src/renderer/components/meeting/MagicExpansion.tsx`

```tsx
import React from 'react';

interface MagicExpansionProps {
  content: string;
  sourceSegmentIds: string[];
  onReject: () => void;
}

/*
  Visual shell for AI-expanded note content.

  Styles:
  - Text: var(--color-violet) #A78BFA, font-style italic
  - 🤖 badge: inline, before the expanded text
  - ✕ Reject button: ghost, opacity 0 at rest, opacity 1 on hover
    - Position: right side of expansion block
    - Click: removes entire expansion (single undo via Tiptap transaction)
  - Source attribution: clicking 🤖 highlights source transcript segments
  - border-left: 2px solid rgba(167, 139, 250, 0.3), padding-left var(--space-8)

  Tiptap Integration:
  - Entire AI expansion MUST be committed as single ProseMirror Transaction
  - Ctrl+Z undoes entire AI block in one keystroke (not letter-by-letter)
*/
```

## 8.7 Create `src/renderer/components/meeting/PostMeetingDigest.tsx`

```tsx
import React from 'react';

interface PostMeetingDigestProps {
  meetingId: string;
  duration: number; // seconds
  participantCount: number;
  summary?: string;
  decisions?: Array<{ text: string; changed?: boolean; previousValue?: string }>;
  actionItems?: Array<{ text: string; assignee: string; dueDate?: string; completed: boolean }>;
  pinnedMoments?: Array<{ timestamp: string; text: string }>;
  people?: Array<{ name: string; totalMeetings: number }>;
}

/*
  Layout — Full visual shell with tabs:
  - Tab bar: [ Summary ] [ Actions ] [ ⭐ Pinned ]
  - Tab style: text-only tabs, active has bottom 2px var(--color-violet) border

  Stats Bar:
  - "📈 45 min · 4 participants"
  - var(--text-sm), var(--color-text-secondary)

  Summary Tab:
  - "Executive Summary:" header, var(--text-sm), font-weight 600
  - 3-sentence max AI summary, var(--text-base), var(--color-text-primary)
  - "Key Decisions:" header
    - Each decision as bullet, var(--text-sm)
  - "⚠️ Changed Decisions:" header (only if changes detected)
    - Format: "• Cut was 5% → now 10%"
    - Highlighted with amber left-border

  Actions Tab:
  - "Action Items:" header
  - Each item: checkbox + assignee name + description + due date
    - format: "☐ David: cost analysis (Fri)"
    - Checkbox: custom styled (not native)
    - "Push Actions" button at bottom (Phase 2 wires to OS reminders)

  Pinned Tab:
  - "⭐ Pinned Moments (count):" header
  - Each moment: timestamp + text
    - "00:12 — Q3 budget cuts"
    - Click timestamp → scroll to transcript segment

  People Section (always visible at bottom):
  - "People in This Meeting:" header
  - Each person: name + "(N total)" showing cross-meeting count
  - Click person → filter all meetings by person (SmartChip PERSON behavior)

  Export Footer:
  - [ Export ▾ ] dropdown: Markdown, PDF, Slack Message, Email, Raw Transcript
  - [ Push Actions ] button

  Loading State:
  - <DigestSkeleton /> from Skeletons.tsx
*/
```

## 8.8 Create `src/renderer/components/meeting/AudioIndicator.tsx`

```tsx
import React from 'react';

interface AudioIndicatorProps {
  audioLevel: number; // 0-1
  isRecording: boolean;
}

/*
  Visual pulsing waveform indicator.

  Implementation:
  - Use OffscreenCanvas in WebWorker for rendering (per P1.10)
  - Canvas: 120×32px
  - Draw 5 vertical bars, width 3px, gap 2px, centered
  - Bar heights: vary based on audioLevel (0-1 range mapped to 4px-28px)
  - Color: var(--color-emerald) when isRecording, var(--color-text-tertiary) when idle
  - Animation: requestAnimationFrame, bars oscillate smoothly
  - When not recording: bars at minimum height (4px), subtle idle pulse
*/
```

## 8.9 Create `src/renderer/components/meeting/RecordingTimer.tsx`

```tsx
import React from 'react';

interface RecordingTimerProps {
  startTime: number | null; // Date.now() when recording started
  isRecording: boolean;
}

/*
  Display: "00:00:00" elapsed time format

  Styles:
  - font: var(--font-mono), var(--text-sm)
  - color: var(--color-text-primary) when recording, var(--color-text-tertiary) when stopped
  - letter-spacing: var(--tracking-wide)
  - Use requestAnimationFrame for smooth updates (NOT setInterval)
  - When not recording: show final duration, static
*/
```

## 8.10 Create `src/renderer/components/meeting/MiniWidget.tsx`

```tsx
import React from 'react';

interface MiniWidgetProps {
  isRecording: boolean;
  elapsedTime: string;
  lastTranscriptLine: string;
  onRestore: () => void;
  onStop: () => void;
}

/*
  Exact Spec:
  - Width: 280px, Height: 72px
  - Always-on-top (Electron BrowserWindow with alwaysOnTop: true)
  - Apply .surface-glass-premium
  - border-radius: var(--radius-full) — pill shape
  - padding: var(--space-12) var(--space-16)

  Layout:
  - Row 1: Recording indicator (red dot + "REC" + elapsed time) + Stop button (IconButton)
  - Row 2: Last transcript line, single-line truncated
    - var(--text-xs), var(--color-text-secondary)
    - Speaker name prefix in their speaker color

  Click anywhere (except Stop): restore full window
  Summon with: Cmd+Shift+M

  Note: In Phase 1, this renders as a visual component within the main window.
  Phase 2 creates the actual always-on-top BrowserWindow via IPC.
*/
```

## 8.11 Create `src/renderer/components/meeting/SpeakerHeatmap.tsx`

```tsx
import React from 'react';

interface SpeakerHeatmapProps {
  segments: Array<{
    speakerColor: string;
    startTime: number;
    endTime: number;
  }>;
  totalDuration: number;
}

/*
  Color-coded audio timeline by speaker diarization color.

  Layout:
  - Full-width horizontal bar, height 8px
  - Each segment: proportional width based on (endTime - startTime) / totalDuration
  - Color: speaker's diarization color
  - radius: var(--radius-full) on container
  - Hover segment: expand height to 12px, show tooltip with speaker name + duration
  - Visual scan for "who spoke when"
*/
```

## 8.12 Create `src/renderer/components/meeting/SilentPrompter.tsx`

```tsx
import React from 'react';

interface SilentPrompterProps {
  suggestion: string | null;
  onDismiss: () => void;
}

/*
  Ghost-text coaching in DynamicIsland.

  Styles:
  - Renders inside DynamicIsland center area
  - var(--text-xs), font-style italic, var(--color-text-tertiary)
  - Enter: fade-in 500ms
  - Auto-dismiss: fades out after 10 seconds
  - Click to dismiss
  - Phase 2: AI monitors live transcript for missed discussion topics
  - Phase 1: visual shell only, suggestion prop for display testing
*/
```

## Part 8 Verification

- [ ] MeetingDetailView renders SplitPane with Transcript (top) and Notes (bottom)
- [ ] TranscriptSegment shows speaker color dot (6 colors), timestamp, text, pin icon on hover
- [ ] TranscriptSegment uses React.memo() with shallow comparison
- [ ] TranscriptPanel has scroll-lock with "↓ Jump to latest" FAB
- [ ] TranscriptPanel uses @tanstack/react-virtual for virtualization
- [ ] NoteEditor initializes Tiptap + Yjs with bullet-list default mode
- [ ] NoteEditor auto-saves with 1500ms debounce
- [ ] NoteExpansionLoader shows 3 pulsing violet dots
- [ ] MagicExpansion shows violet italic text with 🤖 badge and ✕ Reject on hover
- [ ] PostMeetingDigest has 3 tabs (Summary, Actions, Pinned) with full layout
- [ ] PostMeetingDigest shows changed decisions with amber highlight
- [ ] AudioIndicator draws 5-bar waveform on OffscreenCanvas
- [ ] RecordingTimer uses requestAnimationFrame (not setInterval)
- [ ] MiniWidget is exactly 280×72px with pill shape
- [ ] SpeakerHeatmap renders proportional color timeline
- [ ] SmartChip renders 4 entity types with correct color pairs
- [ ] AI text renders in violet italic (#A78BFA) with 🤖 badge
- [ ] Bidirectional highlighting: click 🤖 → violet pulse on source segments

---

# ═══════════════════════════════════════════
# PART 9 — ONBOARDING & SETTINGS
# ═══════════════════════════════════════════

## Prerequisites
- Parts 5, 6 complete (Dialog, Button, Input, Toggle, Select, Badge primitives)

## 9.1 Expand `src/renderer/components/audio/OnboardingFlow.tsx`

> **Existing component: 255 lines.** Keep all existing functionality (hardware detection, model download, pricing). Add auth screens + recovery key.

```tsx
// Add these to the OnboardingFlow step sequence:

type OnboardingStep = 'auth' | 'setup' | 'recovery-key' | 'plan-selection' | 'ghost-meeting';
```

### Step 1: Authentication (< 60 seconds)

```
┌──────────────────────────────────────────────┐
│           Welcome to PiyAPI Notes            │
│   Your meetings, transcribed and intelligent.│
│   All processing happens locally.            │
│                                              │
│   ┌──────────────────────────────────────┐   │
│   │  📧  Email: ________________________│   │
│   │  🔒  Password: _____________________│   │
│   │         [ Create Account ]           │   │
│   │              — or —                  │   │
│   │    [ 🔵 Continue with Google ]       │   │
│   │  Already have an account? [Log in]   │   │
│   └──────────────────────────────────────┘   │
│                                              │
│   ℹ️ Free tier is 100% local — no data      │
│      leaves your device.                     │
└──────────────────────────────────────────────┘
```

Styles:
- Centered card, max-width 440px
- Apply .surface-glass-premium
- Title: var(--text-2xl), font-weight 700, var(--tracking-tight)
- Subtitle: var(--text-sm), var(--color-text-secondary)
- Inputs: <Input /> component, full-width
- Create Account: <Button variant="primary" size="lg" /> full-width
- Google button: <Button variant="secondary" size="lg" /> with Google icon
- "Already have an account?": var(--text-sm), var(--color-text-tertiary)
- "Log in": text link, color var(--color-violet)
- Privacy note: var(--text-xs), var(--color-text-tertiary), ℹ️ icon
- Tokens stored in OS keychain via keytar — NEVER in localStorage
- Phase 1: visual shell only, auth API wiring in Phase 2

### Step 2: Device Setup

```
┌──────────────────────────────────────────────┐
│         Setting up your device...            │
│   [●●●●●●●●○○] 80%                          │
│                                              │
│   ✅ Account created                         │
│   • Downloading AI models...                 │
│     Whisper turbo (1.5 GB) / Moonshine (300MB)│
│     MiniLM embeddings (25 MB)                │
│   • Initializing local database              │
└──────────────────────────────────────────────┘
```

Styles:
- Progress bar: height 4px, bg var(--color-bg-glass), filled bg var(--color-violet), radius var(--radius-full)
  - NOTE: This is the ONLY progress bar in the entire app (onboarding only, per anti-spinner philosophy)
- Checklist items: var(--text-sm)
  - ✅ completed: var(--color-emerald)
  - • in-progress: var(--color-text-secondary), pulsing dot
  - Model sizes: var(--text-xs), var(--color-text-tertiary)

### Step 3: Recovery Key (CRITICAL)

```
┌──────────────────────────────────────────────┐
│          �� Save Your Recovery Key           │
│                                              │
│   If you reinstall your OS, you'll need this │
│   key to decrypt your synced meetings.       │
│                                              │
│   ┌──────────────────────────────────────┐   │
│   │  XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX│   │
│   └──────────────────────────────────────┘   │
│                                              │
│   [Copy to Clipboard]  [Save as File]        │
│                                              │
│   ⚠️ We can NEVER recover encrypted data    │
│     without this key.                        │
│                                              │
│            [I've Saved It →]                 │
└──────────────────────────────────────────────┘
```

Styles:
- 🔑 icon: 48px
- Recovery key box: bg rgba(255,255,255,0.03), border 1px dashed var(--color-border-subtle), padding var(--space-12), font var(--font-mono), var(--text-sm), text-align center, user-select all
- Copy button: <Button variant="secondary" icon={Clipboard} />
- Save as File button: <Button variant="secondary" icon={Download} />
- Warning: <Badge variant="warning" /> + var(--text-sm), var(--color-amber)
- "I've Saved It →": <Button variant="primary" size="lg" /> — disabled until user clicks Copy or Save

### Step 4: Plan Selection

```
┌──────────────────────────────────────────────┐
│              You're all set!                 │
│                                              │
│   Free: ✅ Transcribe ✅ Local AI ✅ Search  │
│   Starter ($9/mo): + Sync + 2 devices        │
│   ⭐ Pro ($19/mo): + Unlimited everything    │
│                                              │
│        [Start Your First Meeting]            │
└──────────────────────────────────────────────┘
```

Styles:
- Each tier: horizontal card with checkmarks
- Free: bg transparent, always selected by default
- Starter: bg var(--color-bg-glass), border var(--color-border-subtle)
- Pro: bg var(--color-bg-glass), border var(--color-violet), ⭐ badge, recommended highlight
- "Start Your First Meeting": <Button variant="primary" size="lg" icon={Play} /> full-width

### Step 5: Ghost Meeting Tutorial (Post-Setup)

Create `src/renderer/components/meeting/GhostMeetingTutorial.tsx`:

```tsx
interface GhostMeetingTutorialProps {
  onComplete: () => void;
}

/*
  Simulates a real meeting to teach the user the interface.

  Sequence:
  1. Pre-recorded 30-second sample transcript streams in TranscriptPanel (top pane)
     - 4 segments from 2 speakers with realistic text
     - Appears character-by-character at ~50 chars/second
  2. Pre-populated sample notes appear in NoteEditor (bottom pane)
     - 3 bullet points with pulsing "Try Ctrl+Enter here" tooltip
  3. Tooltip overlays point to key UI elements:
     - Arrow pointing to ZenRail: "Navigate between views"
     - Arrow pointing to DynamicIsland: "Meeting controls and status"
     - Arrow pointing to center: "Press Cmd+K for Command Palette"
  4. After 30 seconds or user clicks "Skip": ghost meeting auto-clears
  5. Navigate to real (empty) MeetingListView

  Tooltip Style:
  - bg: rgba(167, 139, 250, 0.15)
  - border: 1px solid var(--color-violet)
  - radius: var(--radius-md)
  - padding: var(--space-8) var(--space-12)
  - var(--text-xs), var(--color-text-primary)
  - Pulsing border animation (subtle)
  - Arrow pointer toward target element
*/
```

## 9.2 Create `src/renderer/components/settings/SettingsView.tsx`

Also create `src/renderer/views/SettingsView.tsx` as a thin wrapper with default export.

```tsx
interface SettingsSection {
  id: string;
  title: string;
  icon: React.ReactNode;
}

/*
  Layout:
  - max-width: 640px, margin: 0 auto
  - Sections stacked vertically with var(--space-32) gap

  6 Setting Sections:

  ┌─────────────────────────────────────────────────────────┐
  │ 🎙️ Recording                                   Phase 1 │
  │ ─────────────────────────────────────────────────────── │
  │ Microphone         [ Select: Default Mic ▾ ]   ✅ Build │
  │ Auto-start         [ Toggle: Off ]             ✅ Build │
  │ Save audio files   [ Toggle: On ]              ✅ Build │
  ├─────────────────────────────────────────────────────────┤
  │ 📝 Transcription                                       │
  │ ─────────────────────────────────────────────────────── │
  │ Language           [ Select: English ▾ ]     🎨 Layout │
  │ Show confidence    [ Toggle: Off ]           🎨 Layout │
  │ Delay              [ Select: Low ▾ ]         �� Layout │
  ├─────────────────────────────────────────────────────────┤
  │ 🤖 Intelligence                                        │
  │ ─────────────────────────────────────────────────────── │
  │ Auto-expand notes  [ Toggle: Off ]           🎨 Layout │
  │ Expansion style    [ Select: Detailed ▾ ]    🎨 Layout │
  │ Show timestamps    [ Toggle: On ]            🎨 Layout │
  ├─────────────────────────────────────────────────────────┤
  │ 🔒 Sync & Privacy                                      │
  │ ─────────────────────────────────────────────────────── │
  │ Auto-sync          [ Toggle: Off ]           🎨 Layout │
  │ Data location      [ /path/to/data ]         🎨 Layout │
  │ Encryption         [ Badge: AES-256-GCM ✅ ] 🎨 Layout │
  ├─────────────────────────────────────────────────────────┤
  │ 💾 Storage                                      Phase 1 │
  │ ─────────────────────────────────────────────────────── │
  │ Local usage        [ ████░░ 2.3 GB ]           ✅ Build │
  │ Cloud usage        [ ██░░░░ 800 MB ]           ✅ Build │
  │ Clear old meetings [ Button: Clear > 90 days ] ✅ Build │
  ├─────────────────────────────────────────────────────────┤
  │ 👤 Account                                             │
  │ ─────────────────────────────────────────────────────── │
  │ Devices            [ 1 of 2 ]                �� Layout │
  │ Add device         [ Button ]                🎨 Layout │
  │ GDPR export        [ Button: Export Data ]   🎨 Layout │
  │ Delete account     [ Button: danger ]        🎨 Layout │
  └─────────────────────────────────────────────────────────┘

  Each Section:
  - Header: icon + title, var(--text-lg), font-weight 600, var(--tracking-tight)
  - Divider: 1px solid var(--color-border-subtle)
  - Rows: height 40px, display flex, justify-content space-between, align-items center
  - Label: var(--text-sm), var(--color-text-secondary)
  - Control: right-aligned (<Select />, <Toggle />, <Badge />, <Button />)

  Storage Bars:
  - height: 6px, width: 200px
  - bg: var(--color-bg-glass)
  - fill: var(--color-violet) for used portion
  - radius: var(--radius-full)
  - Text: var(--text-xs), var(--color-text-tertiary) showing "2.3 GB of 10 GB"

  ✅ Build = fully functional controls in Phase 1
  🎨 Layout = visual layout only, wired in Phase 2
*/
```

## 9.3 Create `src/renderer/components/meeting/DeviceWallDialog.tsx`

```tsx
interface DeviceWallDialogProps {
  open: boolean;
  onClose: () => void;
  currentDevices: number;
  maxDevices: number;
  onUpgrade: () => void;
}

/*
  Feature trap dialog: appears when 3rd device connects (Starter limit = 2).

  Content inside <Dialog width={440}>:
  - Icon: 48px Laptop icon (lucide), var(--color-text-tertiary)
  - Title: "Device Limit Reached"
  - Description: "Your Starter plan supports up to 2 devices. Upgrade to Pro for unlimited devices."
  - Current: "2/2 devices active"
  - <Button variant="primary">Upgrade to Pro</Button>
  - <Button variant="ghost">Manage Devices</Button>
*/
```

## 9.4 Create `src/renderer/components/meeting/IntelligenceWallDialog.tsx`

```tsx
interface IntelligenceWallDialogProps {
  open: boolean;
  onClose: () => void;
  queriesUsed: number;
  queryLimit: number;
  onUpgrade: () => void;
}

/*
  Feature trap dialog: appears when AI query quota exhausted (Starter = 50/mo).

  Content inside <Dialog width={440}>:
  - Icon: 48px Brain icon (lucide), var(--color-violet)
  - Title: "AI Query Limit Reached"
  - Description: "You've used 50/50 cloud AI queries this month. Upgrade to Pro for unlimited queries, or continue with local AI (reduced accuracy)."
  - Usage bar: same style as Storage bars in Settings
  - <Button variant="primary">Upgrade to Pro</Button>
  - <Button variant="ghost">Continue with Local AI</Button>
*/
```

## 9.5 Create `src/renderer/components/settings/PricingView.tsx`

```tsx
interface PricingTier {
  name: string;
  price: string;
  features: string[];
  recommended?: boolean;
  cta: string;
}

/*
  5-Tier Goldilocks Pricing Table:

  | Tier       | Price    | Key Features |
  |------------|----------|-------------|
  | Free       | $0       | Transcribe, Local AI, Search, 1 device |
  | Starter    | $9/mo    | + Sync, 2 devices, 50 AI queries/mo |
  | Pro ⭐     | $19/mo   | + Unlimited devices, unlimited AI, priority |
  | Team       | $15/user | + Shared workspaces, admin controls |
  | Enterprise | Custom   | + SSO, HIPAA, dedicated support |

  Layout:
  - Horizontal card row, each 200px wide
  - Each card: .surface-glass-premium (but lighter, not full blur)
    - bg: var(--color-bg-glass)
    - border: 1px solid var(--color-border-subtle)
    - radius: var(--radius-lg)
    - padding: var(--space-24)
  - Recommended (Pro): border 1px solid var(--color-violet), ⭐ badge top-right
  - Tier name: var(--text-lg), font-weight 600
  - Price: var(--text-2xl), font-weight 700
  - Features: bullet list, var(--text-sm), var(--color-text-secondary)
  - CTA button: <Button /> full-width
    - Free: variant="ghost" "Get Started"
    - Starter: variant="secondary" "Start Free Trial"
    - Pro: variant="primary" "Go Pro"
    - Team: variant="secondary" "Contact Sales"
    - Enterprise: variant="ghost" "Talk to Us"
*/
```

## Part 9 Verification

- [ ] OnboardingFlow has 5 steps: auth → setup → recovery key → plan → ghost meeting
- [ ] Auth screen renders with email/password inputs + Google button
- [ ] Recovery key screen disables "I've Saved It" until Copy or Save clicked
- [ ] Plan selection shows Free/Starter/Pro tiers with correct prices
- [ ] GhostMeetingTutorial streams sample transcript and shows tooltip overlays
- [ ] SettingsView renders 6 sections with correct controls per section
- [ ] ✅ Build sections have functional controls; 🎨 Layout sections are visual only
- [ ] Storage bars show usage with violet fill and text labels
- [ ] DeviceWallDialog shows device limit message with upgrade CTA
- [ ] IntelligenceWallDialog shows query limit message with usage bar
- [ ] PricingView shows 5-tier table with Pro recommended
- [ ] All dialogs use <Dialog /> component with .surface-glass-premium

---

# ═══════════════════════════════════════════
# FINAL VERIFICATION — ALL 9 PARTS
# ═══════════════════════════════════════════

## Automated Checks

```bash
npx tsc --noEmit          # TypeScript compiles with zero errors
npm run dev               # Vite dev server starts
npm run electron:dev      # Electron app launches
```

## Visual Checklist (Cross-Referenced Against P1.1–P1.13)

- [ ] App launches without errors
- [ ] Void black splash renders instantly (no white flash)
- [ ] Geist font renders on first frame (no FOUT/FOIT)
- [ ] Custom title bar renders (macOS traffic lights at x:16, y:12)
- [ ] Zen Rail shows 3 navigation icons with glass texture
- [ ] Meeting List shows cards (or EmptyState)
- [ ] Meeting Detail shows split pane with glass divider
- [ ] Split pane divider is draggable at 60FPS
- [ ] Command Palette opens with Cmd+K
- [ ] Semantic Search shell opens with Cmd+Shift+K
- [ ] Mini Widget visual is 280×72px pill
- [ ] Settings shows all 6 sections with all controls
- [ ] Focus Mode (Cmd+Shift+F) collapses Zen Rail
- [ ] Offline banner shows "🔴 Offline · Working locally"
- [ ] Toasts appear and auto-dismiss after 5s
- [ ] Empty states display for views with no data
- [ ] Onboarding: auth → setup → recovery key → plan → ghost meeting
- [ ] New Meeting Dialog shows template selector (5 options) + doc drop zone
- [ ] Tiptap editor starts in bullet-list mode with Yjs CRDT initialized
- [ ] Transcript segments show speaker color dots + pin icon on hover
- [ ] SmartChip renders 4 entity types with correct color pairs
- [ ] AI text renders in violet italic with 🤖 badge
- [ ] PostMeetingDigest shows full tabbed layout
- [ ] Device Wall + Intelligence Wall dialogs render
- [ ] Pricing view shows 5-tier table
- [ ] DynamicIsland shows power mode badge placeholder + sync dot
- [ ] All 17 existing audio components remain functional
- [ ] Window resizes gracefully down to 800×600
- [ ] No console errors in development
- [ ] All animations use spring physics (--ease-spring, --ease-fluid)

## Performance Budgets

| Metric | Target |
|--------|--------|
| Cold start to interactive | < 500ms |
| Initial shell render | < 150ms |
| View navigation | < 50ms |
| Split-pane drag | 60 FPS |
| Transcript append | < 8ms |
| Command Palette open | < 100ms |
| Renderer memory | < 200MB |

## Accessibility

- All interactive elements have `aria-label` or visible text
- Tab order follows visual order
- Color contrast: WCAG AA (4.5:1) against dark backgrounds
- Transcript uses `role="log"` + `aria-live="polite"`
- Every action reachable without mouse
