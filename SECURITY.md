# Security Policy

## Reporting a Vulnerability

We take security seriously. BlueArkive processes sensitive meeting data locally on your device, and we are committed to keeping it safe.

If you discover a security vulnerability, please report it responsibly:

**Email:** [piyush@piynotes.com](mailto:piyush@piynotes.com)

**What to include:**

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Response timeline:**

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 7 days
- **Fix:** Critical issues within 14 days, others within 30 days

## What We Consider Vulnerabilities

- Data exfiltration (any data leaving the device without user consent)
- Authentication bypass
- Local file access outside the app sandbox
- Injection attacks (SQL injection, XSS in Electron)
- Insecure IPC (inter-process communication) patterns
- Hardcoded secrets or credentials
- Privilege escalation

## Our Security Principles

1. **Local-first:** All data stays on your device. Meeting audio, transcripts, and notes never leave your Mac unless you explicitly export them.

2. **No telemetry:** BlueArkive collects zero analytics, zero crash reports, and zero usage data. We have no servers receiving your data.

3. **AI runs on-device:** The transcription and entity extraction models (Whisper GGUF, ONNX) run entirely on your CPU/GPU. No API calls to OpenAI, Google, or any cloud service.

4. **Database is local:** SQLite database stored at `~/Library/Application Support/BlueArkive/`. You own it. You can delete it anytime.

5. **No network required:** BlueArkive works fully offline. Network is only used for optional license activation and cloud sync (opt-in).

## Scope

| In Scope                            | Out of Scope                               |
| ----------------------------------- | ------------------------------------------ |
| BlueArkive desktop app (Electron)   | Third-party dependencies (report upstream) |
| BlueArkive landing page             | Social engineering attacks                 |
| Download server (dl.bluearkive.com) | Physical access attacks                    |
| API endpoints (api.bluearkive.com)  | DoS/DDoS attacks                           |

## Recognition

We appreciate security researchers who help keep BlueArkive safe. With your permission, we'll credit you in our changelog and security advisories.

Thank you for helping protect our users. 🛡️
