---
marp: true
theme: default
class: invert
paginate: true
style: |
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  
  section {
    background-color: #030303;
    color: #e5e5e5;
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 26px;
    padding: 70px 90px;
    background-image: radial-gradient(circle at 50% 0%, #111111 0%, #030303 60%);
  }
  
  h1 {
    color: #ffffff;
    font-size: 72px;
    font-weight: 800;
    letter-spacing: -2.5px;
    line-height: 1.0;
    margin-bottom: 0.1em;
  }
  
  h2 {
    color: #ffffff;
    font-size: 46px;
    font-weight: 700;
    letter-spacing: -1.5px;
    margin-top: 0;
    margin-bottom: 0.8em;
  }

  h3 {
    color: #a3a3a3;
    font-size: 32px;
    font-weight: 400;
    letter-spacing: -0.5px;
  }
  
  p, li {
    font-size: 28px;
    line-height: 1.6;
    color: #8b8b8b;
  }

  strong {
    color: #f3f4f6;
    font-weight: 600;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }

  .card {
    background: rgba(20, 20, 20, 0.4);
    border: 1px solid #222222;
    border-radius: 12px;
    padding: 30px;
  }

  .card h3 {
    color: #ffffff;
    font-size: 28px;
    margin-top: 0;
    border-bottom: 1px solid #222222;
    padding-bottom: 15px;
    margin-bottom: 15px;
  }

  .card p {
    font-size: 24px;
    margin: 0;
  }

  .tech-pill {
    display: inline-block;
    background: transparent;
    color: #c4b5fd;
    padding: 8px 20px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 24px;
    margin: 6px;
    border: 1px solid #4c1d95;
    letter-spacing: -0.5px;
  }

  .footer {
    position: absolute;
    bottom: 40px;
    left: 90px;
    font-size: 14px;
    color: #525252;
    font-family: monospace;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .arch-box {
    background: #111111;
    padding: 20px;
    border-radius: 10px;
    border: 2px solid #333333;
    text-align: center;
    width: 20%;
    color: #ffffff;
    font-size: 20px;
    font-weight: 600;
  }
  
  .arch-sub {
    font-size: 15px;
    color: #888888;
    display: block;
    margin-top: 6px;
    font-weight: 400;
    letter-spacing: -0.5px;
  }
---

<!-- 
_class: lead
_backgroundColor: #000000
-->

<h1>BlueArkive.</h1>
<h3>The Sovereign AI Edge Node</h3>

<div class="footer">CONFIDENTIAL — EXECUTIVE BRIEFING 2026</div>

---

## The Surveillance Deficit

Modern AI meeting transcribers rely exclusively on remote compute. This structural flaw renders them unusable in heavily regulated enterprise environments.

<div class="grid-2">
  <div class="card">
    <h3>The Status Quo</h3>
    <p>A third-party bot joins the conference call, streams unencrypted proprietary audio to a cloud LLM, and violates strict GDPR/HIPAA compliance.</p>
  </div>
  <div class="card">
    <h3>The Sovereign Edge</h3>
    <p>All audio is ingested natively across OS-level hooks and transcribed via hardware acceleration locally on the user's CPU, maintaining absolute data privacy.</p>
  </div>
</div>

<div class="footer">BLUEARKIVE / 01</div>

---

## Engineering The Native Edge

BlueArkive functions as a hyper-optimized, zero-network desktop application. By relying on native C++ buffers, we avoid the lethal RAM spikes of typical Electron apps.

<div class="grid-2">
  <div class="card" style="border-color: #06b6d4; background: rgba(8, 145, 178, 0.05);">
    <h3 style="border-color: #164e63;">Zero-Copy Dual Audio</h3>
    <p>We bypass standard browser APIs by hooking simultaneously into system output and mic input using <code>SharedArrayBuffer</code> memory, driving memory-leak risk to zero during 3-hour sessions.</p>
  </div>
  <div class="card">
    <h3>Voice Activity Detection</h3>
    <p>To preserve CPU, an independent <code>Silero VAD</code> worker thread drops silent frames instantly, cutting overall inference workload by 40% before audio touches the transcription engine.</p>
  </div>
</div>

<div class="footer">BLUEARKIVE / 02</div>

---

## Core Architecture Flow

Our proprietary stack executes highly concurrent LLM processing entirely offline.

<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 70px;">
  <div class="arch-box">
    OS Audio
    <span class="arch-sub">SharedArrayBuffer</span>
  </div>
  <div style="color: #444; font-size: 24px;">▶</div>
  <div class="arch-box">
    Silero VAD
    <span class="arch-sub">Speech Filter</span>
  </div>
  <div style="color: #444; font-size: 24px;">▶</div>
  <div class="arch-box" style="background: rgba(76, 29, 149, 0.1); border-color: #6d28d9;">
    Whisper C++
    <span class="arch-sub" style="color: #a78bfa;">51.8x Real-Time</span>
  </div>
  <div style="color: #444; font-size: 24px;">▶</div>
  <div class="arch-box" style="background: rgba(15, 23, 42, 0.5); border-color: #0284c7;">
    SQLite WAL
    <span class="arch-sub" style="color: #38bdf8;">Memory State</span>
  </div>
  <div style="color: #444; font-size: 24px;">▶</div>
  <div class="arch-box">
    Qwen 2.5 3B
    <span class="arch-sub">Local Expansion</span>
  </div>
</div>

<div style="text-align: center; margin-top: 60px; color: #737373; font-size: 22px;">Audio is piped natively through the C++ transcription engine directly into local SQLite memory.</div>

<div class="footer">BLUEARKIVE / 03 / ARCHITECTURE</div>

---

## Model Ensemble Matrix

Deploying massive LLMs on commercial hardware requires extreme restraint. We benchmarked 40+ local foundation models to synthesize the ultimate fallback ensemble.

**The Phase 0 Hardware Loadout (16GB RAM Class):**
*   **Speech-to-Text:** Whisper Large V3 `Turbo` (C++)
      *   *Benchmark*: Processes a 30-second audio stream in exactly **0.58 seconds** (51.8x real-time).
*   **Natural Language Processor:** Qwen 2.5 3B (MLX optimized)
      *   *Benchmark*: Operates highly structured data expansion inside a 32k context window utilizing merely **2.2GB** of RAM footprint.

<div class="footer">BLUEARKIVE / 04</div>

---

## Offline Entity Architecture

Intelligence requires structured data. As a meeting progresses, the local engine identifies critical metadata in real-time.

It automatically utilizes regex and local parsing arrays to extract:
*   **Financial Thresholds & Budgets**
*   **Assigned Tasks & Deadlines**
*   **Key Personnel & Organizations**

These arrays are parsed into interactive "Smart Chips" inside the UI, letting the user instantly view every decision tied to a specific deadline across historical offline meetings.

<div class="footer">BLUEARKIVE / 05</div>

---

## The Encrypted RAG Paradox

How do you perform offline semantic search across multiple devices while keeping data completely blind to the server?

1.  **Local Vectors First:** The app deploys `all-MiniLM-L6-v2` locally to cast 384-dimensional mathematical arrays of your meetings onto your physical drive.
2.  **Military Grade Locking:** The raw text notes are subsequently locked in **AES-256-GCM** ciphertext.
3.  **The Result:** Your client search operates instantly and offline via relative cosine similarity, while the actual encrypted data can sync via the cloud securely without any server being able to read it.

<div class="footer">BLUEARKIVE / 06</div>

---

## 7. The Technology Stack
We didn't just connect APIs. We engineered a robust, 65,000+ line local intelligence fabric.

<br>

<div style="text-align: center;">
<span class="tech-pill">Electron</span> <span class="tech-pill">React</span> <span class="tech-pill">TypeScript</span>
<span class="tech-pill">SharedArrayBuffers (C++)</span> <span class="tech-pill">Hardware VAD Hooks</span>
<span class="tech-pill">SQLite (WAL Mode)</span> <span class="tech-pill">AES-256-GCM</span>
<span class="tech-pill">Whisper Turbo (GGUF)</span> <span class="tech-pill">Qwen 2.5 (3B)</span>
</div>

<div style="background: rgba(255,255,255,0.03); padding: 30px; border-radius: 12px; border-left: 6px solid #4f46e5; margin-top: 50px;">
  <h3 style="margin: 0 0 10px 0; font-size: 30px; color: #ffffff;">Privacy is not a premium feature.</h3>
  <div style="color: #a3a3a3; font-size: 26px; font-weight: 500;">It is the default architecture.</div>
</div>

<div class="footer">BLUEARKIVE 2026 // READY FOR DEPLOYMENT</div>
