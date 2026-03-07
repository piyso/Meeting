import React, { useState, useRef } from 'react'
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
} from 'framer-motion'
import type { Variants } from 'framer-motion'
import './calm-landing.css'

/* ─── Animation Presets ─── */
const calmFade: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.2, ease: [0.25, 1, 0.5, 1] },
  },
}

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
}

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: [0.25, 1, 0.5, 1] },
  },
}

/* ─── Scroll Section Wrapper ─── */
function FadeSection({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      className={`calm-fade-section ${className}`}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={calmFade}
    >
      {children}
    </motion.div>
  )
}

/* ─── FAQ Item ─── */
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="calm-faq-item">
      <button className="calm-faq-question" onClick={() => setOpen(!open)}>
        {question}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`calm-faq-chevron ${open ? 'calm-faq-chevron--open' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className={`calm-faq-answer ${open ? 'calm-faq-answer--open' : ''}`}>
        <p>{answer}</p>
      </div>
    </div>
  )
}

/* ─── Mouse Tilt Card ─── */
function TiltWidgetCard() {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseXSpring = useSpring(x, { stiffness: 100, damping: 30 })
  const mouseYSpring = useSpring(y, { stiffness: 100, damping: 30 })

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ['7deg', '-7deg'])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ['-7deg', '7deg'])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="calm-widget-glass-wrapper"
    >
      <motion.div
        className="calm-widget-glass"
        animate={{ scale: [1, 1.015, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ translateZ: 50 }}
      >
        <div className="calm-widget-dot" />
        <span className="calm-widget-label">Listening…</span>
        <span className="calm-widget-time">00:12:34</span>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════
   MAIN LANDING PAGE COMPONENT
   ═══════════════════════════════════════════ */
export const CalmLandingPage: React.FC = () => {
  const { scrollY } = useScroll()
  const backgroundY = useTransform(scrollY, [0, 1000], ['0%', '20%'])

  return (
    <div className="calm-landing">
      {/* Ambient background with parallax */}
      <motion.div className="calm-ambient" style={{ y: backgroundY }} aria-hidden="true" />
      <div className="calm-noise" aria-hidden="true" />
      <div className="sovereign-hero-glow" aria-hidden="true" />

      {/* ── SOVEREIGN NAVBAR ── */}
      <motion.nav
        className="sovereign-navbar sovereign-glass"
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
      >
        <div className="sovereign-navbar-content">
          <div className="sovereign-logo sovereign-heading">BlueArkive</div>
          <a href="#download" className="sovereign-btn-primary">
            Initialize Core
          </a>
        </div>
      </motion.nav>

      {/* ── SECTION 1: Hero ── */}
      <section
        className="calm-section calm-hero"
        style={{ paddingTop: '200px', paddingBottom: '100px' }}
      >
        <FadeSection>
          <h1 className="sovereign-heading calm-heading--hero">The Sovereign Memory Fabric.</h1>
          <p className="sovereign-subheading calm-subheading">
            Constructing the Autonomous Agentic Web. Local. Secure. Yours.
          </p>

          {/* CTA Buttons */}
          <div className="calm-cta-group">
            <a href="#download" className="calm-btn calm-btn--primary">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download for macOS
            </a>
            <a href="#download" className="calm-btn calm-btn--ghost">
              Download for Windows
            </a>
          </div>

          {/* Trust marker */}
          <p className="calm-trust">
            No cloud · No account required · Your words never leave your device
          </p>

          {/* Breathing Widget Demo */}
          <div className="calm-widget-demo" style={{ perspective: 1000 }}>
            <TiltWidgetCard />
          </div>
        </FadeSection>
      </section>

      {/* ── SECTION 2: The Problem ── */}
      <section className="calm-section">
        <FadeSection>
          <div className="calm-divider" style={{ marginBottom: '56px' }} />
          <h2 className="sovereign-heading calm-heading--section" style={{ textAlign: 'center' }}>
            The burden of infinite context.
          </h2>
        </FadeSection>

        <motion.div
          className="calm-gallery"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
        >
          <motion.div className="calm-gallery-card" variants={staggerChild}>
            <span className="calm-gallery-icon">🎧</span>
            <h3 className="calm-gallery-title">The Distracted Nod</h3>
            <p className="calm-gallery-copy">
              "When you're writing notes, you aren't really listening. The connection breaks. You
              smile politely, but you've missed the nuance."
            </p>
          </motion.div>

          <motion.div className="calm-gallery-card" variants={staggerChild}>
            <span className="calm-gallery-icon">💭</span>
            <h3 className="calm-gallery-title">The Forgotten Nuance</h3>
            <p className="calm-gallery-copy">
              "You remember the feeling of the meeting — the energy, the nods — but the exact
              decision fades away an hour later."
            </p>
          </motion.div>

          <motion.div className="calm-gallery-card" variants={staggerChild}>
            <span className="calm-gallery-icon">🔐</span>
            <h3 className="calm-gallery-title">The Cloud Anxiety</h3>
            <p className="calm-gallery-copy">
              "Uploading sensitive client conversations to a corporate server gives you a quiet,
              uneasy feeling you can't quite shake."
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ── SECTION 3: Features as Stories ── */}
      <section className="calm-section">
        <FadeSection>
          <div className="calm-divider" style={{ marginBottom: '56px' }} />
          <h2 className="sovereign-heading calm-heading--section" style={{ textAlign: 'center' }}>
            Uncompromising intelligence.
          </h2>
          <p className="sovereign-subheading calm-subheading" style={{ marginBottom: '64px' }}>
            Agentic. Autonomous. Entirely on your hardware.
          </p>
        </FadeSection>

        {/* Story 1: The Quiet Companion */}
        <FadeSection>
          <div className="calm-story">
            <div>
              <p className="calm-story-tag">The Quiet Companion</p>
              <h3 className="calm-story-heading">Always there. Never in the way.</h3>
              <p className="calm-story-copy">
                A beautiful, transparent little window stays gently on your screen. It doesn't ask
                for attention. It simply lets you know it's listening, showing a soft, breathing
                light so you can focus entirely on your conversation.
              </p>
            </div>
            <div className="calm-story-visual">
              <div className="calm-story-visual-inner">
                <motion.div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#86efac',
                    boxShadow: '0 0 16px rgba(134,239,172,0.5)',
                  }}
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span>Listening quietly…</span>
              </div>
            </div>
          </div>
        </FadeSection>

        {/* Story 2: The Thought Expander */}
        <FadeSection>
          <div className="calm-story">
            <div>
              <p className="calm-story-tag">The Thought Expander</p>
              <h3 className="calm-story-heading">
                Jot a thought. Let the machine write the chapter.
              </h3>
              <p className="calm-story-copy">
                Sometimes all you have time to type is "follow up on budget." Press one key, and the
                local intelligence transforms your shorthand into a fully fleshed-out paragraph —
                using your meeting context. It's like a brilliant assistant who finishes your
                sentences.
              </p>
            </div>
            <div className="calm-story-visual">
              <div className="calm-story-visual-inner">
                <span style={{ fontStyle: 'italic', opacity: 0.5 }}>"follow up on budget…"</span>
                <motion.div
                  style={{
                    width: 40,
                    height: 2,
                    background: 'var(--calm-lavender)',
                    borderRadius: 4,
                  }}
                  animate={{ scaleX: [0, 1], opacity: [0.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span style={{ fontSize: '0.85rem' }}>✨ Expanding into context…</span>
              </div>
            </div>
          </div>
        </FadeSection>

        {/* Story 3: The Infinite Recall */}
        <FadeSection>
          <div className="calm-story">
            <div>
              <p className="calm-story-tag">The Infinite Recall</p>
              <h3 className="calm-story-heading">Never lose a thread again.</h3>
              <p className="calm-story-copy">
                When did Sarah mention that new vendor? Just ask. Press ⌘K and type. Because
                everything is stored locally, your entire history of conversations is instantly
                searchable, threading ideas across months of meetings.
              </p>
            </div>
            <div className="calm-story-visual">
              <div className="calm-story-visual-inner">
                <div
                  style={{
                    background: 'var(--calm-surface)',
                    border: '1px solid var(--calm-border)',
                    borderRadius: 12,
                    padding: '10px 24px',
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.9rem',
                    color: 'var(--calm-text-gentle)',
                    minWidth: 200,
                    textAlign: 'center',
                  }}
                >
                  ⌘K · Search everything…
                </div>
              </div>
            </div>
          </div>
        </FadeSection>

        {/* Story 4: The Digital Sanctuary */}
        <FadeSection>
          <div className="calm-story">
            <div>
              <p className="calm-story-tag">The Digital Sanctuary</p>
              <h3 className="calm-story-heading">Your words, locked under your key.</h3>
              <p className="calm-story-copy">
                Peace of mind comes from true ownership. We don't use the cloud for transcription.
                The engine runs quietly on your own hardware. Your notes are encrypted with a key
                that only you hold — a 24-word phrase that makes your data mathematically
                impenetrable.
              </p>
            </div>
            <div className="calm-story-visual">
              <div className="calm-story-visual-inner">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 6,
                    opacity: 0.5,
                  }}
                >
                  {['ocean', 'timber', 'focus', 'coral', 'drift', 'ember', 'lunar', 'peace'].map(
                    (word, i) => (
                      <motion.span
                        key={word}
                        style={{
                          fontSize: '0.7rem',
                          fontFamily: 'var(--font-display)',
                          background: 'var(--calm-lavender-soft)',
                          padding: '3px 8px',
                          borderRadius: 6,
                          textAlign: 'center',
                        }}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        transition={{ delay: i * 0.12, duration: 0.6 }}
                        viewport={{ once: true }}
                      >
                        {word}
                      </motion.span>
                    )
                  )}
                </div>
                <span style={{ fontSize: '0.8rem', marginTop: 8 }}>🔒 Your 24-word key</span>
              </div>
            </div>
          </div>
        </FadeSection>
      </section>

      {/* ── SECTION 4: Keyboard Flow ── */}
      <section className="calm-section calm-section--narrow">
        <FadeSection>
          <div className="calm-divider" style={{ marginBottom: '56px' }} />
          <h2 className="sovereign-heading calm-heading--section" style={{ textAlign: 'center' }}>
            Velocity over complexity.
          </h2>
          <p className="sovereign-subheading calm-subheading" style={{ marginBottom: '48px' }}>
            Command every agentic capability without leaving your keyboard.
          </p>
        </FadeSection>

        <motion.div
          className="calm-shortcuts"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={staggerContainer}
        >
          {[
            { key: '⌘ K', label: 'Command palette' },
            { key: '⌘⇧R', label: 'Start / stop recording' },
            { key: '⌘⇧M', label: 'Toggle floating widget' },
            { key: '⌘⇧E', label: 'Quick export to Markdown' },
            { key: '⌘⇧K', label: 'Semantic search' },
            { key: '⌘⇧F', label: 'Focus mode' },
            { key: '⌘ N', label: 'New meeting' },
            { key: '⌘ ⏎', label: 'AI note expansion' },
          ].map(({ key, label }) => (
            <motion.div key={key} className="calm-shortcut-item" variants={staggerChild}>
              <span className="calm-shortcut-key">{key}</span>
              <span className="calm-shortcut-label">{label}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── SECTION 5: Pricing ── */}
      <section className="calm-section calm-section--narrow">
        <FadeSection>
          <div className="calm-divider" style={{ marginBottom: '56px' }} />
          <h2 className="sovereign-heading calm-heading--section" style={{ textAlign: 'center' }}>
            Simple. Transparent. Sovereign.
          </h2>
          <p className="sovereign-subheading calm-subheading" style={{ marginBottom: '48px' }}>
            No hidden quotas. Your machine powers the intelligence.
          </p>
        </FadeSection>

        <motion.div
          className="calm-pricing"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={staggerContainer}
        >
          <motion.div className="calm-price-card" variants={staggerChild}>
            <h3 className="calm-price-name">The Personal Sanctuary</h3>
            <p className="calm-price-amount">
              $0 <span>/ forever</span>
            </p>
            <ul className="calm-price-features">
              <li>Infinite local transcription</li>
              <li>The beautiful floating widget</li>
              <li>Local AI thought expansion</li>
              <li>Absolute, local-only privacy</li>
              <li>Works completely offline</li>
            </ul>
            <a
              href="#download"
              className="calm-btn calm-btn--primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Begin
            </a>
          </motion.div>

          <motion.div className="calm-price-card calm-price-card--featured" variants={staggerChild}>
            <h3 className="calm-price-name">The Connected Mind</h3>
            <p className="calm-price-amount">
              $9 <span>/ month</span>
            </p>
            <ul className="calm-price-features">
              <li>Encrypted sync across your devices</li>
              <li>AI connections across meetings</li>
              <li>Contradiction detection</li>
              <li>Advanced semantic search</li>
              <li>Priority support</li>
            </ul>
            <a
              href="#download"
              className="calm-btn calm-btn--ghost"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Try Free for 14 Days
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ── SECTION 6: FAQ ── */}
      <section className="calm-section calm-section--narrow">
        <FadeSection>
          <div className="calm-divider" style={{ marginBottom: '56px' }} />
          <h2 className="sovereign-heading calm-heading--section" style={{ textAlign: 'center' }}>
            Architecture Inquiries.
          </h2>
        </FadeSection>

        <div className="calm-faq-list">
          <FaqItem
            question="Do I need internet for it to work?"
            answer="No. The core transcription engine lives directly on your computer. You can transcribe a meeting in a cabin in the woods, entirely offline."
          />
          <FaqItem
            question="Is my company data really safe?"
            answer="Fundamentally safe. We never see your transcripts. We don't have a server that processes your audio. It never leaves your laptop. We use bank-grade local encryption, so even if someone takes your computer, your notes are safe."
          />
          <FaqItem
            question="Will it slow my computer down?"
            answer="Not at all. We have spent months optimizing the engine so it runs quietly in the background, sipping battery, while you focus on your work."
          />
          <FaqItem
            question="What if I want to search across many meetings?"
            answer="Press ⌘K and type your question. Because everything is stored locally and indexed, your entire history is instantly searchable — threading ideas across months of conversations."
          />
          <FaqItem
            question="Can I use it on Windows?"
            answer="Yes. We build for macOS and Windows on every release. Download the version that matches your system."
          />
        </div>
      </section>

      {/* ── SECTION 7: Footer CTA ── */}
      <footer className="calm-footer" id="download">
        <FadeSection>
          <h2 className="sovereign-heading calm-heading--section">Initialize your agentic node.</h2>
          <p className="sovereign-subheading calm-subheading">
            Deploy BlueArkive today. Relinquish memory management to the machine.
          </p>

          <div className="calm-cta-group" style={{ marginTop: '40px' }}>
            <a href="#" className="calm-btn calm-btn--primary">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download for macOS
            </a>
            <a
              href="#"
              className="calm-btn calm-btn--ghost"
              style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
            >
              Download for Windows
            </a>
          </div>

          <p className="calm-trust">Free forever · No account required · Sovereign by design</p>

          <div className="calm-footer-links">
            <a href="#">Privacy Promise</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </div>
        </FadeSection>
      </footer>
    </div>
  )
}

export default CalmLandingPage
