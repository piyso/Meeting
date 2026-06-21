import React from 'react'
import { motion, AnimatePresence, useMotionTemplate } from 'framer-motion'
import { Unlock, Key } from 'lucide-react'

interface OnboardingArtPanelProps {
  step: string
  authMode: 'register' | 'login'
  spotlightBackground: string | ReturnType<typeof useMotionTemplate>
  themeColor: 'emerald' | 'amber' | 'violet' | 'sky'
  setThemeColor: (color: 'emerald' | 'amber' | 'violet' | 'sky') => void
}

export const OnboardingArtPanel: React.FC<OnboardingArtPanelProps> = ({
  step,
  authMode,
  spotlightBackground,
  themeColor,
  setThemeColor,
}) => {
  return (
    <div className="hidden lg:flex lg:w-7/12 xl:w-3/5 h-full bg-slate-950 p-8 lg:p-16 flex-col relative overflow-hidden border-r border-white/[0.04]">
      <div className="absolute inset-0 with-noise opacity-[0.03] pointer-events-none z-0" />
      <motion.div
        className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-300 opacity-60"
        style={{
          background: spotlightBackground,
        }}
      />
      <div className="absolute top-0 right-0 w-[clamp(300px,40vw,600px)] h-[clamp(300px,40vw,600px)] bg-slate-800/30 blur-[clamp(60px,8vw,130px)] rounded-full pointer-events-none translate-x-1/4 -translate-y-1/4 z-0 transition-colors duration-1000" />
      <div
        className={`absolute bottom-10 left-0 w-[clamp(250px,35vw,500px)] h-[clamp(250px,35vw,500px)] blur-[clamp(50px,7vw,120px)] rounded-full pointer-events-none -translate-x-1/4 translate-y-1/4 z-0 transition-colors duration-1000 ${
          themeColor === 'emerald'
            ? 'bg-emerald-500/5'
            : themeColor === 'amber'
              ? 'bg-amber-500/5'
              : themeColor === 'violet'
                ? 'bg-violet-500/5'
                : 'bg-sky-500/5'
        }`}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={step + (step === 'auth' ? authMode : '')}
          initial={{ opacity: 0, y: 15, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -15, filter: 'blur(6px)' }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-xl mt-auto mb-auto mx-auto px-8 xl:px-12"
        >
          <div className="relative">
            <div className="absolute -left-12 -top-12 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
            <h1 className="relative text-[2.75rem] lg:text-[3.5rem] leading-[1.05] font-sans font-extralight tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-white/90 to-white/40 mb-8 drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">
              {step === 'auth'
                ? authMode === 'register'
                  ? 'The Sovereign Memory Fabric.'
                  : 'Welcome Back.'
                : ''}
              {step === 'setup' ? 'Initializing Core.' : ''}
              {step === 'recovery-key' && (
                <span className="text-transparent bg-clip-text bg-gradient-to-br from-emerald-300 via-emerald-100 to-amber-200 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  Absolute Sovereignty.
                </span>
              )}
              {step === 'plan-selection' ? 'Systems Ready.' : ''}
              {step === 'ghost-meeting' ? 'Simulation Mode.' : ''}
            </h1>
            <p className="relative text-slate-400 font-sans text-[1rem] lg:text-[1.1rem] font-light tracking-[0.02em] leading-relaxed max-w-[85%] mb-16">
              {step === 'auth'
                ? 'Constructing the autonomous agentic web. Infinite recall, zero dependencies.'
                : ''}
              {step === 'setup'
                ? 'Injecting AI models directly into your secure local environment.'
                : ''}
              {step === 'recovery-key' && (
                <span className="text-slate-300">
                  You are the only one holding the keys.{' '}
                  <span className="text-emerald-300/90 not-italic font-sans font-medium tracking-wide">
                    True ownership of your data.
                  </span>
                </span>
              )}
              {step === 'plan-selection'
                ? 'Choose the cognitive capacity required for your workflows.'
                : ''}
              {step === 'ghost-meeting'
                ? 'Your first session. Experiencing the intelligence locally.'
                : ''}
            </p>
          </div>

          {step === 'auth' && (
            <div className="mt-12 flex flex-col gap-10 pr-4 relative">
              <div className="absolute left-[36px] top-8 bottom-8 w-px bg-gradient-to-b from-white/0 via-white/10 to-white/0 hidden sm:block"></div>

              <div
                className="group relative flex items-start gap-8 p-6 -ml-6 rounded-[2rem] border border-transparent transition-all duration-700 hover:bg-white/[0.02] hover:border-white/[0.05] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] hover:-translate-y-1 hover:backdrop-blur-xl"
                onMouseEnter={() => setThemeColor('emerald')}
              >
                <div className="relative z-10 shrink-0 flex items-center justify-center w-16 h-16 rounded-[1.25rem] border border-white/5 bg-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all duration-700 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_30px_rgba(16,185,129,0.2)] group-hover:-translate-y-1 group-hover:scale-105">
                  <svg
                    className="w-6 h-6 text-slate-500 group-hover:text-emerald-300 transition-colors duration-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m3.75 5.25H21m-18 0H3m3.75 8.25v1.5m10.5-15V3m0 18v-1.5m-3.75 1.5h-7.5a2.25 2.25 0 00-2.25 2.25v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25z"
                    />
                  </svg>
                </div>
                <div className="flex flex-col pt-1.5 z-10">
                  <h3 className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-slate-400 group-hover:text-emerald-300 transition-colors duration-500 mb-2">
                    Cognitive Substrate
                  </h3>
                  <p className="text-slate-400/90 text-[0.95rem] leading-[1.6] font-light transition-colors duration-500 group-hover:text-slate-300">
                    100% local inference.{' '}
                    <span className="text-white font-medium drop-shadow-md">
                      Absolute neural independence.
                    </span>
                  </p>
                </div>
              </div>

              <div
                className="group relative flex items-start gap-8 p-6 -ml-6 rounded-[2rem] border border-transparent transition-all duration-700 hover:bg-white/[0.02] hover:border-white/[0.05] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] hover:-translate-y-1 hover:backdrop-blur-xl"
                onMouseEnter={() => setThemeColor('amber')}
              >
                <div className="relative z-10 shrink-0 flex items-center justify-center w-16 h-16 rounded-[1.25rem] border border-white/5 bg-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all duration-700 group-hover:border-amber-500/30 group-hover:bg-amber-500/10 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_30px_rgba(245,158,11,0.2)] group-hover:-translate-y-1 group-hover:scale-105">
                  <svg
                    className="w-6 h-6 text-slate-500 group-hover:text-amber-300 transition-colors duration-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                </div>
                <div className="flex flex-col pt-1.5 z-10">
                  <h3 className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-slate-400 group-hover:text-amber-300 transition-colors duration-500 mb-2">
                    Infinite Recall
                  </h3>
                  <p className="text-slate-400/90 text-[0.95rem] leading-[1.6] font-light transition-colors duration-500 group-hover:text-slate-300">
                    Seamless ambient capture.{' '}
                    <span className="text-white font-medium drop-shadow-md">
                      Retrieve any thought instantly.
                    </span>
                  </p>
                </div>
              </div>

              <div
                className="group relative flex items-start gap-8 p-6 -ml-6 rounded-[2rem] border border-transparent transition-all duration-700 hover:bg-white/[0.02] hover:border-white/[0.05] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] hover:-translate-y-1 hover:backdrop-blur-xl"
                onMouseEnter={() => setThemeColor('violet')}
              >
                <div className="relative z-10 shrink-0 flex items-center justify-center w-16 h-16 rounded-[1.25rem] border border-white/5 bg-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all duration-700 group-hover:border-violet-500/30 group-hover:bg-violet-500/10 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_30px_rgba(139,92,246,0.2)] group-hover:-translate-y-1 group-hover:scale-105">
                  <svg
                    className="w-6 h-6 text-slate-500 group-hover:text-violet-300 transition-colors duration-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                    />
                  </svg>
                </div>
                <div className="flex flex-col pt-1.5 z-10">
                  <h3 className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-slate-400 group-hover:text-violet-300 transition-colors duration-500 mb-2">
                    Agentic Action
                  </h3>
                  <p className="text-slate-400/90 text-[0.95rem] leading-[1.6] font-light transition-colors duration-500 group-hover:text-slate-300">
                    Proactive autonomy.{' '}
                    <span className="text-white font-medium drop-shadow-md">
                      Execute complex workflows entirely on-device.
                    </span>
                  </p>
                </div>
              </div>

              <div
                className="group relative flex items-start gap-8 p-6 -ml-6 rounded-[2rem] border border-transparent transition-all duration-700 hover:bg-white/[0.02] hover:border-white/[0.05] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] hover:-translate-y-1 hover:backdrop-blur-xl"
                onMouseEnter={() => setThemeColor('sky')}
              >
                <div className="relative z-10 shrink-0 flex items-center justify-center w-16 h-16 rounded-[1.25rem] border border-white/5 bg-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all duration-700 group-hover:border-sky-500/30 group-hover:bg-sky-500/10 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_30px_rgba(14,165,233,0.2)] group-hover:-translate-y-1 group-hover:scale-105">
                  <svg
                    className="w-6 h-6 text-slate-500 group-hover:text-sky-300 transition-colors duration-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                </div>
                <div className="flex flex-col pt-1.5 z-10">
                  <h3 className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-slate-400 group-hover:text-sky-300 transition-colors duration-500 mb-2">
                    Data Sovereignty
                  </h3>
                  <p className="text-slate-400/90 text-[0.95rem] leading-[1.6] font-light transition-colors duration-500 group-hover:text-slate-300">
                    Cryptographic finality.{' '}
                    <span className="text-white font-medium drop-shadow-md">
                      Inexorably bound to your hardware enclave.
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 'recovery-key' && (
            <div
              className="mt-10 lg:mt-12 w-full animate-fade-in"
              style={{ animationDelay: '0.2s' }}
            >
              <div className="relative p-[1px] rounded-3xl bg-gradient-to-b from-white/[0.12] to-transparent shadow-[0_0_80px_rgba(16,185,129,0.05)] group/enclave">
                <div className="absolute inset-0 bg-[#040812] rounded-3xl z-0" />
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.03] to-amber-500/[0.03] rounded-3xl z-0" />

                <div className="relative z-10 p-8 lg:p-10 flex flex-col gap-12">
                  <div className="flex items-start gap-6 relative group">
                    <div className="absolute left-[27px] top-[60px] bottom-[-50px] w-[2px] bg-gradient-to-b from-emerald-500/30 to-amber-500/30 group-hover/enclave:from-emerald-400/50 group-hover/enclave:to-amber-400/50 transition-colors duration-700" />

                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                      <div className="relative w-14 h-14 rounded-2xl bg-[#060d1a] border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[inset_0_0_20px_rgba(16,185,129,0.1)] group-hover:border-emerald-400/50 transition-colors duration-500">
                        <Unlock size={22} />
                      </div>
                    </div>

                    <div className="pt-0.5">
                      <div className="flex items-center gap-3 mb-2.5">
                        <h3 className="text-slate-200 font-semibold tracking-wide text-[16px]">
                          Zero-Knowledge Architecture
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                          Active
                        </span>
                      </div>
                      <p className="text-[14px] text-slate-400 leading-[1.8] group-hover:text-slate-300 transition-colors">
                        Your vault is encrypted locally with{' '}
                        <span className="font-mono text-emerald-300/90 text-[12px] bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          XChaCha20-Poly1305
                        </span>
                        . The server never sees your raw data.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-6 relative group">
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-amber-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                      <div className="relative w-14 h-14 rounded-2xl bg-[#060d1a] border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[inset_0_0_20px_rgba(245,158,11,0.1)] group-hover:border-amber-400/50 transition-colors duration-500">
                        <Key size={22} />
                      </div>
                    </div>

                    <div className="pt-0.5">
                      <div className="flex items-center gap-3 mb-2.5">
                        <h3 className="text-slate-200 font-semibold tracking-wide text-[16px]">
                          Non-Custodial Design
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                          Offline
                        </span>
                      </div>
                      <p className="text-[14px] text-slate-400 leading-[1.8] group-hover:text-slate-300 transition-colors">
                        This cryptographic seed never leaves your device unencrypted. We cannot
                        reset it or recover it for you.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
