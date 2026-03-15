# BlueArkive — Git & IP Strategy

> **Decision Date:** March 15, 2026
> **Status:** Final — Ready to execute
> **Goal:** Maximum IP protection + Maximum user trust + Zero cost

---

## The Problem

| Need                                                  | Challenge                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| **Protect code** — no one copies/remakes BlueArkive   | Private repos cost money for CI/CD (GitHub Actions billing blocked) |
| **Build trust** — users must believe data stays local | Users can't verify privacy claims if code is hidden                 |
| **Zero cost** — no money spent on infrastructure      | Public repos get free unlimited CI/CD                               |

## The Decision

### Phase 1 — Immediate (Today)

**Keep repo Private. Fix CI/CD for $0.**

1. Go to **https://github.com/settings/billing**
2. Add any payment method (credit/debit card)
3. Set **Actions spending limit → $0**
4. GitHub unlocks the free tier: **2,000 minutes/month** (your builds use ~15 min each = 130+ builds/month free)
5. You are **never charged**. The $0 limit is a hard cap.

> This is what Signal, 1Password, and Linear do. Private repo, free CI/CD, premium brand.

### Phase 2 — When Ready to Scale (Optional, 3-6 Months)

**Switch to FSL (Functional Source License) + Public Repo.**

This is the modern gold standard used by Sentry ($100M+ ARR), HashiCorp ($600M+ ARR), and GitKraken.

**What it means:**

- Code is **100% visible** on GitHub — anyone can read every line
- **Nobody can copy, sell, host, or compete** with it (legally enforced)
- After 2 years, each version auto-converts to Apache 2.0 (shows good faith)
- **Unlimited free CI/CD** (public repo)
- Marketing becomes: _"Don't trust us? Read every line of code yourself."_

---

## Why This Is the Best Strategy

### What Big Companies Actually Do

| Company       | Revenue   | Strategy                                   | Lesson                                               |
| ------------- | --------- | ------------------------------------------ | ---------------------------------------------------- |
| **Sentry**    | $100M+    | FSL — code visible, can't compete          | Trust = growth                                       |
| **HashiCorp** | $600M+    | BSL → FSL — code visible, can't compete    | Legal moat works                                     |
| **MongoDB**   | $1.7B     | SSPL — code visible, can't host as service | Transparency wins                                    |
| **Signal**    | Nonprofit | AGPLv3 — fully open, privacy brand         | Privacy + open = trust                               |
| **Apple**     | $3T       | Fully closed — branding is the trust       | Requires billions in brand equity you don't have yet |
| **Notion**    | $10B      | Fully closed + polish                      | Can afford to buy trust                              |

### The Key Insight

> **Your competitive moat is NOT your code. It's your execution.**

Anyone can read React components. Nobody can replicate:

- 4 months of Sovereign UI polish
- Your AI pipeline integration (transcription → entities → knowledge graph → CRDT sync)
- Your shipping speed (weekly releases)
- Your user relationships and brand trust
- Your head start — a clone would be 6+ months behind

**Code is the recipe. Your product is the restaurant.**

---

## Phase 1 Checklist (Do Today)

- [ ] Go to https://github.com/settings/billing
- [ ] Add payment method (any card)
- [ ] Set Actions spending limit to **$0**
- [ ] Verify CI runs by re-triggering: `git push origin main`
- [ ] Confirm builds at https://github.com/piyso/piynoteskiro/actions

## Phase 2 Checklist (When Ready)

- [ ] Add `LICENSE.md` with FSL text (Functional Source License)
- [ ] Set `licensor: PiySo` and `change-date: 2028-03-15` (2 years from now)
- [ ] Set `change-license: Apache-2.0`
- [ ] Change repo visibility: Settings → Danger Zone → **Public**
- [ ] Add to landing page: _"Source Available — Verify Our Privacy Claims"_
- [ ] Add `CONTRIBUTING.md` with guidelines
- [ ] Add `SECURITY.md` with responsible disclosure policy

---

## Trust Signals to Add (Both Phases)

### On the Landing Page

Add a **"Privacy Architecture"** section with:

- Diagram showing data flow stays 100% on device
- "Your audio never leaves your Mac"
- "SQLite database is local — no cloud sync required"
- "AI models run on-device via ONNX/GGUF — no API calls"
- Link to security policy

### In the App (Settings → About)

- Show exact version: `v0.3.3`
- Show: "All data stored locally at ~/Library/Application Support/BlueArkive"
- Show: "No telemetry. No analytics. No data collection."
- Link to privacy architecture page

---

## License Comparison (For Reference)

| License                   | Can Read Code | Can Copy & Sell  | Can Self-Host | Can Compete | Used By                |
| ------------------------- | ------------- | ---------------- | ------------- | ----------- | ---------------------- |
| **Proprietary (Private)** | ❌            | ❌               | ❌            | ❌          | Apple, Notion          |
| **FSL** ⭐                | ✅            | ❌               | ✅ personal   | ❌          | Sentry, GitKraken      |
| **BSL**                   | ✅            | ❌               | ❌            | ❌          | HashiCorp, CockroachDB |
| **SSPL**                  | ✅            | ❌               | ❌ as service | ❌          | MongoDB, Elastic       |
| **AGPL**                  | ✅            | ✅ (with source) | ✅            | ✅          | Signal                 |
| **MIT**                   | ✅            | ✅               | ✅            | ✅          | React, Next.js         |

**⭐ FSL is recommended** — it's the newest (2023), designed specifically for modern SaaS/desktop products, and is the most founder-friendly license that exists.

---

## Summary

```
Phase 1 (Today):   Private repo + $0 billing limit = free CI/CD
Phase 2 (3-6 mo):  FSL license + public repo = trust + protection + free CI/CD
Never:             MIT/Apache = anyone can clone and sell your work
```

> _"The best founders don't hide their work. They protect it legally and ship so fast that nobody can catch up."_
