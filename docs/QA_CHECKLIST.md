# BlueArkive QA Checklist — v0.3.3

> **How to use:** Walk through each section. Mark ✅ if it works, ❌ if broken, ⚠️ if partially works.
> After testing, share this file with me and I'll fix everything marked ❌ or ⚠️.

---

## 1. Installation & Launch

- [ ] Download: `curl -fsSL https://dl.bluearkive.com/install.sh | bash`
- [ ] App opens without errors
- [ ] No "Cannot find module" error
- [ ] No "Database could not initialize" error
- [ ] Splash screen shows correct logo (squircle with glowing arcs + center orb)
- [ ] macOS dock icon matches the splash screen logo
- [ ] Finder icon in Applications matches

## 2. Login & Auth

- [ ] Email/password login works
- [ ] Google sign-in button is visible
- [ ] Google sign-in opens browser
- [ ] Google redirects back to app after login
- [ ] No "provider is not enabled" error
- [ ] No "redirect_uri_mismatch" error
- [ ] Logout works
- [ ] Can log back in after logout

## 3. Logo Consistency

- [ ] Onboarding screen logo matches dock icon
- [ ] Splash screen (loading) logo matches dock icon
- [ ] All logos have: dark squircle bg + cyan/blue arcs + glowing center orb

## 4. Meeting Recording

- [ ] Can start a meeting
- [ ] Microphone permission dialog appears (first time)
- [ ] Recording timer shows and counts up
- [ ] Can pause recording
- [ ] Can resume recording
- [ ] Can stop recording
- [ ] Meeting appears in meeting list after stopping

## 5. Meeting List

- [ ] Meetings display with correct date/time
- [ ] Meeting cards show duration
- [ ] Can click a meeting to see details
- [ ] Can delete a meeting
- [ ] Empty state shows when no meetings exist

## 6. Transcription

- [ ] Transcript appears during/after recording
- [ ] Transcript text is readable
- [ ] Speaker labels show
- [ ] Bookmarks work (if applicable)

## 7. UI / Visual Polish

- [ ] Dark theme looks correct (no white flashes)
- [ ] Sidebar navigation works
- [ ] Settings page loads
- [ ] Animations are smooth (no jank)
- [ ] Scrolling is smooth
- [ ] No layout shifts or broken layouts

## 8. General

- [ ] App doesn't crash during normal use
- [ ] No frozen/hung states
- [ ] Command palette opens (Cmd+K)
- [ ] App quits cleanly (Cmd+Q)

---

## Issues Found

> Write any issues you find here with a brief description:

1.
2.
3.

---

## Test Environment

- macOS version:
- Chip: Apple Silicon (M1/M2/M3) / Intel
- BlueArkive version: 0.3.3
- Date tested:
