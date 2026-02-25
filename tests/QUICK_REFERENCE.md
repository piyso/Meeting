# Audio Capture Test - Quick Reference Card

## 🚀 Quick Start (30 seconds)

```bash
cd tests
npm install
npm test
```

## 📋 Test Checklist

### Before Test
- [ ] Audio drivers updated
- [ ] System volume >50%
- [ ] Audio not muted
- [ ] YouTube ready in browser
- [ ] Other mic apps closed

### During Test
- [ ] Click "Run Full Test"
- [ ] Play YouTube audio
- [ ] Keep audio playing 10s
- [ ] Watch console output

### After Test
- [ ] Click "Export Results"
- [ ] Document in TEST_RESULTS.md
- [ ] Take screenshots if failed
- [ ] Note hardware details

## ✅ Pass Criteria

| Metric | Pass Value |
|--------|------------|
| Variance | > 0.0001 |
| Max RMS | > 0.01 |
| Audio Sources | ≥ 1 detected |
| Byte Stream | Changing values |

## 🎯 Success Rate Target

**≥80%** of machines must pass (4 out of 5)

## 🔧 Quick Fixes

### No Audio Sources?
```
Settings → Sound → Recording → Show Disabled Devices → Enable Stereo Mix
```

### Permission Denied?
```
Settings → Privacy → Microphone → Allow apps
```

### No Audio Detected?
```
1. Check volume >50%
2. Unmute audio
3. Verify YouTube playing
4. Try different video
```

## 📊 Result Codes

| Code | Meaning | Action |
|------|---------|--------|
| ✅ PASS | System audio works | Document & continue |
| ⚠️ PARTIAL_PASS | Mic fallback works | Document fallback |
| ❌ FAIL | No audio captured | Document failure mode |

## 🖥️ Test Machines Needed

1. **Realtek** laptop (common)
2. **Dedicated** sound card
3. **USB** audio interface
4. **High-end** motherboard audio
5. **Budget** generic driver

## 📁 Files to Submit

```
tests/results/
├── TEST_RESULTS.md (filled template)
├── audio-test-machine1-[timestamp].json
├── audio-test-machine2-[timestamp].json
├── audio-test-machine3-[timestamp].json
├── audio-test-machine4-[timestamp].json
└── audio-test-machine5-[timestamp].json
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+R | Run test |
| Ctrl+E | Export results |
| Ctrl+L | Clear output |

## 🆘 Emergency Contacts

- Check `README.md` for detailed help
- Review `AUDIO_CAPTURE_TEST_GUIDE.md` for full instructions
- Check DevTools console for errors

## 📈 Calculate Success Rate

```
Success Rate = (PASS + PARTIAL_PASS) / 5 × 100%

Example:
3 PASS + 1 PARTIAL_PASS + 1 FAIL = 80% ✅
```

## ⏱️ Time Estimate

- **Per machine**: ~15 minutes
- **Total (5 machines)**: ~75 minutes
- **Documentation**: ~30 minutes
- **Grand total**: ~2 hours

## 🎬 Test Flow

```
1. npm test
   ↓
2. Click "Run Full Test"
   ↓
3. Play YouTube audio
   ↓
4. Wait 10 seconds
   ↓
5. Click "Export Results"
   ↓
6. Document findings
   ↓
7. Repeat on next machine
```

---

**Print this card and keep it handy during testing!**
