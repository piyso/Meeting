'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Building, Mail, User, Shield, Key, CheckCircle } from 'lucide-react'

type FormType = 'access' | 'demo'

export function MembershipApplication() {
  const [activeForm, setActiveForm] = useState<FormType>('access')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false)
      setIsSuccess(true)
      setTimeout(() => setIsSuccess(false), 5000)
    }, 1500)
  }

  return (
    <section className="py-32 relative overflow-hidden bg-black border-t border-white/5" id="apply">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-slate-800/10 rounded-full blur-[150px]" />
      </div>

      <div className="container mx-auto px-6 relative z-10 max-w-5xl">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-6"
          >
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-mono uppercase tracking-widest text-white/70">
              Enterprise Inquiries
            </span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-serif tracking-tight text-white mb-4"
          >
            Membership Application
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-white/50 max-w-2xl mx-auto font-light"
          >
            Select your preferred engagement model to begin the intake process.
          </motion.p>
        </div>

        <div className="max-w-3xl mx-auto bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden backdrop-blur-xl">
          {/* Form Tabs */}
          <div className="flex border-b border-white/5">
            <button
              onClick={() => setActiveForm('access')}
              className={`flex-1 py-6 px-4 text-sm font-mono tracking-widest uppercase transition-all duration-300 relative ${
                activeForm === 'access'
                  ? 'text-white bg-white/5'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.02]'
              }`}
            >
              Request Private Access
              {activeForm === 'access' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-px bg-blue-500"
                />
              )}
            </button>
            <button
              onClick={() => setActiveForm('demo')}
              className={`flex-1 py-6 px-4 text-sm font-mono tracking-widest uppercase transition-all duration-300 relative ${
                activeForm === 'demo'
                  ? 'text-white bg-white/5'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.02]'
              }`}
            >
              Private Demonstration
              {activeForm === 'demo' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-px bg-blue-500"
                />
              )}
            </button>
          </div>

          {/* Form Content */}
          <div className="p-8 md:p-12">
            <AnimatePresence mode="wait">
              {activeForm === 'access' ? (
                <motion.div
                  key="access"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="mb-8">
                    <h3 className="text-2xl font-serif text-white mb-2">Request Private Access</h3>
                    <p className="text-white/50 text-sm font-light">
                      BlueArkive is currently accepting a limited number of founding partners.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                          <input
                            type="text"
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light"
                            placeholder="John Doe"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">Firm / Organization</label>
                        <div className="relative">
                          <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                          <input
                            type="text"
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light"
                            placeholder="Acme Corp"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">Work Email Identifier</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                        <input
                          type="email"
                          required
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light"
                          placeholder="john@acmecorp.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">Statement of Intent (Optional)</label>
                      <textarea
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light resize-none"
                        placeholder="Briefly describe your interest in BlueArkive's sovereign infrastructure..."
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || isSuccess}
                      className="w-full py-4 bg-white text-black font-medium tracking-wide rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 group"
                    >
                      {isSubmitting ? (
                        <span className="animate-pulse">Processing...</span>
                      ) : isSuccess ? (
                        <span className="text-blue-600 flex items-center gap-2">Application Received <CheckCircle className="w-4 h-4" /></span>
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          SUBMIT CREDENTIALS
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                    <p className="text-center text-xs text-white/30 font-light mt-4">
                      All applications are reviewed manually by our intake committee.
                    </p>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="demo"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="mb-8">
                    <h3 className="text-2xl font-serif text-white mb-2">Experience Precision.</h3>
                    <p className="text-white/50 text-sm font-light">
                      Unlock the full capability of the BlueArkive engine. Reserved for enterprise partners and investors.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                          <input
                            type="text"
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light"
                            placeholder="Jane Doe"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">Company / Firm</label>
                        <div className="relative">
                          <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                          <input
                            type="text"
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light"
                            placeholder="Global Ventures"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">Work Email</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                          <input
                            type="email"
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light"
                            placeholder="jane@globalventures.com"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">Role</label>
                        <select className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light appearance-none">
                          <option value="executive" className="bg-slate-900">Executive / C-Suite</option>
                          <option value="investor" className="bg-slate-900">Investor / Partner</option>
                          <option value="legal" className="bg-slate-900">Legal / Compliance</option>
                          <option value="technical" className="bg-slate-900">Technical / Engineering</option>
                          <option value="other" className="bg-slate-900">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-mono uppercase tracking-widest text-white/50 pl-1">How Can We Assist You?</label>
                      <textarea
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light resize-none"
                        placeholder="Please provide details about your use case..."
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || isSuccess}
                      className="w-full py-4 bg-transparent border border-white/20 text-white font-medium tracking-wide rounded-xl hover:bg-white/5 hover:border-white/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 group"
                    >
                      {isSubmitting ? (
                        <span className="animate-pulse">Processing...</span>
                      ) : isSuccess ? (
                        <span className="text-blue-400 flex items-center gap-2">Invitation Requested <CheckCircle className="w-4 h-4" /></span>
                      ) : (
                        <>
                          REQUEST INVITATION
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                    <p className="text-center text-xs text-white/30 font-light mt-4">
                      Inquiries are processed by our dedicated enterprise team.
                    </p>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
