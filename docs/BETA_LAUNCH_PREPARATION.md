# Beta Launch Preparation - PiyAPI Notes

**Date**: 2026-02-25  
**Status**: READY TO PREPARE  
**Target Launch**: Day 45 (3 weeks from now)

---

## Overview

This document outlines all preparation tasks for the PiyAPI Notes beta launch. The beta will target 20-50 users to validate the product before public launch.

---

## Pre-Launch Checklist (Task 35)

### Technical Preparation

#### 1. Auto-Update System (Task 35.1)

**Status**: ⏳ NOT STARTED

**Tasks**:

- [ ] Configure electron-updater
- [ ] Set up update server
- [ ] Test update flow on Windows
- [ ] Test update flow on macOS
- [ ] Implement update notifications
- [ ] Test rollback mechanism
- [ ] Document update process

**Configuration**:

```javascript
// electron-builder.yml
publish:
  - provider: github
    owner: piyapi
    repo: piyapi-notes
    private: true
  - provider: s3
    bucket: piyapi-updates
    region: us-east-1

autoUpdater:
  checkForUpdatesOnStart: true
  checkForUpdatesInterval: 3600000 # 1 hour
  allowDowngrade: false
  allowPrerelease: false
```

**Testing**:

- Test update from v1.0.0 → v1.0.1
- Test update with app running
- Test update with app closed
- Test update failure recovery
- Test update on slow network

---

#### 2. Crash Reporting (Task 35.2)

**Status**: ⏳ NOT STARTED

**Tasks**:

- [ ] Install @sentry/electron
- [ ] Configure Sentry DSN
- [ ] Test crash reporting
- [ ] Set up error alerts
- [ ] Configure source maps
- [ ] Test breadcrumbs
- [ ] Document error handling

**Configuration**:

```javascript
// src/main/index.ts
import * as Sentry from '@sentry/electron'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: app.getVersion(),
  beforeSend(event) {
    // Remove PII
    if (event.user) {
      delete event.user.email
      delete event.user.ip_address
    }
    return event
  },
})
```

**Testing**:

- Trigger test crash
- Verify crash report in Sentry
- Test breadcrumbs
- Test error grouping
- Test source maps

---

#### 3. Beta Invite System (Task 35.3)

**Status**: ⏳ NOT STARTED

**Tasks**:

- [ ] Generate 50 invite codes
- [ ] Create invite code validation
- [ ] Implement invite code UI
- [ ] Track invite code usage
- [ ] Set up invite code database
- [ ] Create admin dashboard
- [ ] Document invite process

**Invite Code Format**:

```
BETA-XXXX-XXXX-XXXX
```

**Validation**:

```javascript
// src/main/services/InviteCodeService.ts
export class InviteCodeService {
  async validateInviteCode(code: string): Promise<boolean> {
    // Check format
    if (!/^BETA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
      return false;
    }

    // Check database
    const invite = await db.getInviteCode(code);
    if (!invite) {
      return false;
    }

    // Check if already used
    if (invite.used) {
      return false;
    }

    // Check expiry
    if (invite.expiresAt < Date.now()) {
      return false;
    }

    return true;
  }

  async redeemInviteCode(code: string, userId: string): Promise<void> {
    await db.markInviteCodeUsed(code, userId);
  }
}
```

**Invite Code Generation**:

```javascript
// scripts/generate-invite-codes.js
const crypto = require('crypto')

function generateInviteCode() {
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase()
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase()
  const part3 = crypto.randomBytes(2).toString('hex').toUpperCase()
  return `BETA-${part1}-${part2}-${part3}`
}

// Generate 50 codes
const codes = Array.from({ length: 50 }, generateInviteCode)
console.log(codes.join('\n'))
```

---

#### 4. Feedback Collection (Task 35.4)

**Status**: ⏳ NOT STARTED

**Tasks**:

- [ ] Create feedback form
- [ ] Add feedback button to UI
- [ ] Set up feedback database
- [ ] Create feedback dashboard
- [ ] Set up email notifications
- [ ] Document feedback process

**Feedback Form**:

```typescript
interface FeedbackSubmission {
  userId: string
  type: 'bug' | 'feature' | 'improvement' | 'other'
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  screenshot?: string
  logs?: string
  systemInfo: {
    os: string
    version: string
    ram: number
    cpu: string
  }
  timestamp: number
}
```

**Feedback UI**:

- In-app feedback button (bottom-right corner)
- Keyboard shortcut: Cmd+Shift+F
- Auto-attach system info
- Optional screenshot capture
- Optional log attachment

---

#### 5. Beta Testing Guide (Task 35.5)

**Status**: ⏳ NOT STARTED

**Content**:

```markdown
# PiyAPI Notes Beta Testing Guide

## Welcome Beta Tester!

Thank you for participating in the PiyAPI Notes beta. Your feedback is invaluable.

## Installation

1. Download installer from: [link]
2. Run installer
3. Enter your invite code: BETA-XXXX-XXXX-XXXX
4. Complete onboarding

## What to Test

### Priority 1: Core Features

- [ ] Audio capture (system audio + microphone)
- [ ] Real-time transcription
- [ ] Note taking
- [ ] Note expansion (Ctrl+Enter)
- [ ] Search (Cmd+Shift+K)

### Priority 2: Sync & Security

- [ ] Cloud sync (if Starter/Pro tier)
- [ ] Multi-device sync
- [ ] Encryption
- [ ] Recovery phrase

### Priority 3: Performance

- [ ] 60-minute meeting
- [ ] RAM usage
- [ ] CPU usage
- [ ] App responsiveness

## How to Report Bugs

1. Click feedback button (bottom-right)
2. Select "Bug"
3. Describe the issue
4. Include steps to reproduce
5. Attach screenshot (optional)
6. Submit

## What We're Looking For

- Crashes or freezes
- Audio capture failures
- Transcription errors
- Sync issues
- Performance problems
- UI/UX issues
- Feature requests

## Beta Timeline

- Week 1: Core features testing
- Week 2: Performance testing
- Week 3: Bug fixes and polish

## Support

- Email: beta@piyapi.com
- Discord: [link]
- Feedback form: In-app

## Thank You!

Your feedback helps us build a better product.
```

---

#### 6. Launch Announcement (Task 35.6)

**Status**: ⏳ NOT STARTED

**Channels**:

- Email to beta testers
- Twitter/X announcement
- LinkedIn post
- Product Hunt (later)
- Hacker News (later)

**Email Template**:

```markdown
Subject: You're Invited to PiyAPI Notes Beta! 🎉

Hi [Name],

You've been selected to join the PiyAPI Notes beta!

PiyAPI Notes is an AI-powered meeting notes app that:

- Records and transcribes meetings in real-time
- Expands your bullet points into detailed notes
- Searches across all your meetings
- Syncs securely across devices

Your invite code: BETA-XXXX-XXXX-XXXX

Download: [link]

What we need from you:

- Test the app for 2-3 weeks
- Report any bugs or issues
- Share your feedback

As a thank you, you'll get:

- Free Pro tier for 6 months
- Early access to new features
- Direct line to the founders

Questions? Reply to this email.

Thanks for being an early supporter!

The PiyAPI Team
```

**Social Media Post**:

```markdown
🎉 Announcing PiyAPI Notes Beta!

AI-powered meeting notes that:
✅ Record & transcribe in real-time
✅ Expand bullet points into detailed notes
✅ Search across all meetings
✅ Sync securely across devices

Looking for 20-50 beta testers.

Apply: [link]

#productivity #AI #meetings
```

---

### Code Signing & Distribution (Task 36)

#### 1. Windows Code Signing (Task 36.1)

**Status**: ⏳ NOT STARTED

**Tasks**:

- [ ] Purchase code signing certificate
- [ ] Install certificate
- [ ] Configure electron-builder
- [ ] Test signed installer
- [ ] Verify no SmartScreen warnings

**Certificate Providers**:

- DigiCert (~$200/year)
- Sectigo (~$150/year)
- SSL.com (~$180/year)

**Configuration**:

```javascript
// electron-builder.yml
win:
  certificateFile: certs/windows-cert.pfx
  certificatePassword: ${WINDOWS_CERT_PASSWORD}
  signingHashAlgorithms:
    - sha256
  sign: ./scripts/sign-windows.js
```

---

#### 2. macOS Code Signing (Task 36.2-36.3)

**Status**: ⏳ NOT STARTED

**Tasks**:

- [ ] Enroll in Apple Developer Program ($99/year)
- [ ] Create Developer ID certificate
- [ ] Configure electron-builder
- [ ] Notarize app
- [ ] Staple notarization ticket
- [ ] Test on clean Mac

**Configuration**:

```javascript
// electron-builder.yml
mac:
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize:
    teamId: ${APPLE_TEAM_ID}
```

**Notarization**:

```bash
# Notarize app
xcrun notarytool submit PiyAPI-Notes.dmg \
  --apple-id ${APPLE_ID} \
  --password ${APPLE_APP_PASSWORD} \
  --team-id ${APPLE_TEAM_ID} \
  --wait

# Staple ticket
xcrun stapler staple PiyAPI-Notes.dmg
```

---

#### 3. Create Installers (Task 36.4-36.5)

**Status**: ⏳ NOT STARTED

**Windows Installer (NSIS)**:

```javascript
// electron-builder.yml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: PiyAPI Notes
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  license: LICENSE.txt
```

**macOS DMG**:

```javascript
// electron-builder.yml
dmg:
  title: PiyAPI Notes
  icon: build/icon.icns
  background: build/dmg-background.png
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
```

---

#### 4. Test Installers (Task 36.6-36.8)

**Status**: ⏳ NOT STARTED

**Test Matrix**:

| OS         | Version  | Admin | SmartScreen | Status |
| ---------- | -------- | ----- | ----------- | ------ |
| Windows 10 | 22H2     | Yes   | No warning  | TBD    |
| Windows 10 | 22H2     | No    | No warning  | TBD    |
| Windows 11 | 23H2     | Yes   | No warning  | TBD    |
| Windows 11 | 23H2     | No    | No warning  | TBD    |
| macOS 12   | Monterey | N/A   | No warning  | TBD    |
| macOS 13   | Ventura  | N/A   | No warning  | TBD    |
| macOS 14   | Sonoma   | N/A   | No warning  | TBD    |

**Test Steps**:

1. Download installer
2. Run installer
3. Verify no warnings
4. Complete installation
5. Launch app
6. Verify app works
7. Uninstall app
8. Verify clean uninstall

---

## Beta User Management

### User Tiers

| Tier    | Users | Features              | Duration      |
| ------- | ----- | --------------------- | ------------- |
| Free    | 10    | Local-only            | Unlimited     |
| Starter | 20    | Cloud sync, 2 devices | 3 months free |
| Pro     | 20    | All features          | 6 months free |

### User Onboarding

**Day 1**:

- Send welcome email
- Provide invite code
- Share testing guide
- Add to Discord

**Week 1**:

- Check-in email
- Ask for initial feedback
- Offer support

**Week 2**:

- Mid-beta survey
- Feature usage analysis
- Bug fix updates

**Week 3**:

- Final feedback request
- Thank you email
- Offer extended Pro access

---

## Monitoring & Support

### Metrics to Track

**Usage Metrics**:

- Daily active users (DAU)
- Weekly active users (WAU)
- Average session duration
- Meetings per user
- Notes per meeting
- Search queries per user

**Performance Metrics**:

- Crash rate
- Error rate
- Average RAM usage
- Average CPU usage
- Transcription lag
- Search latency

**Engagement Metrics**:

- Onboarding completion rate
- Feature adoption rate
- Retention rate (Day 1, 7, 30)
- Churn rate

### Support Channels

**Email**: beta@piyapi.com

- Response time: <24 hours
- Escalation: Critical bugs <4 hours

**Discord**: #beta-support

- Real-time support
- Community help
- Feature discussions

**In-App Feedback**:

- Feedback button
- Bug reports
- Feature requests

---

## Beta Success Criteria

### Must Have (Launch Blockers)

- [ ] <5% crash rate
- [ ] > 80% audio capture success rate
- [ ] > 90% onboarding completion rate
- [ ] <10 critical bugs
- [ ] > 4.0 average rating from beta users

### Nice to Have

- [ ] > 50% daily active users
- [ ] > 70% retention after 7 days
- [ ] > 10 feature requests
- [ ] > 5 positive testimonials

---

## Post-Beta Actions

### Week 1 After Beta

- [ ] Analyze all feedback
- [ ] Prioritize bug fixes
- [ ] Prioritize feature requests
- [ ] Create public launch plan
- [ ] Update marketing materials

### Week 2-3 After Beta

- [ ] Fix critical bugs
- [ ] Implement high-priority features
- [ ] Polish UI/UX
- [ ] Update documentation
- [ ] Prepare for public launch

### Week 4 After Beta

- [ ] Final testing
- [ ] Create launch announcement
- [ ] Prepare Product Hunt launch
- [ ] Prepare Hacker News post
- [ ] Launch publicly

---

## Launch Day Checklist

### T-7 Days

- [ ] Final code freeze
- [ ] Complete all testing
- [ ] Fix all critical bugs
- [ ] Update documentation
- [ ] Prepare marketing materials

### T-3 Days

- [ ] Build final installers
- [ ] Sign and notarize
- [ ] Upload to distribution servers
- [ ] Test download links
- [ ] Prepare launch announcement

### T-1 Day

- [ ] Final smoke tests
- [ ] Verify all systems operational
- [ ] Brief support team
- [ ] Schedule launch posts
- [ ] Get some sleep!

### Launch Day

- [ ] 9 AM: Publish installers
- [ ] 10 AM: Send launch email
- [ ] 11 AM: Post on Twitter/X
- [ ] 12 PM: Post on LinkedIn
- [ ] 2 PM: Post on Product Hunt
- [ ] 4 PM: Post on Hacker News
- [ ] Monitor feedback all day
- [ ] Respond to questions
- [ ] Fix any critical issues

### T+1 Day

- [ ] Analyze launch metrics
- [ ] Respond to all feedback
- [ ] Fix any critical bugs
- [ ] Thank early adopters
- [ ] Plan next steps

---

## Risk Mitigation

### High Risk Issues

| Risk                | Probability | Impact   | Mitigation                        |
| ------------------- | ----------- | -------- | --------------------------------- |
| Audio capture fails | Medium      | Critical | Extensive testing, fallback chain |
| Crashes during beta | Medium      | High     | Crash reporting, rapid fixes      |
| Poor performance    | Low         | High     | Performance testing, optimization |
| Security breach     | Low         | Critical | Security audit, encryption        |
| Low user engagement | Medium      | Medium   | Onboarding improvements, support  |

### Contingency Plans

**If audio capture fails >20%**:

- Offer cloud transcription fallback
- Extend beta period
- Focus on microphone capture

**If crash rate >10%**:

- Delay public launch
- Fix critical bugs
- Re-test thoroughly

**If user engagement low**:

- Improve onboarding
- Add more features
- Better documentation

---

## Timeline

### Week 1 (Days 1-7)

- [ ] Set up auto-update system
- [ ] Configure crash reporting
- [ ] Generate invite codes
- [ ] Create feedback system
- [ ] Write beta testing guide

### Week 2 (Days 8-14)

- [ ] Purchase code signing certificates
- [ ] Set up code signing
- [ ] Create installers
- [ ] Test installers
- [ ] Prepare launch announcement

### Week 3 (Days 15-21)

- [ ] Send beta invites
- [ ] Onboard beta users
- [ ] Monitor usage
- [ ] Collect feedback
- [ ] Fix critical bugs

### Week 4 (Days 22-28)

- [ ] Analyze feedback
- [ ] Implement improvements
- [ ] Final testing
- [ ] Prepare for public launch

---

## Budget

| Item                     | Cost      | Notes                     |
| ------------------------ | --------- | ------------------------- |
| Windows Code Signing     | $200/year | DigiCert                  |
| Apple Developer Program  | $99/year  | Required for notarization |
| Sentry (Crash Reporting) | $26/month | Team plan                 |
| Update Server (S3)       | $10/month | Estimated                 |
| Email Service (SendGrid) | $15/month | Essentials plan           |
| **Total Year 1**         | **$620**  |                           |
| **Monthly Recurring**    | **$51**   |                           |

---

## Success Metrics

### Beta Phase (3 weeks)

- 20-50 beta users
- <5% crash rate
- > 80% audio capture success
- > 90% onboarding completion
- > 4.0 average rating

### Public Launch (6 months)

- 10,000 total users
- 500 paying users (5% conversion)
- $9,000 MRR
- 60% retention after 30 days
- 4.0+ rating

---

**Status**: READY TO EXECUTE  
**Next Steps**: Begin technical preparation (Tasks 35.1-35.6)  
**Timeline**: 3 weeks to beta launch
