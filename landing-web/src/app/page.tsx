'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu,
  ArrowRight,
  CheckCircle,
  EyeOff,

  Search,
  Cpu,
  Check,
  Sparkles,
  X,
} from 'lucide-react'
import { Logo3D } from '../components/Logo3D'
import { VocMarquee } from '../components/Marquee'
import Image from 'next/image'

/* ─── animation variants ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8 } },
}

/* ─── Typing hook ─── */
function useTypingAnimation(
  text: string,
  speed = 30,
  triggerRef: React.RefObject<HTMLElement | null>
) {
  const [displayed, setDisplayed] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (!triggerRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          let i = 0
          const tick = () => {
            if (i < text.length) {
              setDisplayed(text.slice(0, i + 1))
              i++
              setTimeout(tick, speed + Math.random() * 35)
            }
          }
          tick()
          obs.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    obs.observe(triggerRef.current)
    return () => obs.disconnect()
  }, [text, speed, triggerRef])

  return displayed
}

/* ═══════════════════════════════════════════════════ */
export default function Home() {
  const [activeRole, setActiveRole] = useState('founders')
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [engineExpanded, setEngineExpanded] = useState(false)
  const [securityExpanded, setSecurityExpanded] = useState(false)

  // refs for intersection-based animations
  const engineTextRef = useRef<HTMLParagraphElement>(null)

  const typedText = useTypingAnimation(
    'agent system initialized... ambient context ingestion active... synthesizing autonomous workflow graph...',
    25,
    engineTextRef
  )

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        setEngineExpanded(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const roles = [
    {
      id: 'knowledge-workers',
      label: 'Knowledge Workers',
      title: 'Continuous Cognitive Synthesis',
      desc: 'The Sovereign Memory Fabric autonomously monitors context, synthesizing fragmented data streams into unified, queryable knowledge graphs.',
      pre: '+ Agent: Knowledge Graph Compiler\n  - Action: Synthesize Q3 roadmap\n  - Result: 14 dependencies resolved automatically',
    },
    {
      id: 'engineers',
      label: 'Engineers',
      title: 'Autonomous System Architecture',
      desc: 'Never write a ticket again. The fabric converts technical discussions into actionable engineering epics, generating PRs and resolving blockers.',
      pre: '+ Agent: Architecture Synthesizer\n  - Decision: Migrate to Rust microservices\n  - Action: Generate boilerplate & open PR',
    },
    {
      id: 'executives',
      label: 'Executives',
      title: 'Strategic Pattern Recognition',
      desc: 'Ambient intelligence that connects the dots across the enterprise. Detects market shifts and internal friction points before they materialize.',
      pre: '+ Agent: Strategic Analyzer\n  - Insight: 40% increase in security objections\n  - Action: Generate new compliance battlecard',
    },
    {
      id: 'researchers',
      label: 'Researchers',
      title: 'Infinite Context Windows',
      desc: 'Process thousands of papers instantly. The fabric cross-references methodologies and generates novel hypotheses based on semantic overlap.',
      pre: '+ Agent: Hypothesis Generator\n  - Finding: Overlap in 3 recent neural architecture papers\n  - Output: Synthesized proposal for new attention mechanism',
    },
  ]

  const activeRoleData = roles.find(r => r.id === activeRole) || roles[0]

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
      <nav className={`hero-nav ${scrolled ? 'scrolled' : ''}`} id="main-nav">
        <a href="#hero" className="nav-logo">
          <Image src="/logo.svg" alt="Sovereign Logo" width={32} height={32} />
          Sovereign
        </a>
        <div className="nav-links">
          <a href="#features">Architecture</a>
          <a href="#trust">Security</a>
          <a href="#pricing">Nodes</a>
          <a href="/apply">Enterprise</a>
          <a href="/apply" className="nav-cta liquid-glass-strong">
            Request Access
          </a>
        </div>
        <button
          className="menu-btn liquid-glass"
          style={{
            padding: '0.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            background: 'transparent',
          }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* ═══ MOBILE MENU ═══ */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="mobile-menu liquid-glass-strong"
          >
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>
              Architecture
            </a>
            <a href="#trust" onClick={() => setMobileMenuOpen(false)}>
              Security
            </a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>
              Nodes
            </a>
            <a href="/apply" onClick={() => setMobileMenuOpen(false)}>
              Enterprise
            </a>
            <a href="/apply" onClick={() => setMobileMenuOpen(false)}>
              Request Access
            </a>
          </motion.div>
        )}
      </AnimatePresence>

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
            v0.3.5 CORE ONLINE
            <span
              style={{
                marginLeft: '8px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(99, 102, 241, 0.4)',
                border: '1px solid rgba(99, 102, 241, 0.6)',
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: '#a5b4fc',
              }}
            >
              BETA
            </span>
          </div>

          <h1>
            The Sovereign
            <br />
            <em>Memory Fabric.</em>
          </h1>

          <p
            style={{
              marginBottom: '0.5rem',
              fontSize: '0.8125rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(200,220,255,0.6)',
            }}
          >
            Constructing the autonomous agentic web.
          </p>

          <p className="hero-sub">
            Infinite recall, zero dependencies. 100% offline inference with zero external telemetry.
            The foundational cognitive substrate for on-device autonomous agents.
          </p>

          <div className="hero-actions">
            <a href="/apply" className="btn-primary liquid-glass-strong">
              <span className="icon-circle">
                <Sparkles style={{ width: 14, height: 14 }} />
              </span>
              Initialize Node
            </a>
            <a href="#features" className="btn-secondary">
              Explore Substrate
              <ArrowRight style={{ width: 16, height: 16 }} />
            </a>
          </div>

          <div className="hero-trust">
            <CheckCircle style={{ width: 14, height: 14 }} />
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>
              macOS · Apple Silicon &amp; Intel
            </span>
          </div>

          <p
            style={{
              marginTop: '0.75rem',
              fontSize: '0.6875rem',
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.05em',
            }}
          >
            ✓ FREE FOREVER: Zero cost. Zero cloud. Local processing.
          </p>
          <p
            style={{
              marginTop: '0.5rem',
              fontSize: '0.6875rem',
              color: 'rgba(99, 102, 241, 0.7)',
              letterSpacing: '0.05em',
            }}
          >
            🧪 v0.3.5 Beta — Production-hardened. 11 forensic fixes. Help us shape the future.
          </p>
        </motion.div>
      </section>

      {/* ═══ ENGINE DEMO ═══ */}
      <section className="section-pad content-layer" id="engine" style={{ position: 'relative' }}>
        <Logo3D />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10% 0px' }}
          variants={fadeUp}
        >
          <p className="section-label">Sovereign Inference Engine</p>
          <h2 className="section-title">Ambient Context Stream:</h2>

          <div className="engine-demo liquid-glass-strong">
            <div
              className="engine-input liquid-glass"
              onClick={() => setEngineExpanded(true)}
              style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
            >
              <AnimatePresence mode="wait">
                {!engineExpanded ? (
                  <motion.div
                    key="typing"
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="engine-text" ref={engineTextRef}>
                      {typedText}
                      <span
                        style={{
                          display: 'inline-block',
                          width: 2,
                          height: '1em',
                          background: 'rgba(255,255,255,0.6)',
                          marginLeft: 2,
                          animation: 'pulse-dot 1s infinite',
                        }}
                      />
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
                    style={{ textAlign: 'left' }}
                  >
                    <h4
                      style={{
                        color: 'var(--brand-emerald)',
                        marginBottom: '0.5rem',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <CheckCircle style={{ width: 14, height: 14 }} /> Autonomous Action Generated
                    </h4>
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        fontSize: '0.85rem',
                        color: 'rgba(255,255,255,0.9)',
                        lineHeight: '1.6',
                      }}
                    >
                      <li>
                        <strong style={{ color: 'white' }}>Node Alpha:</strong> Extracted critical
                        dependencies
                      </li>
                      <li style={{ color: 'rgba(180,255,180,1)' }}>
                        <strong style={{ color: 'white' }}>Workflow:</strong> Auto-generating
                        architectural schematics
                      </li>
                      <li>
                        <strong style={{ color: 'white' }}>Status:</strong> Compiled and locked in
                        local memory enclave
                      </li>
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="engine-stats">
              {[
                { val: '0 Bytes', label: 'Sent to the cloud' },
                { val: 'AES-256', label: 'Military-grade encryption' },
                { val: 'Instant', label: 'Local execution speed' },
                { val: '100%', label: 'Offline uptime guarantee' },
              ].map(stat => (
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
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10% 0px' }}
          variants={fadeUp}
        >
          <p className="section-label">Built for how you work.</p>
          <h2 className="section-title">
            The Sovereign Fabric adapts its inference engine
            <br />
            to your role, extracting exactly
            <br />
            what you need <em>without being asked.</em>
          </h2>

          <div className="role-tabs">
            {roles.map(r => (
              <button
                key={r.id}
                className={`role-tab ${activeRole === r.id ? 'liquid-glass-strong active' : 'liquid-glass'}`}
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
      <section className="section-pad content-layer" style={{ textAlign: 'center' }}>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10% 0px' }}
          variants={fadeUp}
        >
          <h2 className="section-title">
            Your ideas <em>belong to you.</em>
          </h2>
          <p className="section-desc centered">
            Stop handing your company&apos;s deepest strategies over to greedy cloud AI companies.
          </p>
        </motion.div>
      </section>

      {/* ═══ SOCIAL PROOF ═══ */}
      <VocMarquee />

      {/* ═══ FEATURES ═══ */}
      <section className="section-pad content-layer" id="features">
        <div className="features-grid">
          {[
            {
              icon: Cpu,
              title: 'Cognitive Substrate',
              desc: '100% local inference. Absolute neural independence.',
              hoverClass: 'group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]',
              iconHover: 'group-hover:text-emerald-400',
              textHover: 'group-hover:text-emerald-300'
            },
            {
              icon: Search,
              title: 'Infinite Recall',
              desc: 'Seamless ambient capture. Retrieve any thought instantly.',
              hoverClass: 'group-hover:border-blue-500/30 group-hover:bg-blue-500/10 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]',
              iconHover: 'group-hover:text-blue-400',
              textHover: 'group-hover:text-blue-300'
            },
            {
              icon: Sparkles,
              title: 'Agentic Action',
              desc: 'Proactive autonomy. Execute complex workflows entirely on-device.',
              hoverClass: 'group-hover:border-amber-500/30 group-hover:bg-amber-500/10 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]',
              iconHover: 'group-hover:text-amber-400',
              textHover: 'group-hover:text-amber-300'
            },
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-10%' }}
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: i * 0.1 } },
              }}
              className="feature-card liquid-glass group flex flex-col items-center text-center !p-12 transition-all duration-700 hover:bg-white/[0.04] hover:shadow-2xl hover:border-white/10 hover:-translate-y-2"
            >
              <div className={`icon-wrap mb-6 flex items-center justify-center w-16 h-16 rounded-2xl border border-white/5 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-1 ${feature.hoverClass}`}>
                <feature.icon className={`w-7 h-7 text-slate-300 transition-colors duration-500 ${feature.iconHover}`} />
              </div>
              <h3 className={`text-[0.8rem] font-bold tracking-[0.2em] uppercase text-slate-400 mb-4 transition-colors duration-500 ${feature.textHover}`}>{feature.title}</h3>
              <p className="text-[1.05rem] text-slate-300 font-light leading-relaxed max-w-[280px]">
                {feature.desc}
              </p>
            </motion.div>
          ))}

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-10% 0px' }}
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.3 } },
            }}
            className="feature-card liquid-glass group flex flex-col items-center text-center !p-12 md:col-span-1 lg:col-span-3 transition-all duration-700 hover:bg-white/[0.04] hover:shadow-2xl hover:border-white/10 hover:-translate-y-2"
          >
            <div className="icon-wrap mb-6 flex items-center justify-center w-16 h-16 rounded-2xl border border-white/5 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-1 group-hover:border-purple-500/30 group-hover:bg-purple-500/10 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]">
              <EyeOff className="w-7 h-7 text-slate-300 transition-colors duration-500 group-hover:text-purple-400" />
            </div>
            <h3 className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-slate-400 mb-4 transition-colors duration-500 group-hover:text-purple-300">Data Sovereignty</h3>
            <p className="text-[1.05rem] text-slate-300 font-light leading-relaxed max-w-[500px] mx-auto">
              Cryptographic finality. Inexorably bound to your hardware enclave.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mt-8 w-full max-w-[600px] mx-auto">
              {[
                { os: 'macOS', desc: 'Secure Enclave' },
                { os: 'Windows', desc: 'TPM 2.0' },
                { os: 'Linux', desc: 'LUKS' },
              ].map(p => (
                <div key={p.os} className="flex-1 min-w-[140px] py-4 px-6 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors duration-300">
                  <h4 className="text-[0.7rem] font-bold tracking-[0.2em] text-slate-500 uppercase mb-2">{p.os}</h4>
                  <p className="text-[0.95rem] text-slate-300 font-medium">{p.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ TRUST ═══ */}
      <section className="section-pad content-layer" id="trust" style={{ textAlign: 'center' }}>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10% 0px' }}
          variants={fadeUp}
        >
          <p className="section-label">Sovereignty over your context.</p>
          <h2 className="section-title">
            While typical AI tools require uploading
            <br />
            your meetings to their servers, our intelligence
            <br />
            lives <em>entirely on your machine.</em>
          </h2>
          <p className="section-desc centered" style={{ marginBottom: '2rem' }}>
            The Trust Test
          </p>

          <div
            style={{
              maxWidth: 800,
              margin: '0 auto',
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
            }}
            className="liquid-glass-strong"
          >
            <table className="trust-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Sovereign Fabric (Safe)</th>
                  <th>Cloud AI (Risky)</th>
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

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              onClick={() => setSecurityExpanded(!securityExpanded)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '0.8125rem',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                cursor: 'pointer',
              }}
            >
              {securityExpanded
                ? 'Hide Architecture Details'
                : 'View Security Architecture Details'}
            </button>

            <AnimatePresence>
              {securityExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ overflow: 'hidden', marginTop: '1rem' }}
                >
                  <div
                    className="liquid-glass"
                    style={{
                      maxWidth: 600,
                      margin: '0 auto',
                      padding: '1.5rem',
                      borderRadius: 'var(--radius-lg)',
                      textAlign: 'left',
                    }}
                  >
                    <h4
                      style={{
                        color: 'var(--brand-emerald)',
                        marginBottom: '1rem',
                        fontSize: '0.9rem',
                      }}
                    >
                      Core Sovereign Architecture
                    </h4>
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        fontSize: '0.85rem',
                        color: 'rgba(255,255,255,0.8)',
                        lineHeight: '1.6',
                      }}
                    >
                      <li style={{ marginBottom: '0.75rem' }}>
                        <strong style={{ color: 'white' }}>Encrypted At Rest:</strong> All contexts
                        are stored in an AES-256 encrypted SQLite database (SQLCipher). The
                        decryption key is locked in your OS keychain.
                      </li>
                      <li style={{ marginBottom: '0.75rem' }}>
                        <strong style={{ color: 'white' }}>Edge Inference:</strong> Transcription
                        and processing use heavily quantized local models (ONNX) running exclusively
                        on your machine&apos;s neural engine.
                      </li>
                      <li>
                        <strong style={{ color: 'white' }}>Zero Telemetry:</strong> The codebase
                        contains zero analytics, trackers, or hidden API calls. We physically cannot
                        see your data.
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
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10% 0px' }}
          variants={fadeUp}
        >
          <p className="section-label">Claim your sovereign node.</p>
          <h2 className="section-title">
            To ensure optimal performance and gather quality feedback,
            <br />
            the 100% free Personal Sanctuary tier is strictly
            <br />
            limited to our first <em>10,000 active users.</em>
          </h2>

          <div className="pricing-card liquid-glass-strong" style={{ marginTop: '2rem' }}>
            <p
              style={{
                fontSize: '0.75rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
                marginBottom: '0.5rem',
              }}
            >
              Personal Sanctuary (Early Adopter)
            </p>
            <p className="price">$0</p>
            <p className="price-note">Free for now. Free forever.</p>

            <ul>
              {[
                'Unlimited private meeting notes',
                "Floating 'focus' widget",
                'Smart thought expansion',
                'Magic meeting search',
                'Military-grade security AES-256',
                'Works completely offline',
              ].map(item => (
                <li key={item}>
                  <Check style={{ width: 16, height: 16 }} /> {item}
                </li>
              ))}
            </ul>

            <a
              href="/apply"
              className="btn-primary liquid-glass-strong"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Request Early Access
            </a>
          </div>
        </motion.div>
      </section>

      {/* ═══ ENTERPRISE APPLICATION MOVED TO /APPLY ═══ */}

      {/* ═══ REQUEST ACCESS CTA ═══ */}
      <section className="section-pad content-layer download-section" id="access">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10% 0px' }}
          variants={fadeUp}
          style={{ textAlign: 'center' }}
        >
          <h2 className="section-title">
            Initialize <em>Sovereign.</em>
          </h2>
          <p className="section-desc centered">Autonomous. Private. No cloud. Yours forever.</p>
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: 'rgba(255,255,255,0.4)',
              marginTop: '0.75rem',
              maxWidth: 520,
              margin: '0.75rem auto 0',
            }}
          >
            The cognitive network is expanding. Submit your request for node activation, and our
            system will provision your local installer within 24 hours.
          </p>

          <a
            href="/apply"
            className="btn-primary liquid-glass-strong"
            style={{
              display: 'inline-flex',
              marginTop: '2rem',
              padding: '1rem 2.5rem',
              fontSize: '1rem',
            }}
          >
            <Sparkles style={{ width: 18, height: 18 }} />
            Request Early Access
          </a>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '2rem',
              marginTop: '2rem',
              flexWrap: 'wrap',
            }}
          >
            {[
              { os: 'macOS', note: 'Apple Silicon & Intel' },
              { os: 'Windows', note: 'Coming soon' },
              { os: 'Linux', note: 'Coming soon' },
            ].map(p => (
              <div
                key={p.os}
                className="liquid-glass"
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 'var(--radius-lg)',
                  textAlign: 'center',
                }}
              >
                <p style={{ color: 'white', fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>
                  {p.os}
                </p>
                <p
                  style={{
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: '0.75rem',
                    margin: '0.25rem 0 0',
                  }}
                >
                  {p.note}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="content-layer">
        <div className="footer-inner">
          <div className="footer-brand">
            <a href="#hero" className="nav-logo" style={{ fontSize: '1.25rem' }}>
              <Image src="/logo.svg" alt="Sovereign Logo" width={24} height={24} />
              Sovereign
            </a>
            <p>The sovereign memory fabric.</p>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <h4>Product</h4>
              <a href="#features">Capabilities</a>
              <a href="#pricing">Pricing</a>
              <a href="/apply">Request Access</a>
            </div>
            <div className="footer-col">
              <h4>Trust</h4>
              <a href="#trust">Architecture &amp; Security</a>
              <a
                href="https://github.com/piyso/Meeting/blob/main/SECURITY.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
              <a
                href="https://github.com/piyso/Meeting/blob/main/LICENSE.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-badges">
            <span className="footer-badge liquid-glass">AES-256 Encryption</span>
            <span className="footer-badge liquid-glass">100% Offline</span>
            <span className="footer-badge liquid-glass">No Account Required</span>
          </div>
          <p className="footer-copy">© 2026 Sovereign. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
