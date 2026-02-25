# PiyAPI Notes

Local-first meeting transcription application with AI-powered note expansion.

## Features

- 🎙️ Real-time audio capture and transcription
- 📝 AI-powered note expansion (Ctrl+Enter)
- 🔍 Full-text search across meetings
- 🔒 Local-first with optional cloud sync
- ⚡ Fast and efficient (optimized for 8GB RAM)

## Tech Stack

- **Electron** - Desktop app framework
- **Vite** - Fast build tooling
- **React** - UI components
- **TypeScript** - Type safety (strict mode)
- **Whisper.cpp** - Local transcription
- **Phi-3 Mini** - Local AI (via Ollama)
- **SQLite** - Local database

## Development

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Build Electron app
npm run electron:build
```

## Project Structure

```
piyapi-notes/
├── electron/           # Electron main process
│   ├── main.ts        # Main process entry
│   └── preload.ts     # Preload script (IPC bridge)
├── src/               # React renderer process
│   ├── App.tsx        # Main app component
│   ├── main.tsx       # React entry point
│   └── index.css      # Global styles
├── dist/              # Vite build output
├── dist-electron/     # Electron build output
└── release/           # Final app packages
```

## Scripts

- `npm run dev` - Start Vite dev server
- `npm run electron:dev` - Start Electron in dev mode
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## License

MIT
