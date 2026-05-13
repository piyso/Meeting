'use client'

import { useState, MouseEvent } from 'react'
import { motion, AnimatePresence, useMotionTemplate, useMotionValue } from 'framer-motion'
import { ArrowRight, Building, Mail, User, Shield, Key, CheckCircle, Terminal } from 'lucide-react'

type FormType = 'access' | 'demo'

const SUBMIT_MESSAGES = [
  "INITIATING SECURE HANDSHAKE...",
  "NEGOTIATING TLS 1.3 ENCRYPTION...",
  "VERIFYING IDENTITY SIGNATURE...",
  "ALLOCATING SOVEREIGN NODE...",
  "ACCESS GRANTED"
]

export function MembershipApplication() {
  const [activeForm, setActiveForm] = useState<FormType>('access')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [submitStep, setSubmitStep] = useState(0)

  // Spotlight effect
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStep(0)
    
    // Simulate terminal steps
    let step = 0
    const interval = setInterval(() => {
      step++
      setSubmitStep(step)
      if (step >= SUBMIT_MESSAGES.length - 1) {
        clearInterval(interval)
        setTimeout(() => {
          setIsSubmitting(false)
          setIsSuccess(true)
          setTimeout(() => {
            setIsSuccess(false)
            setSubmitStep(0)
          }, 4000)
        }, 800)
      }
    }, 600)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    },
    exit: { opacity: 0, filter: 'blur(10px)', transition: { duration: 0.3 } }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 15, filter: 'blur(4px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
  }

  return (
    <section className="py-40 relative overflow-hidden bg-black" id="apply">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-900/10 rounded-[100%] blur-[120px] opacity-50" />
      </div>

      <div className="container mx-auto px-6 relative z-10 max-w-4xl">
        <div className="text-center mb-20 relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-md mb-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/60">
              Private Allocation
            </span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl md:text-6xl font-serif tracking-tight text-white mb-6"
          >
            Membership Application
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-white/40 max-w-xl mx-auto font-light text-lg"
          >
            Select your preferred engagement model to begin the executive intake process.
          </motion.p>
        </div>

        <motion.div 
          className="group relative max-w-2xl mx-auto bg-white/[0.02] border border-white/10 rounded-3xl overflow-hidden backdrop-blur-3xl shadow-[0_0_80px_rgba(0,0,0,0.8)]"
          onMouseMove={handleMouseMove}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Subtle inner top highlight */}
          <div className="absolute inset-0 rounded-3xl pointer-events-none shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" />

          {/* Spotlight Effect that follows the mouse */}
          <motion.div
            className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition duration-500 group-hover:opacity-100"
            style={{
              background: useMotionTemplate`
                radial-gradient(
                  600px circle at ${mouseX}px ${mouseY}px,
                  rgba(255,255,255,0.06),
                  transparent 80%
                )
              `,
            }}
          />

          {/* Form Tabs */}
          <div className="flex border-b border-white/5 relative z-10 bg-black/20">
            <button
              onClick={() => !isSubmitting && setActiveForm('access')}
              className={`flex-1 py-6 px-4 text-xs font-mono tracking-[0.2em] uppercase transition-all duration-500 relative ${
                activeForm === 'access'
                  ? 'text-white'
                  : 'text-white/30 hover:text-white/60'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Request Access
              {activeForm === 'access' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500/0 via-blue-400 to-blue-500/0"
                />
              )}
            </button>
            <div className="w-px bg-white/5" />
            <button
              onClick={() => !isSubmitting && setActiveForm('demo')}
              className={`flex-1 py-6 px-4 text-xs font-mono tracking-[0.2em] uppercase transition-all duration-500 relative ${
                activeForm === 'demo'
                  ? 'text-white'
                  : 'text-white/30 hover:text-white/60'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Private Demo
              {activeForm === 'demo' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500/0 via-blue-400 to-blue-500/0"
                />
              )}
            </button>
          </div>

          {/* Content Area */}
          <div className="relative p-8 md:p-12 min-h-[500px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {isSubmitting || isSuccess ? (
                <motion.div
                  key="terminal"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-black/40 backdrop-blur-sm z-20"
                >
                  {isSuccess ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center"
                    >
                      <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(59,130,246,0.2)]">
                        <CheckCircle className="w-10 h-10 text-blue-400" />
                      </div>
                      <h3 className="text-2xl font-serif text-white mb-2">Credentials Verified</h3>
                      <p className="text-white/40 font-mono text-xs tracking-widest uppercase">
                        Intake committee notified.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="w-full max-w-sm space-y-4">
                      <div className="flex items-center gap-3 mb-8 opacity-50">
                        <Terminal className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-mono tracking-widest uppercase text-blue-400">System Handshake</span>
                      </div>
                      <div className="space-y-3 font-mono text-xs tracking-wider">
                        {SUBMIT_MESSAGES.map((msg, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: idx <= submitStep ? (idx === submitStep ? 1 : 0.3) : 0, x: idx <= submitStep ? 0 : -10 }}
                            className={`flex items-center gap-3 ${idx === submitStep ? 'text-white' : 'text-white/50'}`}
                          >
                            <span className="text-blue-500 opacity-50">{'>'}</span>
                            {msg}
                            {idx === submitStep && (
                              <motion.span
                                animate={{ opacity: [1, 0] }}
                                transition={{ repeat: Infinity, duration: 0.8 }}
                                className="w-2 h-3 bg-blue-400 inline-block ml-1"
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
                  className="w-full h-full"
                >
                  <motion.div variants={itemVariants} className="mb-10 text-center">
                    <h3 className="text-3xl font-serif text-white mb-3">Request Private Access</h3>
                    <p className="text-white/40 text-sm font-light">
                      BlueArkive is currently accepting a limited number of founding partners.
                    </p>
                  </motion.div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/field:text-blue-400 transition-colors" />
                          <input
                            type="text"
                            required
                            className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light placeholder:text-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                            placeholder="John Doe"
                          />
                        </div>
                      </motion.div>
                      <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">Firm / Organization</label>
                        <div className="relative">
                          <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/field:text-blue-400 transition-colors" />
                          <input
                            type="text"
                            required
                            className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light placeholder:text-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                            placeholder="Acme Corp"
                          />
                        </div>
                      </motion.div>
                    </div>

                    <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">Work Email Identifier</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/field:text-blue-400 transition-colors" />
                        <input
                          type="email"
                          required
                          className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light placeholder:text-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                          placeholder="john@acmecorp.com"
                        />
                      </div>
                    </motion.div>

                    <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">Statement of Intent (Optional)</label>
                      <textarea
                        rows={3}
                        className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-4 px-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light resize-none placeholder:text-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                        placeholder="Briefly describe your interest in sovereign infrastructure..."
                      />
                    </motion.div>

                    <motion.div variants={itemVariants} className="pt-6">
                      <button
                        type="submit"
                        className="w-full py-4 bg-white text-black font-medium text-xs tracking-[0.2em] uppercase rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-3 group relative overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          <Key className="w-3.5 h-3.5" />
                          Submit Credentials
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                      </button>
                      <p className="text-center text-[10px] text-white/30 font-mono tracking-widest mt-6 uppercase">
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
                  className="w-full h-full"
                >
                  <motion.div variants={itemVariants} className="mb-10 text-center">
                    <h3 className="text-3xl font-serif text-white mb-3">Experience Precision.</h3>
                    <p className="text-white/40 text-sm font-light">
                      Unlock the full capability of the BlueArkive engine. Reserved for enterprise partners and investors.
                    </p>
                  </motion.div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/field:text-blue-400 transition-colors" />
                          <input
                            type="text"
                            required
                            className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light placeholder:text-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                            placeholder="Jane Doe"
                          />
                        </div>
                      </motion.div>
                      <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">Company / Firm</label>
                        <div className="relative">
                          <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/field:text-blue-400 transition-colors" />
                          <input
                            type="text"
                            required
                            className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light placeholder:text-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                            placeholder="Global Ventures"
                          />
                        </div>
                      </motion.div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">Work Email</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/field:text-blue-400 transition-colors" />
                          <input
                            type="email"
                            required
                            className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light placeholder:text-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                            placeholder="jane@globalventures.com"
                          />
                        </div>
                      </motion.div>
                      <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">Role</label>
                        <select className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3.5 px-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light appearance-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                          <option value="executive" className="bg-slate-900">Executive / C-Suite</option>
                          <option value="investor" className="bg-slate-900">Investor / Partner</option>
                          <option value="legal" className="bg-slate-900">Legal / Compliance</option>
                          <option value="technical" className="bg-slate-900">Technical / Engineering</option>
                          <option value="other" className="bg-slate-900">Other</option>
                        </select>
                      </motion.div>
                    </div>

                    <motion.div variants={itemVariants} className="space-y-2 relative group/field">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 pl-1 group-focus-within/field:text-blue-400 transition-colors">How Can We Assist You?</label>
                      <textarea
                        rows={3}
                        className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-4 px-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all font-light resize-none placeholder:text-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                        placeholder="Please provide details about your use case..."
                      />
                    </motion.div>

                    <motion.div variants={itemVariants} className="pt-6">
                      <button
                        type="submit"
                        className="w-full py-4 bg-transparent border border-white/20 text-white font-medium text-xs tracking-[0.2em] uppercase rounded-xl hover:bg-white/5 hover:border-white/40 transition-all flex items-center justify-center gap-3 group shadow-[0_0_15px_rgba(255,255,255,0.03)]"
                      >
                        Request Invitation
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </button>
                      <p className="text-center text-[10px] text-white/30 font-mono tracking-widest mt-6 uppercase">
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
    </section>
  )
}
