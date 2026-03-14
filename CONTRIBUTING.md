# Contributing to BlueArkive

Thank you for your interest in contributing to BlueArkive! We welcome bug reports, security audits, and pull requests.

## License

By contributing, you agree that your contributions will be licensed under the [FSL-1.1-Apache-2.0](LICENSE.md) license.

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/piyso/piynoteskiro/issues) to avoid duplicates
2. Open a new issue with:
   - **Title:** Clear, concise description
   - **Steps to reproduce:** Numbered, specific steps
   - **Expected behavior:** What should happen
   - **Actual behavior:** What actually happens
   - **Environment:** macOS version, BlueArkive version, chip (M1/M2/Intel)

### Security Vulnerabilities

**Do NOT open a public issue.** See [SECURITY.md](SECURITY.md) for responsible disclosure.

### Pull Requests

1. **Fork** the repository
2. **Create a branch:** `git checkout -b fix/description`
3. **Make your changes** — follow the code style below
4. **Test:** Run `npx tsc --noEmit && npm run lint`
5. **Commit:** Use conventional commits (`fix:`, `feat:`, `chore:`, `docs:`)
6. **Push** and open a PR against `main`

### Code Style

- **TypeScript** — strict mode, no `any` types
- **React** — functional components with hooks
- **CSS** — vanilla CSS with CSS variables (no Tailwind)
- **Imports** — absolute paths from `src/`
- **No `console.log`** — use `rendererLog` for frontend, structured logger for backend
- **Error handling** — always show user-facing toast on catch, log with structured logger

### Development Setup

```bash
# Clone
git clone https://github.com/piyso/piynoteskiro.git
cd piynoteskiro

# Install
npm install

# Dev mode
npm run dev

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build
npm run build:mac
```

### Project Structure

```
src/
├── main/           # Electron main process (Node.js)
│   ├── ipc/        # IPC handlers
│   └── services/   # Backend services (audio, AI, sync)
├── renderer/       # React frontend
│   ├── components/ # UI components
│   ├── hooks/      # Custom React hooks
│   ├── store/      # Zustand state
│   ├── views/      # Page-level views
│   └── utils/      # Utilities
├── types/          # Shared TypeScript types
└── landing-web/    # Landing page (Vite)
```

## What We're Looking For

- 🐛 Bug fixes
- ♿ Accessibility improvements
- 🌐 Internationalization (i18n)
- 📖 Documentation improvements
- ⚡ Performance optimizations
- 🔒 Security hardening

## Code of Conduct

Be respectful, constructive, and inclusive. We're building something to help people work better — let's treat each other the same way.
