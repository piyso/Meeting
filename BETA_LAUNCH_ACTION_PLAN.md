# Beta Launch Action Plan - PiyAPI Notes

## Prioritized Roadmap to Production

**Created:** February 25, 2026  
**Current Status:** 65% Complete  
**Target:** Beta Launch in 4-6 weeks  
**Based On:** Ultra-deep code analysis of 600+ files

---

## 🎯 Executive Summary

**Project is 65% complete** with 3 critical blockers preventing beta launch:

1. Test infrastructure missing (4-6 hours to fix)
2. ASR worker has placeholder code (3-5 days to fix)
3. MeetingListSidebar.tsx missing (4-6 hours to fix)

**Recommended Approach:** Fix critical blockers first, then systematic quality improvements.

---

## 📊 Current State (Verified)

### ✅ What's Complete

- **54 React components** (complete UI library)
- **23 backend services** (95% functional)
- **13 IPC handlers** (all implemented)
- **Audio capture pipeline** (100% complete)
- **Database layer** (100% complete)
- **Build system** (working, creates installers)
- **Tiptap editor** (fully integrated with Yjs)

### 🔴 Critical Blockers

1. **No vitest.config.ts** - 23 test files cannot execute
2. **ASR worker placeholder code** - Transcription doesn't work
3. **MeetingListSidebar.tsx missing** - UI incomplete

### ⚠️ High Priority Gaps

- Performance testing not executed
- Type safety issues (50+ `any` types)
- LLM integration incomplete
- End-to-end testing not started

---

## 🚀 Week-by-Week Action Plan

### Week 1: Critical Blockers (MUST FIX)

#### Day 1: Test Infrastructure Setup

**Priority:** 🔴 CRITICAL  
**Time:** 4-6 hours  
**Owner:** Backend Developer

**Tasks:**

1. Create `vitest.config.ts`

   ```typescript
   import { defineConfig } from 'vitest/config'

   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       setupFiles: ['./tests/setup.ts'],
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html'],
       },
     },
   })
   ```

2. Add test script to `package.json`

   ```json
   "scripts": {
     "test": "vitest",
     "test:ui": "vitest --ui",
     "test:coverage": "vitest --coverage"
   }
   ```

3. Remove `@ts-nocheck` from 5 test files:
   - `src/main/services/__tests__/AudioPipelineService.externalDevices.test.ts`
   - `src/main/database/__tests__/crud.test.ts`
   - `src/main/database/__tests__/fts5-triggers.test.ts`
   - `src/main/database/__tests__/transcript-meeting-linkage.test.ts`
   - `src/main/ipc/handlers/__tests__/transcript-event-forwarding.test.ts`

4. Fix type errors in tests

5. Run all 23 test suites

   ```bash
   npm run test
   ```

6. Set up GitHub Actions CI/CD
   ```yaml
   # .github/workflows/test.yml
   name: Tests
   on: [push, pull_request]
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
         - run: npm ci
         - run: npm run test
   ```

**Success Criteria:**

- ✅ All 23 test suites execute
- ✅ 0 files use `@ts-nocheck`
- ✅ CI/CD pipeline running

---

#### Days 2-4: ASR Worker Implementation

**Priority:** 🔴 CRITICAL  
**Time:** 3-5 days  
**Owner:** ML/Audio Engineer

**Tasks:**

1. **Day 2: Research & Setup**
   - Research whisper.cpp Node.js bindings
   - Options: `whisper-node`, `node-whisper`, or direct FFI
   - Install chosen binding: `npm install whisper-node`
   - Download test audio files

2. **Day 3: Core Implementation**
   - Replace placeholder at line 153-154 (model loading)

     ```typescript
     // Before:
     // TODO: Implement Whisper.cpp loading

     // After:
     import { Whisper } from 'whisper-node'
     const whisper = new Whisper(modelPath)
     await whisper.load()
     ```

   - Replace placeholder at line 219-220 (transcription)

     ```typescript
     // Before:
     // TODO: Implement actual Whisper.cpp transcription

     // After:
     const result = await whisper.transcribe(audioBuffer, {
       language: 'en',
       word_timestamps: true,
     })
     ```

   - Replace placeholder at line 238 (transcript text)

     ```typescript
     // Before:
     text: 'This is a placeholder transcript from Whisper turbo.'

     // After:
     text: result.text
     ```

3. **Day 4: Token Decoding & Cleanup**
   - Implement proper token decoding (line 323-324)
   - Implement resource cleanup (line 334-335)
   - Add error handling
   - Add logging

4. **Day 4-5: Testing & Benchmarking**
   - Test with real audio files
   - Benchmark performance (target: 51.8x RT for Whisper turbo)
   - Test with different audio lengths (10s, 30s, 60s)
   - Verify word timestamps
   - Test memory usage

**Success Criteria:**

- ✅ Real transcription working
- ✅ Performance meets targets (>50x RT)
- ✅ Word timestamps accurate
- ✅ Memory usage acceptable (<2GB)

---

#### Day 5: MeetingListSidebar Component

**Priority:** 🔴 CRITICAL  
**Time:** 4-6 hours  
**Owner:** Frontend Developer

**Tasks:**

1. Create `src/renderer/components/MeetingListSidebar.tsx`

   ```typescript
   import React, { useState } from 'react'
   import './MeetingListSidebar.css'

   interface Meeting {
     id: string
     title: string
     date: Date
     duration: number
   }

   export const MeetingListSidebar: React.FC = () => {
     const [meetings, setMeetings] = useState<Meeting[]>([])
     const [searchQuery, setSearchQuery] = useState('')

     // Implement meeting list with search
     // Implement date filtering
     // Implement click to navigate

     return (
       <div className="meeting-list-sidebar">
         {/* Implementation */}
       </div>
     )
   }
   ```

2. Connect to meeting APIs

   ```typescript
   const { data: meetings } = useQuery({
     queryKey: ['meetings'],
     queryFn: () => window.electronAPI.meeting.getAll(),
   })
   ```

3. Implement search functionality
4. Implement date filtering
5. Implement click to navigate
6. Test with 20+ meetings

**Success Criteria:**

- ✅ Component renders correctly
- ✅ Search works
- ✅ Date filtering works
- ✅ Navigation works
- ✅ Tested with 20+ meetings

---

### Week 2-3: High Priority Issues

#### Week 2, Days 1-2: Type Safety Fixes

**Priority:** ⚠️ HIGH  
**Time:** 2-3 days  
**Owner:** Backend Developer

**Tasks:**

1. Replace `any` types in AuditLogger.ts (7 instances)
2. Replace `any` types in DiagnosticLogger.ts (4 instances)
3. Replace `any` types in CloudTranscriptionService.ts (6 instances)
4. Replace `any` types in SyncManager.ts (1 instance)
5. Replace `any` types in PiyAPIBackend.ts (4 instances)
6. Add proper interfaces for all data types
7. Enable stricter TypeScript checks

**Success Criteria:**

- ✅ <10 `any` types remaining
- ✅ All interfaces defined
- ✅ No type errors

---

#### Week 2, Days 3-5: Complete LLM Integration

**Priority:** ⚠️ HIGH  
**Time:** 3-5 days  
**Owner:** ML Engineer

**Tasks:**

1. Complete Ollama integration
2. Implement batch expansion
3. Test streaming thoroughly
4. Implement context window management
5. Implement dual LLM strategy (Qwen + Llama)
6. Implement MLX engine for Apple Silicon

**Success Criteria:**

- ✅ Note expansion works
- ✅ Batch expansion works
- ✅ Streaming works
- ✅ Context window managed
- ✅ Dual LLM working

---

#### Week 3: Performance Testing

**Priority:** 🔴 CRITICAL  
**Time:** 1 week  
**Owner:** QA Engineer + Backend Developer

**Tasks:**

1. **Memory Profiling**
   - Test 60-minute meeting
   - Test 120-minute meeting
   - Test 480-minute meeting
   - Target: RAM <6GB
   - Monitor every 10 seconds

2. **CPU Profiling**
   - Monitor during transcription
   - Monitor during note expansion
   - Target: CPU <60% average

3. **Transcription Lag**
   - Measure time from speech to display
   - Target: <10s lag
   - Ideal: <5s lag

4. **Search Latency**
   - Test with 100 meetings
   - Test with 1000 transcripts
   - Target: <100ms
   - Ideal: <50ms

5. **Startup Time**
   - Measure cold start
   - Measure warm start
   - Target: <3s
   - Ideal: <2s

6. **Long Duration Testing**
   - Run 60-minute test
   - Run 120-minute test
   - Run 480-minute test
   - Check for memory leaks
   - Check for crashes

**Success Criteria:**

- ✅ RAM <6GB (60min meeting)
- ✅ CPU <60% average
- ✅ Transcription lag <10s
- ✅ Search latency <100ms
- ✅ Startup time <3s
- ✅ No memory leaks
- ✅ No crashes

---

### Week 4-5: Testing & Quality

#### Week 4: End-to-End Testing

**Priority:** 🔴 CRITICAL  
**Time:** 1 week  
**Owner:** QA Engineer

**Tasks:**

1. Set up E2E testing framework (Playwright)

   ```bash
   npm install -D @playwright/test
   ```

2. Execute all 20 test scenarios from `tests/END_TO_END_TEST_PLAN.md`:
   - Suite 1: Onboarding Flow (2 tests)
   - Suite 2: Meeting Recording (2 tests)
   - Suite 3: Encryption & Sync (2 tests)
   - Suite 4: Performance Testing (4 tests)
   - Suite 5: Long Duration Testing (2 tests)
   - Suite 6: Multi-Device Testing (2 tests)
   - Suite 7: Security Testing (2 tests)
   - Suite 8: Tier-Based Features (2 tests)
   - Suite 9: Error Handling (2 tests)

3. Fix critical bugs found
4. Document test results
5. Add E2E tests to CI/CD

**Success Criteria:**

- ✅ All 20 test scenarios pass
- ✅ Critical bugs fixed
- ✅ E2E tests in CI/CD

---

#### Week 5, Days 1-2: Code Quality Improvements

**Priority:** ⚠️ MEDIUM  
**Time:** 2-3 days  
**Owner:** All Developers

**Tasks:**

1. Replace console.log with DiagnosticLogger (8 files)
2. Add error boundaries to views
3. Add loading states to components
4. Add React.memo to pure components
5. Add useCallback/useMemo where needed
6. Fix empty catch blocks (2 instances)

**Success Criteria:**

- ✅ No console.log in production code
- ✅ Error boundaries in place
- ✅ Loading states complete
- ✅ Performance optimizations applied

---

#### Week 5, Days 3-5: CI/CD & Infrastructure

**Priority:** ⚠️ HIGH  
**Time:** 2-3 days  
**Owner:** DevOps Engineer

**Tasks:**

1. **GitHub Actions Workflow**
   - Automated testing
   - Automated builds
   - Automated releases
   - Deployment notifications

2. **Crash Reporting (Sentry)**

   ```bash
   npm install @sentry/electron
   ```

   - Set up Sentry account
   - Integrate Sentry SDK
   - Configure error reporting
   - Test crash reporting

3. **Auto-Update System**
   - Set up update server
   - Test auto-update flow
   - Implement rollback mechanism
   - Create update UI

**Success Criteria:**

- ✅ CI/CD pipeline working
- ✅ Sentry integrated
- ✅ Auto-updates working

---

### Week 6-8: Production Readiness

#### Week 6: Security Audit

**Priority:** ⚠️ HIGH  
**Time:** 1 week  
**Owner:** Security Engineer

**Tasks:**

1. Run automated security scans

   ```bash
   npm audit
   npx snyk test
   ```

2. Conduct code security review
3. Test encryption round-trip extensively
4. Verify PHI detection accuracy
5. Add input validation
6. Add rate limiting
7. Add CSRF protection
8. Consider third-party security audit

**Success Criteria:**

- ✅ No critical vulnerabilities
- ✅ Encryption verified
- ✅ PHI detection accurate
- ✅ Input validation complete

---

#### Week 7: Code Signing & Distribution

**Priority:** ⚠️ HIGH  
**Time:** 3-4 days + $299 budget  
**Owner:** DevOps Engineer

**Tasks:**

1. **Purchase Certificates**
   - Windows code signing certificate ($200/year)
   - Apple Developer Program ($99/year)

2. **Set Up Code Signing**
   - Configure Windows signing
   - Configure macOS signing
   - Configure macOS notarization

3. **Test Installers**
   - Test on clean Windows machine
   - Test on clean macOS machine
   - Verify no security warnings
   - Test without admin rights

**Success Criteria:**

- ✅ Certificates purchased
- ✅ Code signing working
- ✅ No security warnings
- ✅ Installers tested

---

#### Week 8: Beta Launch Preparation

**Priority:** 🔴 CRITICAL  
**Time:** 1 week  
**Owner:** Product Manager + All Team

**Tasks:**

1. **Final Testing**
   - Smoke tests on all platforms
   - User acceptance testing
   - Performance verification
   - Security verification

2. **Documentation Updates**
   - Update README.md
   - Update API documentation
   - Create user guide
   - Create troubleshooting guide

3. **Beta User Onboarding**
   - Create beta invite system (20-50 users)
   - Set up feedback collection
   - Create beta testing guide
   - Prepare launch announcement

4. **Monitoring Setup**
   - Set up analytics (Mixpanel/Amplitude)
   - Set up monitoring (Datadog/New Relic)
   - Set up alerting
   - Create dashboards

5. **Beta Deployment**
   - Deploy to beta users
   - Monitor feedback daily
   - Fix critical bugs within 24 hours

**Success Criteria:**

- ✅ All tests passing
- ✅ Documentation complete
- ✅ Beta users onboarded
- ✅ Monitoring in place
- ✅ Beta deployed

---

## 📋 Task Checklist

### Week 1: Critical Blockers

- [ ] Day 1: Set up vitest (4-6 hours)
- [ ] Days 2-4: Implement whisper.cpp (3-5 days)
- [ ] Day 5: Create MeetingListSidebar (4-6 hours)

### Week 2-3: High Priority

- [ ] Week 2, Days 1-2: Fix type safety issues (2-3 days)
- [ ] Week 2, Days 3-5: Complete LLM integration (3-5 days)
- [ ] Week 3: Execute performance tests (1 week)

### Week 4-5: Testing & Quality

- [ ] Week 4: End-to-end testing (1 week)
- [ ] Week 5, Days 1-2: Code quality improvements (2-3 days)
- [ ] Week 5, Days 3-5: CI/CD & infrastructure (2-3 days)

### Week 6-8: Production Readiness

- [ ] Week 6: Security audit (1 week)
- [ ] Week 7: Code signing & distribution (3-4 days)
- [ ] Week 8: Beta launch preparation (1 week)

---

## 🎯 Success Metrics

### Beta Launch Criteria

- ✅ All 3 critical blockers fixed
- ✅ All 23 test suites passing
- ✅ Performance targets met
- ✅ 20/20 E2E test scenarios passing
- ✅ Security audit complete
- ✅ Code signing working
- ✅ 20-50 beta users onboarded

### Quality Metrics

- Test Coverage: >80%
- Type Safety: <10 `any` types
- Performance: RAM <6GB, CPU <60%
- Startup Time: <3s
- Search Latency: <100ms
- Transcription Lag: <10s

### Production Readiness Score

- Backend Services: 95/100 ✅
- Frontend: 85/100 (after fixes)
- Testing: 80/100 (after E2E)
- Build System: 85/100 ✅
- Security: 85/100 (after audit)
- Performance: 80/100 (after testing)
- Documentation: 90/100 ✅
- Infrastructure: 70/100 (after setup)

**Target Overall Score: 85/100** (Beta Ready)

---

## 💰 Budget Requirements

### Required Purchases

- Windows Code Signing Certificate: $200/year
- Apple Developer Program: $99/year
- **Total: $299/year**

### Optional Services

- Sentry (Crash Reporting): $26/month (Team plan)
- Mixpanel/Amplitude (Analytics): $0-$25/month (Startup plan)
- Datadog/New Relic (Monitoring): $0-$15/month (Free tier)
- **Total Optional: $0-$66/month**

---

## 👥 Team Requirements

### Minimum Team (Realistic Timeline: 10-12 weeks)

- 1 Backend Developer (full-time)
- 1 Frontend Developer (full-time)
- 1 ML/Audio Engineer (part-time, weeks 1-2)
- 1 QA Engineer (part-time, weeks 3-5)
- 1 DevOps Engineer (part-time, weeks 5-7)
- 1 Product Manager (part-time, week 8)

### Optimal Team (Optimistic Timeline: 6-8 weeks)

- 2 Backend Developers (full-time)
- 2 Frontend Developers (full-time)
- 1 ML/Audio Engineer (full-time)
- 1 QA Engineer (full-time)
- 1 DevOps Engineer (full-time)
- 1 Product Manager (full-time)

---

## 🚨 Risk Mitigation

### High-Risk Items

1. **Whisper.cpp Integration** (Week 1)
   - Risk: May take longer than 3-5 days
   - Mitigation: Research bindings on Day 1, have fallback plan
   - Fallback: Use cloud transcription (Deepgram) temporarily

2. **Performance Testing** (Week 3)
   - Risk: May not meet targets
   - Mitigation: Profile early, optimize incrementally
   - Fallback: Adjust targets, add performance mode

3. **E2E Testing** (Week 4)
   - Risk: May find critical bugs
   - Mitigation: Fix bugs immediately, extend timeline if needed
   - Fallback: Delay beta launch by 1-2 weeks

### Medium-Risk Items

1. **Type Safety Fixes** (Week 2)
   - Risk: May break existing code
   - Mitigation: Fix incrementally, test after each change

2. **Code Signing** (Week 7)
   - Risk: Certificate approval may take time
   - Mitigation: Apply for certificates in Week 1

---

## 📈 Timeline Estimates

### Optimistic (6-8 weeks)

- Team of 6-7 developers
- No major blockers
- Parallel development
- **Beta Launch: Week 6-8**

### Realistic (10-12 weeks)

- Team of 3-4 developers
- Some blockers expected
- Sequential development
- **Beta Launch: Week 10-12**

### Pessimistic (16-20 weeks)

- Team of 1-2 developers
- Major blockers
- Limited resources
- **Beta Launch: Week 16-20**

---

## 🎉 Beta Launch Checklist

### Pre-Launch (Week 8, Day 1-3)

- [ ] All critical blockers fixed
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Security audit complete
- [ ] Code signing working
- [ ] Documentation complete
- [ ] Monitoring in place

### Launch Day (Week 8, Day 4)

- [ ] Deploy to beta users
- [ ] Send beta invites
- [ ] Monitor for crashes
- [ ] Monitor for errors
- [ ] Collect feedback

### Post-Launch (Week 8, Day 5-7)

- [ ] Review feedback daily
- [ ] Fix critical bugs within 24 hours
- [ ] Monitor performance metrics
- [ ] Monitor usage analytics
- [ ] Plan next iteration

---

## 📞 Support & Escalation

### Critical Issues (P0)

- Response Time: <1 hour
- Resolution Time: <24 hours
- Examples: App crashes, data loss, security breach

### High Priority Issues (P1)

- Response Time: <4 hours
- Resolution Time: <3 days
- Examples: Feature not working, performance issues

### Medium Priority Issues (P2)

- Response Time: <1 day
- Resolution Time: <1 week
- Examples: UI bugs, minor issues

### Low Priority Issues (P3)

- Response Time: <3 days
- Resolution Time: <2 weeks
- Examples: Polish, enhancements

---

**Plan Created:** February 25, 2026  
**Plan Owner:** Product Manager  
**Next Review:** End of Week 1  
**Status:** READY TO EXECUTE
