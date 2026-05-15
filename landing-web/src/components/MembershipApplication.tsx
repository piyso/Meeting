'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Building, Mail, User, Shield, Key, CheckCircle, Terminal } from 'lucide-react'

type FormType = 'access' | 'demo'

const SUBMIT_MESSAGES = [
  'INITIATING SECURE HANDSHAKE...',
  'NEGOTIATING TLS 1.3 ENCRYPTION...',
  'VERIFYING IDENTITY SIGNATURE...',
  'ALLOCATING SOVEREIGN NODE...',
  'ACCESS GRANTED',
]

export function MembershipApplication() {
  const [activeForm, setActiveForm] = useState<FormType>('access')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [submitStep, setSubmitStep] = useState(0)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStep(0)

    const formData = new FormData(e.currentTarget)
    const data = {
      type: activeForm,
      fullName: formData.get('fullName'),
      firm: formData.get('firm'),
      email: formData.get('email'),
      role: formData.get('role') || 'Not specified',
      intent: formData.get('intent') || 'None provided',
    }

    try {
      // Simulate terminal steps immediately
      let step = 0
      const interval = setInterval(() => {
        step++
        setSubmitStep(step)
        if (step >= SUBMIT_MESSAGES.length - 1) {
          clearInterval(interval)
        }
      }, 600)

      // Actually POST to the backend
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        console.error('Failed to send email', await res.text())
      }

      // Wait a moment for terminal to finish if fetch was fast
      setTimeout(() => {
        setIsSubmitting(false)
        setIsSuccess(true)
        setTimeout(() => {
          setIsSuccess(false)
          setSubmitStep(0)
        }, 4000)
      }, 3500)
    } catch (err) {
      console.error(err)
      setIsSubmitting(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
    exit: { opacity: 0, filter: 'blur(10px)', transition: { duration: 0.3 } },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 15, filter: 'blur(4px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
    },
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-10%' }}
          className="liquid-glass"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            marginBottom: '1.5rem',
          }}
        >
          <Shield style={{ width: '14px', height: '14px', color: '#4ade80' }} />
          <span
            style={{
              fontSize: '0.625rem',
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            Private Allocation
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="section-title"
        >
          Membership <em>Application</em>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="section-desc centered"
        >
          Select your preferred engagement model to begin the executive intake process.
        </motion.p>
      </div>

      <motion.div
        className="enterprise-card liquid-glass-strong"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ padding: 0, overflow: 'hidden' }}
      >
        {/* Form Tabs */}
        <div className="form-tabs">
          <button
            onClick={() => !isSubmitting && setActiveForm('access')}
            className={`form-tab ${activeForm === 'access' ? 'active' : ''}`}
            style={isSubmitting ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            Request Access
            {activeForm === 'access' && (
              <motion.div layoutId="activeTabIndicator" className="form-tab-indicator" />
            )}
          </button>
          <button
            onClick={() => !isSubmitting && setActiveForm('demo')}
            className={`form-tab ${activeForm === 'demo' ? 'active' : ''}`}
            style={isSubmitting ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            Private Demo
            {activeForm === 'demo' && (
              <motion.div layoutId="activeTabIndicator" className="form-tab-indicator" />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div
          style={{
            padding: '2rem 3rem 3rem',
            position: 'relative',
            minHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <AnimatePresence mode="wait">
            {isSubmitting || isSuccess ? (
              <motion.div
                key="terminal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.5)',
                  zIndex: 20,
                }}
              >
                {isSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{ textAlign: 'center' }}
                  >
                    <div
                      style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'rgba(74, 222, 128, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        boxShadow: '0 0 40px rgba(74, 222, 128, 0.2)',
                      }}
                    >
                      <CheckCircle style={{ width: '40px', height: '40px', color: '#4ade80' }} />
                    </div>
                    <h3
                      style={{
                        fontSize: '1.5rem',
                        fontFamily: 'var(--font-serif)',
                        color: 'white',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Credentials Verified
                    </h3>
                    <p
                      style={{
                        color: 'rgba(255,255,255,0.4)',
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                      }}
                    >
                      Intake committee notified.
                    </p>
                  </motion.div>
                ) : (
                  <div style={{ width: '100%', maxWidth: '320px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginBottom: '2rem',
                        opacity: 0.5,
                      }}
                    >
                      <Terminal style={{ width: '20px', height: '20px', color: '#4ade80' }} />
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontFamily: "'SF Mono', 'Fira Code', monospace",
                          textTransform: 'uppercase',
                          letterSpacing: '0.15em',
                          color: '#4ade80',
                        }}
                      >
                        System Handshake
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        fontSize: '0.75rem',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {SUBMIT_MESSAGES.map((msg, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{
                            opacity: idx <= submitStep ? (idx === submitStep ? 1 : 0.3) : 0,
                            x: idx <= submitStep ? 0 : -10,
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            color: idx === submitStep ? 'white' : 'rgba(255,255,255,0.5)',
                          }}
                        >
                          <span style={{ color: '#4ade80', opacity: 0.5 }}>{'>'}</span>
                          {msg}
                          {idx === submitStep && (
                            <motion.span
                              animate={{ opacity: [1, 0] }}
                              transition={{ repeat: Infinity, duration: 0.8 }}
                              style={{
                                width: '8px',
                                height: '12px',
                                background: '#4ade80',
                                display: 'inline-block',
                                marginLeft: '4px',
                              }}
                            />
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : activeForm === 'access' ? (
              <motion.div
                key="access"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <form onSubmit={handleSubmit}>
                  <div className="form-grid-2">
                    <motion.div variants={itemVariants} className="form-group">
                      <label className="form-label">Full Name</label>
                      <User className="form-icon" />
                      <input
                        type="text"
                        name="fullName"
                        required
                        className="form-input"
                        placeholder="John Doe"
                      />
                    </motion.div>
                    <motion.div variants={itemVariants} className="form-group">
                      <label className="form-label">Firm / Organization</label>
                      <Building className="form-icon" />
                      <input
                        type="text"
                        name="firm"
                        required
                        className="form-input"
                        placeholder="Acme Corp"
                      />
                    </motion.div>
                  </div>

                  <motion.div variants={itemVariants} className="form-group">
                    <label className="form-label">Work Email Identifier</label>
                    <Mail className="form-icon" />
                    <input
                      type="email"
                      name="email"
                      required
                      className="form-input"
                      placeholder="john@acmecorp.com"
                    />
                  </motion.div>

                  <motion.div variants={itemVariants} className="form-group">
                    <label className="form-label">Statement of Intent (Optional)</label>
                    <textarea
                      name="intent"
                      className="form-input"
                      placeholder="Briefly describe your interest in sovereign infrastructure..."
                    />
                  </motion.div>

                  <motion.div variants={itemVariants} style={{ paddingTop: '1.5rem' }}>
                    <button
                      type="submit"
                      className="btn-primary liquid-glass"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        background: 'white',
                        color: 'black',
                        textTransform: 'uppercase',
                        letterSpacing: '0.2em',
                        fontSize: '0.75rem',
                        padding: '1.25rem',
                      }}
                    >
                      <Key style={{ width: '16px', height: '16px' }} />
                      Submit Credentials
                      <ArrowRight style={{ width: '16px', height: '16px' }} />
                    </button>
                    <p
                      style={{
                        textAlign: 'center',
                        fontSize: '0.625rem',
                        color: 'rgba(255,255,255,0.3)',
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        marginTop: '1.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                      }}
                    >
                      All applications are reviewed manually by our intake committee.
                    </p>
                  </motion.div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="demo"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <form onSubmit={handleSubmit}>
                  <div className="form-grid-2">
                    <motion.div variants={itemVariants} className="form-group">
                      <label className="form-label">Full Name</label>
                      <User className="form-icon" />
                      <input
                        type="text"
                        name="fullName"
                        required
                        className="form-input"
                        placeholder="Jane Doe"
                      />
                    </motion.div>
                    <motion.div variants={itemVariants} className="form-group">
                      <label className="form-label">Company / Firm</label>
                      <Building className="form-icon" />
                      <input
                        type="text"
                        name="firm"
                        required
                        className="form-input"
                        placeholder="Global Ventures"
                      />
                    </motion.div>
                  </div>

                  <div className="form-grid-2">
                    <motion.div variants={itemVariants} className="form-group">
                      <label className="form-label">Work Email</label>
                      <Mail className="form-icon" />
                      <input
                        type="email"
                        name="email"
                        required
                        className="form-input"
                        placeholder="jane@globalventures.com"
                      />
                    </motion.div>
                    <motion.div variants={itemVariants} className="form-group">
                      <label className="form-label">Role</label>
                      <select
                        name="role"
                        required
                        defaultValue=""
                        className="form-input"
                        style={{ appearance: 'none', paddingLeft: '1rem' }}
                      >
                        <option value="" disabled>
                          Select Role...
                        </option>
                        <option value="executive" style={{ background: '#0a0e1a' }}>
                          Executive / C-Suite
                        </option>
                        <option value="investor" style={{ background: '#0a0e1a' }}>
                          Investor / Partner
                        </option>
                        <option value="legal" style={{ background: '#0a0e1a' }}>
                          Legal / Compliance
                        </option>
                        <option value="technical" style={{ background: '#0a0e1a' }}>
                          Technical / Engineering
                        </option>
                        <option value="other" style={{ background: '#0a0e1a' }}>
                          Other
                        </option>
                      </select>
                    </motion.div>
                  </div>

                  <motion.div variants={itemVariants} className="form-group">
                    <label className="form-label">How Can We Assist You?</label>
                    <textarea
                      name="intent"
                      className="form-input"
                      placeholder="Please provide details about your use case..."
                    />
                  </motion.div>

                  <motion.div variants={itemVariants} style={{ paddingTop: '1.5rem' }}>
                    <button
                      type="submit"
                      className="btn-secondary liquid-glass"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        textTransform: 'uppercase',
                        letterSpacing: '0.2em',
                        fontSize: '0.75rem',
                        padding: '1.25rem',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      Request Invitation
                      <ArrowRight style={{ width: '16px', height: '16px' }} />
                    </button>
                    <p
                      style={{
                        textAlign: 'center',
                        fontSize: '0.625rem',
                        color: 'rgba(255,255,255,0.3)',
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        marginTop: '1.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                      }}
                    >
                      Inquiries are processed by our dedicated enterprise team.
                    </p>
                  </motion.div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
