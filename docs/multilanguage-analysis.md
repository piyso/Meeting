# PiyNotes Multilanguage Capability — Deep Analysis

> **Live-tested** 7 languages (Japanese, German, Hindi, Arabic, Chinese, Korean, Mixed) across PiyAPI cloud + every local service. Traced the complete pipeline from microphone to Knowledge Graph, testing each layer independently.

---

## 🧪 LIVE TEST RESULTS

### PiyAPI Cloud — Semantic Search (search_memories)

| Query Language | Target Language | Content About                              | Similarity Score | Verdict         |
| :------------- | :-------------- | :----------------------------------------- | :--------------- | :-------------- |
| English        | Japanese 🇯🇵     | "budget decision meeting" → 予算/会議      | **0.894**        | ✅ Excellent    |
| Japanese       | Japanese        | "予算 会議 決定" → exact match             | **0.934**        | ✅ Near-perfect |
| German         | German 🇩🇪       | "Wer ist für Marketing?" → Marketingbudget | **0.914**        | ✅ Excellent    |
| English        | Korean 🇰🇷       | "marketing strategy" → 마케팅 전략         | **0.901**        | ✅ Excellent    |
| English        | German          | "budget decision" → Marketingbudget        | **0.707**        | ✅ Good         |
| English        | Mixed 🌐        | "marketing budget" → 5-lang mixed content  | **0.528**        | ⚠️ Moderate     |
| English        | Chinese 🇨🇳      | "budget meeting" → 会议/产品               | **0.500**        | ⚠️ Moderate     |
| English        | Arabic 🇸🇦       | "budget meeting" → الاجتماع/الإنتاج        | **0.229–0.382**  | ⚠️ Weak         |
| English        | Hindi 🇮🇳        | "budget meeting" → बैठक/वेबसाइट            | **0.130–0.304**  | ❌ Very weak    |

**Conclusion**: PiyAPI's embedding model has strong **multilingual** support for CJK (Japanese, Korean, Chinese) and European languages (German). Arabic and Hindi/Devanagari score significantly lower. Cross-language retrieval WORKS — searching in English finds Korean/Japanese/German content.

---

### PiyAPI Cloud — AI Q&A (ask_memory)

| Test          | Question Language           | Answer Language | Correct?                    | Sources Found      |
| :------------ | :-------------------------- | :-------------- | :-------------------------- | :----------------- |
| English→All   | "What decisions were made?" | English         | ✅ Translated JP/CN/DE/AR   | 4 of 5 langs       |
| Korean→Korean | "김대리가 발표한 전략?"     | **Korean**      | ✅ Correct answer IN Korean | KR=1.0, Mixed=0.38 |

**ask_memory is REMARKABLE**:

- Asked in English → correctly **understood and translated** Japanese (予算/決定 → "budget needs to be finalized"), Chinese (推迟 → "postponed"), German (Marketingbudget → "marketing budget"), Arabic (الإنتاج → "production")
- Asked in Korean → answered **in Korean** with 1.0 relevance score
- Only missed Hindi memory (too low similarity score)

---

### PiyAPI Cloud — Knowledge Graph Ingestion (kg_ingest)

| Input Language  | Entities Extracted | Facts Extracted | Result               |
| :-------------- | :----------------- | :-------------- | :------------------- |
| **English**     | 5 entities         | 0 facts         | ✅ Works             |
| **German** 🇩🇪   | **6 entities**     | **4 facts**     | ✅ Works well        |
| **Japanese** 🇯🇵 | **0 entities**     | **0 facts**     | ❌ **TOTAL FAILURE** |
| **Korean** 🇰🇷   | **0 entities**     | **0 facts**     | ❌ **TOTAL FAILURE** |

**Critical finding**: PiyAPI's Knowledge Graph NER (Named Entity Recognition) pipeline is **English/Latin-script ONLY**. It extracts entities from German (Latin alphabet) but CANNOT extract ANY entities from CJK (Japanese/Korean/Chinese). This means:

- 田中 (Tanaka) → NOT recognized as a person
- 김대리 (Kim) → NOT recognized as a person
- 500万円 (5 million yen) → NOT recognized as an amount
- 李经理 (Manager Li) → NOT recognized as a person

---

### PiyAPI Cloud — Fuzzy Search (fuzzy_search)

| Query           | Language | Results       | Verdict                             |
| :-------------- | :------- | :------------ | :---------------------------------- |
| "予算" (budget) | Japanese | **0 results** | ❌ Trigram similarity fails for CJK |

**Why**: Fuzzy search uses **trigram similarity** (3-character substrings). CJK characters produce completely different trigrams than any stored text. This is a known limitation of PostgreSQL `pg_trgm` for ideographic scripts.

---

### PiyAPI Cloud — PHI Detection (check_phi)

| Input                             | Language       | Detected?               | Confidence |
| :-------------------------------- | :------------- | :---------------------- | :--------- |
| `1234 5678 9012` (Aadhaar format) | Hindi context  | ✅ **AADHAAR** detected | 0.97       |
| `123-45-6789` (SSN)               | English        | ✅ **SSN** detected     | 0.95       |
| `090-1234-5678`                   | Japanese phone | ❌ **MISSED**           | —          |
| `010-1234-5678`                   | Korean phone   | ❌ **MISSED**           | —          |

**PiyAPI PHI detection recognizes Indian Aadhaar** (impressive!) but misses Japanese and Korean phone number formats.

---

## 🔴 LOCAL PIPELINE — CRITICAL MULTILANGUAGE FAILURES

### Layer 1: ASR Worker (asr.worker.ts — 438 lines) — **ENGLISH ONLY**

This is the **most critical failure**. The entire transcription pipeline is hard-locked to English:

```
🎤 Audio → Moonshine Base ONNX → decodeTokens() → ASCII ONLY
```

**Evidence** (`asr.worker.ts` lines 306-320):

```typescript
function decodeTokens(tokens: Float32Array): string {
  const decoded: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tokenId = Math.round(tokens[i] ?? 0)
    if (tokenId > 0 && tokenId < 128) {
      // ← ASCII ONLY!
      decoded.push(String.fromCharCode(tokenId))
    }
  }
  return decoded.join('')
}
```

**Problem**: `tokenId < 128` = only ASCII characters (a-z, A-Z, 0-9, punctuation). Any non-English character is **silently dropped**. A Japanese meeting would produce empty/garbled text.

**Additional issue**: Whisper turbo (which supports 99 languages) is NOT actually used — `loadWhisperTurbo()` immediately falls back to Moonshine Base (line 167-175). And there is **NO language parameter** anywhere in the init or transcribe message.

**Impact**: The language dropdown in SettingsView does absolutely nothing. All audio is transcribed through an ASCII-only decoder.

---

### Layer 2: LocalEmbeddingService (446 lines) — **CJK TOKENIZER BROKEN**

```
"これは会議です" → tokenize() → replace(/[^\w\s]/g, ' ') → "      " → [UNK][UNK] → garbage
```

**Evidence** (`LocalEmbeddingService.ts` line 303-307):

```typescript
const words = text
  .toLowerCase()
  .replace(/[^\w\s]/g, ' ') // ← STRIPS ALL CJK CHARACTERS!
  .split(/\s+/)
  .filter(w => w.length > 0)
```

**Problem**: JavaScript's `\w` only matches `[a-zA-Z0-9_]`. All CJK characters (漢字, ひらがな, カタカナ), Devanagari (हिंदी), Arabic (عربي), and Korean (한글) are treated as **non-word characters** and replaced with spaces. They all become `[UNK]` tokens → nearly identical garbage embeddings for any non-Latin text.

**Impact**: Local semantic search (Free tier) is completely broken for non-English content. All non-Latin text produces near-identical meaningless embeddings.

**Fix**: Use Unicode-aware tokenization:

```typescript
const words = text
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Unicode letter/number categories
  .split(/\s+/)
  .filter(w => w.length > 0)
```

Also note: `all-MiniLM-L6-v2` is an **English-first** model. For proper multilingual local embeddings, switch to `paraphrase-multilingual-MiniLM-L12-v2` (50+ languages, similar size).

---

### Layer 3: LocalEntityExtractor (104 lines) — **English Regex Only**

```typescript
PERSON: /\b(?:(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+)?[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}\b/g
AMOUNT: /\$[\d,]+(?:\.\d{2})?[KMB]?\b/g
ACTION_ITEM: /\b(?:TODO|ACTION|TASK|need to|should|must|will)\b/gi
```

**Failures**:
| Pattern | Fails For | Example |
| :--- | :--- | :--- |
| PERSON `[A-Z][a-z]` | CJK names, Arabic names, Hindi names | 田中太郎, أحمد, राहुल |
| AMOUNT `\$` | Non-USD currencies | ¥5,000,000, €1,000, ₹50,000, ₩100,000 |
| DATE `\d{1,2}/\d{1,2}` | ISO dates, CJK date formats | 2024年3月15日, ١٥/٣/٢٠٢٤ |
| ACTION_ITEM `need to/should/must/will` | Non-English action language | する必要がある, يجب أن, करना होगा |

---

### Layer 4: PHIDetectionService (361 lines) — **US-Centric Only**

| Pattern                                 | Detects      | Misses                                             |
| :-------------------------------------- | :----------- | :------------------------------------------------- |
| SSN `\d{3}-\d{2}-\d{4}`                 | US SSN       | 🇮🇳 Aadhaar (12-digit), 🇯🇵 My Number, 🇰🇷 RRN        |
| PHONE `\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}` | US phones    | 🇯🇵 090-xxxx-xxxx, 🇰🇷 010-xxxx-xxxx, 🇮🇳 +91, 🇩🇪 +49 |
| ADDRESS `Street\|Ave\|Blvd...`          | US addresses | 東京都渋谷区, Straße, गली                          |
| AMOUNT `\$`                             | USD only     | ¥, €, ₹, ₩, £                                      |

**Note**: PiyAPI's cloud `check_phi` DID detect Indian Aadhaar (regex `\d{4}\s\d{4}\s\d{4}` format). The server-side PHI is slightly better than local but still misses CJK phone formats.

---

## 📊 COMPLETE PIPELINE LANGUAGE CAPABILITY MAP

```
AUDIO CAPTURE
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: ASR Worker (Moonshine Base)                         │
│ Languages: ❌ ENGLISH ONLY (ASCII decoder, tokenId < 128)    │
│ Fix: Switch to Whisper or fix Moonshine vocab/decoder        │
│ Effort: 🔴 Major (need new model or decoder rewrite)         │
└──────────────┬──────────────────────────────────────────────┘
               │ transcript text
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Local Entity Extraction                             │
│ Languages: ❌ ENGLISH ONLY (ASCII regex patterns)             │
│ Fix: Add Unicode-aware patterns per language                 │
│ Effort: 🟡 Medium (add regex sets per locale)                │
└──────────────┬──────────────────────────────────────────────┘
               │ entities
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Local PHI Detection                                 │
│ Languages: ❌ US-ONLY patterns                                │
│ Fix: Add Aadhaar, My Number, RRN, int'l phone patterns      │
│ Effort: 🟡 Medium (add pattern sets per country)             │
└──────────────┬──────────────────────────────────────────────┘
               │ PHI-scanned text
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Local Embedding (all-MiniLM-L6-v2)                  │
│ Languages: ❌ ENGLISH ONLY (tokenizer strips non-ASCII)       │
│ Fix: 1) Fix \w regex → \p{L}  2) Switch to multilingual     │
│      model (paraphrase-multilingual-MiniLM-L12-v2)           │
│ Effort: 🟡 Medium (regex fix) / 🔴 Major (model swap)       │
└──────────────┬──────────────────────────────────────────────┘
               │ embedding BLOBs
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: PiyAPI Cloud — Memory Storage                       │
│ Languages: ✅ ALL (stores any Unicode text perfectly)          │
│ Status: Working for all 7 tested languages                   │
└──────────────┬──────────────────────────────────────────────┘
               │
    ┌──────────┼──────────┬──────────┬──────────┐
    ▼          ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Search  │ │Ask     │ │KG      │ │Fuzzy   │ │PHI     │
│        │ │Memory  │ │Ingest  │ │Search  │ │Check   │
│✅ CJK  │ │✅ All  │ │❌ CJK  │ │❌ CJK  │ │⚠️ Weak │
│✅ Latin│ │✅ Trans-│ │✅ Latin│ │✅ Latin│ │✅ SSN  │
│⚠️ Hindi│ │  lates │ │❌ Hindi│ │⚠️ Hindi│ │✅ Aadhr│
│⚠️ Arab │ │  all   │ │❌ Arab │ │⚠️ Arab │ │❌ JP/KR│
│Score:  │ │        │ │        │ │        │ │ phone  │
│JP 0.93 │ │Answers │ │DE: 6/4 │ │JP: 0   │ │        │
│DE 0.91 │ │in query│ │JP: 0/0 │ │results │ │        │
│KR 0.90 │ │language│ │KR: 0/0 │ │        │ │        │
│CN 0.50 │ │        │ │        │ │        │ │        │
│AR 0.38 │ │        │ │        │ │        │ │        │
│HI 0.30 │ │        │ │        │ │        │ │        │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

---

## 🎯 VERDICT: Can PiyAPI Power Multilanguage PiyNotes?

### PiyAPI Cloud: **YES (with gaps)**

| Capability           | Multilingual?                           | Languages          |
| :------------------- | :-------------------------------------- | :----------------- |
| Memory Storage       | ✅ Full Unicode                         | All                |
| Semantic Search      | ✅ Strong for CJK/European              | JP/KR/CN/DE ≥ 0.50 |
| AI Q&A (ask_memory)  | ✅ Excellent — translates and answers   | All tested         |
| KG Entity Extraction | ❌ Latin-script only                    | EN/DE only         |
| Fuzzy Search         | ❌ Trigram fails for CJK                | Latin only         |
| PHI Detection        | ⚠️ Partial (Aadhaar ✅, JP/KR phone ❌) | EN/IN partial      |

### Local Pipeline: **NO (4 critical layers English-only)**

| Layer             | Multilingual?           | Blocking Issue                      |
| :---------------- | :---------------------- | :---------------------------------- |
| ASR (Moonshine)   | ❌ ASCII decoder        | `tokenId < 128` drops all non-ASCII |
| Entity Extraction | ❌ English regex        | `[A-Z][a-z]`, `$` prefix            |
| PHI Detection     | ❌ US patterns          | US phone/SSN/address only           |
| Local Embeddings  | ❌ Tokenizer strips CJK | `\w` = ASCII only                   |

---

## 🔧 FIXES REQUIRED (Priority Order)

### P0: Critical — Enable Non-English Transcription

| Fix                                         | File                              | Effort | Impact                          |
| :------------------------------------------ | :-------------------------------- | :----- | :------------------------------ |
| **Wire CloudTranscription for non-English** | `AudioPipelineService.ts`         | ~4hr   | Deepgram supports 36+ languages |
| **Fix Moonshine decoder**                   | `asr.worker.ts:306-320`           | ~2hr   | Extend beyond ASCII range       |
| **Pass language to ASR worker**             | `ASRService.ts` + `asr.worker.ts` | ~1hr   | Settings → Worker               |
| **Wire language setting**                   | `SettingsView.tsx` → pipeline     | ~30min | Connect dropdown                |

### P1: Important — Fix Local Processing

| Fix                                | File                           | Effort | Impact                            |
| :--------------------------------- | :----------------------------- | :----- | :-------------------------------- |
| **Fix embedding tokenizer**        | `LocalEmbeddingService.ts:303` | 1 line | `\w` → `\p{L}\p{N}`               |
| **Add international PHI patterns** | `PHIDetectionService.ts`       | ~3hr   | JP/KR/IN phone, Aadhaar, MyNumber |
| **Add Unicode entity patterns**    | `LocalEntityExtractor.ts`      | ~4hr   | CJK names, ¥/€/₹ amounts          |

### P2: Enhancement — Improve PiyAPI

| Fix                               | Where                        | Effort       | Impact                    |
| :-------------------------------- | :--------------------------- | :----------- | :------------------------ |
| **Request PiyAPI KG CJK support** | Server-side NER pipeline     | Backend team | KG for JP/KR/CN           |
| **Add CJK-aware fuzzy search**    | Server-side `pg_trgm` config | Backend team | Fuzzy for CJK             |
| **Switch local model**            | `LocalEmbeddingService.ts`   | ~2hr         | Use `multilingual-MiniLM` |

---

## 💡 RECOMMENDED MULTILANGUAGE STRATEGY

### Phase 1: Cloud-First (Fastest — 1 day)

1. Wire `CloudTranscriptionService` → `AudioPipelineService` for non-English languages
2. Deepgram supports 36+ languages with diarization
3. When `settings.language !== 'en'`, route to cloud transcription
4. PiyAPI semantic search already works cross-language
5. ask_memory already translates across languages

### Phase 2: Fix Local Tokenizer (1 hour)

1. Change `\w` → `\p{L}\p{N}` in `LocalEmbeddingService.ts`
2. Immediately improves local embedding quality for all scripts
3. Even with English-first MiniLM model, proper tokenization helps

### Phase 3: Local AI Multilingual (1 week)

1. Replace `all-MiniLM-L6-v2` with `paraphrase-multilingual-MiniLM-L12-v2` (~50 languages)
2. Fix Moonshine decoder or integrate Whisper ONNX with language parameter
3. Add Unicode-aware entity extraction patterns per language
4. Add international PHI patterns (Aadhaar, My Number, RRN, int'l phone)

### Phase 4: Full i18n (2 weeks)

1. UI string externalization (react-intl or i18next)
2. RTL support for Arabic/Hebrew
3. CJK line-break handling in transcript display
4. Date/number formatting per locale
5. PiyAPI KG improvements for non-Latin NER (server-side)
