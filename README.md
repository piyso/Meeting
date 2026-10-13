# BlueArkive

Local-first meeting notes for the desktop. BlueArkive records a meeting, transcribes it on your
computer, and turns it into searchable notes, action items and a knowledge graph. Audio is
transcribed on-device; an account is only needed for encrypted sync and cloud features.

## Features

- Record system audio (the whole call) or your microphone, with automatic microphone fallback
- On-device speech-to-text (Moonshine via ONNX Runtime)
- Notes editor with AI expansion, bookmarks, and full-text + semantic search
- Post-meeting digest: summary, decisions, action items
- Weekly digest, knowledge graph and "Ask your meetings" (plan-dependent)
- Optional end-to-end encrypted sync across devices
- Works without an account ("Continue without an account" on first launch)

## Tech stack

- **Electron** + **Vite** + **React** + **TypeScript** (strict)
- **SQLite** (better-sqlite3) for local storage, **Yjs** for note documents
- **onnxruntime-node** for speech recognition and embeddings, **node-llama-cpp** for the local LLM
- **Supabase** for auth/sync (optional)

## Development

Prerequisites: Node.js 20+, npm.

```bash
npm install
npm run download-models   # speech + search models (~345 MB) into resources/models
npm run dev               # Vite dev server + Electron
```

### Mock mode vs. the real backend

`.env` controls which backend the UI talks to:

- `USE_MOCK_DATA=true` — the renderer uses `src/renderer/mockElectronAPI.ts` (simulated data, no
  database, no recording). Good for UI work; **nothing in the main process is exercised**.
- `USE_MOCK_DATA=false` — the real preload bridge and main process are used.

Before a release, always run the app with `USE_MOCK_DATA=false`: the mock is a separate
implementation and can drift from the real IPC contract.

Copy `.env.example` to `.env` and fill in the values you need. The app runs local-only without
any of the cloud variables.

## Checks

```bash
npm run type-check   # all three TypeScript projects
npm run lint         # ESLint, zero warnings allowed
npm run test:run     # Vitest
```

## Build

Production builds refuse to run in mock mode.

```bash
USE_MOCK_DATA=false npm run build:mac     # or build:win / build:linux
```

Output goes to `release/`.

## Project structure

```
electron/            Main-process entry, preload bridges
src/main/            Main process: IPC handlers, services, database, workers
src/renderer/        React UI (views, components, hooks, stores)
src/types/           Types shared by main and renderer (IPC contract)
resources/models/    Local models (downloaded, not committed)
supabase/            Edge functions and schema for the optional cloud backend
```

## License

[FSL-1.1-Apache-2.0](LICENSE.md) — Functional Source License 1.1; versions released before March 15, 2028 convert to Apache 2.0 on that date.
