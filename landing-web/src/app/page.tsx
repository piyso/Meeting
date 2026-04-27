"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu, Download, ArrowRight, CheckCircle,
  EyeOff, PenLine, Search, Cpu, Check, ArrowDownCircle, X
} from "lucide-react";
import { Logo3D } from "../components/Logo3D";
import Image from "next/image";

/* ─── animation variants ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8 } },
};

/* ─── Typing hook ─── */
function useTypingAnimation(text: string, speed = 30, triggerRef: React.RefObject<HTMLElement | null>) {
  const [displayed, setDisplayed] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!triggerRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let i = 0;
          const tick = () => {
            if (i < text.length) {
              setDisplayed(text.slice(0, i + 1));
              i++;
              setTimeout(tick, speed + Math.random() * 35);
            }
          };
          tick();
          obs.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(triggerRef.current);
    return () => obs.disconnect();
  }, [text, speed, triggerRef]);

  return displayed;
}



/* ═══════════════════════════════════════════════════ */
export default function Home() {
  const [activeRole, setActiveRole] = useState("founders");
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copyText, setCopyText] = useState("Copy");
  const [engineExpanded, setEngineExpanded] = useState(false);
  const [securityExpanded, setSecurityExpanded] = useState(false);

  // refs for intersection-based animations
  const engineTextRef = useRef<HTMLParagraphElement>(null);


  const typedText = useTypingAnimation(
    "sarah will finalize graphql payload... blocker is devops staging lambda... target shifted to friday eod",
    25,
    engineTextRef
  );


  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        setEngineExpanded(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText("sudo xattr -cr /Applications/BlueArkive.app");
    setCopyText("Copied!");
    setTimeout(() => setCopyText("Copy"), 1500);
  }, []);

  const roles = [
    { id: "founders", label: "Founders", title: "Investor Commitments & Hiring Actions", desc: "BlueArkive listens to your pitch and automatically organizes 'soft yesses', stated check sizes, and follow-up materials requested by partners.", pre: "+ Investor: Sequoia (Partner Meeting)\n  - Expressed interest: $2M allocation\n  - Action: Send updated ARR projection model by EOD" },
    { id: "engineers", label: "Engineers", title: "Architecture Decisions & Jira Tickets", desc: "Never write another ticket. BlueArkive converts standups into actionable engineering tasks, documenting PR blockers and API payload changes.", pre: "+ Epic: Migration to GraphQL\n  - Decision: Use Apollo Federation (approved by Sarah)\n  - Blocker: Staging DB credentials taking too long" },
    { id: "sales", label: "Sales", title: "BANT Qualification & Objections", desc: "BlueArkive listens to discovery calls and fills out Budget, Authority, Need, and Timeline directly, logging specific competitor mentions.", pre: "+ Lead: Acme Corp (Enterprise)\n  - Budget: $150k approved in Q3\n  - Objection: Security review turnaround time" },
    { id: "product", label: "Product", title: "User Friction & Feature Requests", desc: "Turn user interviews into a structured database. BlueArkive flags emotional friction points and maps feature requests to existing epics.", pre: "+ Interview: Beta User 042\n  - Friction: Onboarding tooltips feel overwhelming\n  - Request: Ability to export metrics to CSV (High Priority)" },
  ];

  const activeRoleData = roles.find((r) => r.id === activeRole) || roles[0];

  return (
    <main>
      {/* ═══ VIDEO BACKGROUND ═══ */}
      <video className="video-bg" autoPlay muted loop playsInline>
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260315_073750_51473149-4350-4920-ae24-c8214286f323.mp4"
          type="video/mp4"
        />
      </video>
      <div className="video-overlay" />

      {/* ═══ NAV ═══ */}
      <nav className={`hero-nav ${scrolled ? "scrolled" : ""}`} id="main-nav">
        <a href="#" className="nav-logo">
          <Image src="/logo.svg" alt="BlueArkive Logo" width={32} height={32} />
          BlueArkive
        </a>
        <div className="nav-links">
          <a href="#features">Architecture</a>
          <a href="#trust">Security</a>
          <a href="#pricing">Nodes</a>
          <a href="#download" className="nav-cta liquid-glass-strong">Initialize Core</a>
        </div>
        <button
          className="menu-btn liquid-glass"
          style={{ display: "none", padding: "0.5rem", borderRadius: "0.5rem", border: "none", color: "white", cursor: "pointer", background: "transparent" }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="hero content-layer" id="hero">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="hero-inner liquid-glass-strong"
        >
          <div className="hero-badge liquid-glass">
            <span className="dot" />
            v0.3.3 CORE ONLINE
          </div>

          <h1>
            Your meetings.
            <br />
            <em>Perfectly remembered.</em>
          </h1>

          <p style={{ marginBottom: "0.5rem", fontSize: "0.8125rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(200,220,255,0.6)" }}>
            The Sovereign Memory Fabric.
          </p>

          <p className="hero-sub">
            Private AI meeting notes that run 100% locally on your machine. No creepy bots joining your calls. No cloud servers. No monthly fees.
          </p>

          <div className="hero-actions">
            <a href="#download" className="btn-primary liquid-glass-strong">
              <span className="icon-circle">
                <Download style={{ width: 14, height: 14 }} />
              </span>
              Download Free
            </a>
            <a href="#features" className="btn-secondary">
              See How It Works
              <ArrowRight style={{ width: 16, height: 16 }} />
            </a>
          </div>

          <div className="hero-trust">
            <CheckCircle style={{ width: 14, height: 14 }} />
            <span style={{ color: "rgba(255,255,255,0.6)" }}>macOS · Apple Silicon &amp; Intel</span>
          </div>

          <p style={{ marginTop: "0.75rem", fontSize: "0.6875rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em" }}>
            ✓ FREE FOREVER: Zero cost. Zero cloud. Local processing.
          </p>


        </motion.div>
      </section>

      {/* ═══ ENGINE DEMO ═══ */}
      <section className="section-pad content-layer" id="engine" style={{ position: 'relative' }}>
        <Logo3D />
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <p className="section-label">BlueArkive Inference Engine</p>
          <h2 className="section-title">You type:</h2>

          <div className="engine-demo liquid-glass-strong">
            <div className="engine-input liquid-glass" onClick={() => setEngineExpanded(true)} style={{ cursor: "pointer", transition: "all 0.3s ease" }}>
              <AnimatePresence mode="wait">
                {!engineExpanded ? (
                  <motion.div key="typing" exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                    <p className="engine-text" ref={engineTextRef}>
                      {typedText}
                      <span style={{ display: "inline-block", width: 2, height: "1em", background: "rgba(255,255,255,0.6)", marginLeft: 2, animation: "pulse-dot 1s infinite" }} />
                    </p>
                    <div className="shortcut">
                      Press <kbd>⌘</kbd>+<kbd>Enter</kbd>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="expanded"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={{ textAlign: "left" }}
                  >
                    <h4 style={{ color: "var(--brand-emerald)", marginBottom: "0.5rem", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle style={{ width: 14, height: 14 }} /> Extracted Action Items
                    </h4>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem", color: "rgba(255,255,255,0.9)", lineHeight: "1.6" }}>
                      <li><strong style={{ color: "white" }}>Sarah:</strong> Finalize GraphQL payload</li>
                      <li style={{ color: "rgba(255,180,180,1)" }}><strong style={{ color: "white" }}>DevOps:</strong> Unblock staging lambda (Blocker)</li>
                      <li><strong style={{ color: "white" }}>Timeline:</strong> Target shifted to Friday EOD</li>
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="engine-stats">
              {[
                { val: "0 Bytes", label: "Sent to the cloud" },
                { val: "AES-256", label: "Military-grade encryption" },
                { val: "Instant", label: "Local execution speed" },
                { val: "100%", label: "Offline uptime guarantee" },
              ].map((stat) => (
                <div key={stat.label} className="engine-stat liquid-glass">
                  <span className="val">{stat.val}</span>
                  <span className="label">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ═══ ROLE-BASED ═══ */}
      <section className="section-pad content-layer role-section" id="roles">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <p className="section-label">Built for how you work.</p>
          <h2 className="section-title">
            BlueArkive adapts its inference engine
            <br />
            to your role, extracting exactly
            <br />
            what you need <em>without being asked.</em>
          </h2>

          <div className="role-tabs">
            {roles.map((r) => (
              <button
                key={r.id}
                className={`role-tab ${activeRole === r.id ? "liquid-glass-strong active" : "liquid-glass"}`}
                onClick={() => setActiveRole(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeRole}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="role-card liquid-glass-strong"
            >
              <h4>Automatically Extracts</h4>
              <h3>{activeRoleData.title}</h3>
              <p className="desc">{activeRoleData.desc}</p>
              <pre className="liquid-glass">{activeRoleData.pre}</pre>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </section>

      {/* ═══ SOVEREIGNTY BANNER ═══ */}
      <section className="section-pad content-layer" style={{ textAlign: "center" }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <h2 className="section-title">
            Your ideas <em>belong to you.</em>
          </h2>
          <p className="section-desc centered">
            Stop handing your company&apos;s deepest strategies over to greedy cloud AI companies.
          </p>
        </motion.div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="section-pad content-layer" id="features">
        <div className="features-grid">
          {[
            {
              icon: EyeOff,
              title: "Your Invisible Scribe",
              heading: "Focus on the conversation.",
              desc: "Records your Zoom, Google Meet, or Teams calls silently in the background. No creepy bots joining your meetings. No complicated setup. It just works.",
              bullets: ["Works instantly with all meeting apps", "Transcribes everything as it happens", "Zero lag, completely free forever"],
              tip: "💡 Try this: Join a meeting. It automatically starts preserving context.",
            },
            {
              icon: PenLine,
              title: "Your Decision Timeline",
              heading: "Jot a thought. Write a chapter.",
              desc: "Type a rough bullet like 'follow up on budget'. Press ⌘+Enter. BlueArkive reads the transcript and instantly expands your shorthand into a perfect summary.",
              bullets: ["Natural language expansion", "Auto-assigns action items", "Context-aware formatting"],
              tip: '💡 Try this: Document an "Action Item" and watch it auto-assign.',
            },
            {
              icon: Search,
              title: "Semantic Magic",
              heading: "Find anything instantly.",
              desc: 'Press ⌘+K anywhere to search your entire history by meaning, not just exact keywords. Ask "what was the marketing budget?" — we\'ll find the exact moment.',
              bullets: ["Meaning-based, not keyword-based", "Cross-meeting search", "Instant results"],
              tip: '💡 Try this: Search "pipeline blockers from yesterday".',
            },
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: i * 0.1 } },
              }}
              className="feature-card liquid-glass"
            >
              <div className="icon-wrap">
                <feature.icon style={{ width: 22, height: 22 }} />
              </div>
              <h3>{feature.title}</h3>
              <h2>{feature.heading}</h2>
              <p>{feature.desc}</p>
              <ul>
                {feature.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="tip">{feature.tip}</p>
            </motion.div>
          ))}

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.3 } } }}
            className="feature-card liquid-glass"
          >
            <div className="icon-wrap">
              <Cpu style={{ width: 22, height: 22 }} />
            </div>
            <h3>Sovereign Foundation</h3>
            <h2>Your hardware. Your intelligence.</h2>
            <p>BlueArkive runs beautifully on Mac, Windows, and Linux. Because it uses your own computer, the entire product is completely free — forever.</p>
            <div className="platform-grid" style={{ marginTop: "1.25rem" }}>
              {[
                { os: "macOS", desc: "Apple Silicon & Intel" },
                { os: "Windows", desc: "x64 Installer & Portable" },
                { os: "Linux", desc: "AppImage, .deb, .rpm" },
              ].map((p) => (
                <div key={p.os} className="platform-card liquid-glass">
                  <h3>{p.os}</h3>
                  <p>{p.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ TRUST ═══ */}
      <section className="section-pad content-layer" id="trust" style={{ textAlign: "center" }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <p className="section-label">Sovereignty over your context.</p>
          <h2 className="section-title">
            While typical AI tools require uploading
            <br />
            your meetings to their servers, our intelligence
            <br />
            lives <em>entirely on your machine.</em>
          </h2>
          <p className="section-desc centered" style={{ marginBottom: "2rem" }}>
            The Trust Test
          </p>

          <div style={{ maxWidth: 800, margin: "0 auto", borderRadius: "var(--radius-xl)", overflow: "hidden" }} className="liquid-glass-strong">
            <table className="trust-table">
              <thead>
                <tr>
                  <th></th>
                  <th>BlueArkive (Safe)</th>
                  <th>Cloud Note-Takers (Risky)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Data Locality</td>
                  <td className="safe">100% Local Processing</td>
                  <td className="risky">Sent to company servers</td>
                </tr>
                <tr>
                  <td>Training Opt-out</td>
                  <td className="safe">Zero data harvesting</td>
                  <td className="risky">Default opt-in</td>
                </tr>
                <tr>
                  <td>Meeting Presence</td>
                  <td className="safe">Invisible background app</td>
                  <td className="risky">Annoying bot joins call</td>
                </tr>
                <tr>
                  <td>Internet Requirement</td>
                  <td className="safe">Works offline natively</td>
                  <td className="risky">Fails without Wi-Fi</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <button
              onClick={() => setSecurityExpanded(!securityExpanded)}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.8125rem",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                cursor: "pointer"
              }}
            >
              {securityExpanded ? "Hide Architecture Details" : "View Security Architecture Details"}
            </button>

            <AnimatePresence>
              {securityExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ overflow: "hidden", marginTop: "1rem" }}
                >
                  <div className="liquid-glass" style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem", borderRadius: "var(--radius-lg)", textAlign: "left" }}>
                    <h4 style={{ color: "var(--brand-emerald)", marginBottom: "1rem", fontSize: "0.9rem" }}>Core Sovereign Architecture</h4>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem", color: "rgba(255,255,255,0.8)", lineHeight: "1.6" }}>
                      <li style={{ marginBottom: "0.75rem" }}>
                        <strong style={{ color: "white" }}>Encrypted At Rest:</strong> All contexts are stored in an AES-256 encrypted SQLite database (SQLCipher). The decryption key is locked in your OS keychain.
                      </li>
                      <li style={{ marginBottom: "0.75rem" }}>
                        <strong style={{ color: "white" }}>Edge Inference:</strong> Transcription and processing use heavily quantized local models (ONNX) running exclusively on your machine's neural engine.
                      </li>
                      <li>
                        <strong style={{ color: "white" }}>Zero Telemetry:</strong> The codebase contains zero analytics, trackers, or hidden API calls. We physically cannot see your data.
                      </li>
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section className="section-pad content-layer pricing-section" id="pricing">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <p className="section-label">Claim your sovereign node.</p>
          <h2 className="section-title">
            To ensure optimal performance and gather quality feedback,
            <br />
            the 100% free Personal Sanctuary tier is strictly
            <br />
            limited to our first <em>10,000 active users.</em>
          </h2>

          <div className="pricing-card liquid-glass-strong" style={{ marginTop: "2rem" }}>
            <p style={{ fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "0.5rem" }}>
              Personal Sanctuary (Early Adopter)
            </p>
            <p className="price">$0</p>
            <p className="price-note">Free for now. Free forever.</p>

            <ul>
              {[
                "Unlimited private meeting notes",
                "Floating 'focus' widget",
                "Smart thought expansion",
                "Magic meeting search",
                "Military-grade security AES-256",
                "Works completely offline",
              ].map((item) => (
                <li key={item}>
                  <Check style={{ width: 16, height: 16 }} /> {item}
                </li>
              ))}
            </ul>

            <a href="#download" className="btn-primary liquid-glass-strong" style={{ width: "100%", justifyContent: "center" }}>
              Download Free
            </a>
          </div>
        </motion.div>
      </section>

      {/* ═══ DOWNLOAD ═══ */}
      <section className="section-pad content-layer download-section" id="download">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <h2 className="section-title" style={{ textAlign: "center" }}>
            Download <em>BlueArkive.</em>
          </h2>
          <p className="section-desc centered">Free. Private. No account needed. Yours forever.</p>
          <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "rgba(255,255,255,0.4)", marginTop: "0.75rem" }}>
            💡 Your first meeting is 30 seconds away. Download, record a 2-minute test, and see the magic.
          </p>

          <div className="download-card liquid-glass-strong">
            <button className="download-btn liquid-glass-strong" style={{ width: "100%", justifyContent: "center" }}>
              <ArrowDownCircle style={{ width: 20, height: 20 }} />
              Download for macOS
            </button>
            <p className="download-meta">Apple Silicon · arm64 · 188 MB</p>
            <p className="download-alt">
              <a href="#">Download for Intel Mac instead (x64)</a>
            </p>
            <p className="download-alt">
              Also available soon for: <span style={{ color: "rgba(255,255,255,0.6)" }}>Windows</span> &amp; <span style={{ color: "rgba(255,255,255,0.6)" }}>Linux</span>
            </p>
          </div>

          {/* SETUP */}
          <p style={{ textAlign: "center", marginTop: "3rem", fontSize: "0.8125rem", color: "rgba(255,255,255,0.4)" }}>
            After downloading — three easy steps:
          </p>
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "rgba(255,255,255,0.3)" }}>
            Because BlueArkive is free and independent, Apple shows a security warning. This quick unlock takes 30 seconds.
          </p>

          <div className="setup-steps">
            {[
              { n: 1, t: "Drag to Applications", d: "Open the .dmg file and drag BlueArkive into Applications." },
              { n: 2, t: "Open Terminal", d: "Press ⌘ Space, type Terminal, press Enter." },
              { n: 3, t: "Paste & press Enter", d: "Paste the command below and type your Mac password when asked." },
            ].map((step) => (
              <div key={step.n} className="setup-step liquid-glass">
                <div className="step-num">{step.n}</div>
                <h4>{step.t}</h4>
                <p>{step.d}</p>
              </div>
            ))}
          </div>

          <div className="terminal-block liquid-glass" style={{ marginTop: "1.5rem" }}>
            <span>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>$</span> sudo xattr -cr /Applications/BlueArkive.app
            </span>
            <button className="copy-btn" onClick={handleCopy}>
              {copyText}
            </button>
          </div>
          <p style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.8125rem", color: "rgba(255,255,255,0.5)" }}>
            That&apos;s it! Double-click BlueArkive from Applications — it opens perfectly, forever.
          </p>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="content-layer">
        <div className="footer-inner">
          <div className="footer-brand">
            <a href="#" className="nav-logo" style={{ fontSize: "1.25rem" }}>
              <Image src="/logo.svg" alt="BlueArkive Logo" width={24} height={24} />
              BlueArkive
            </a>
            <p>The sovereign memory fabric.</p>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <h4>Product</h4>
              <a href="#features">Capabilities</a>
              <a href="#pricing">Pricing</a>
              <a href="#download">Download</a>
            </div>
            <div className="footer-col">
              <h4>Trust</h4>
              <a href="#trust">Architecture &amp; Security</a>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-badges">
            <span className="footer-badge liquid-glass">AES-256 Encryption</span>
            <span className="footer-badge liquid-glass">100% Offline</span>
            <span className="footer-badge liquid-glass">No Account Required</span>
          </div>
          <p className="footer-copy">© 2026. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
