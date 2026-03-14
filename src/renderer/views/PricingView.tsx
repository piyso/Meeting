import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, X, ArrowLeft, Shield, Zap, Key } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { IconButton } from '../components/ui/IconButton'
import { useAppStore } from '../store/appStore'
import { openUpgrade } from '../utils/openUpgrade'
import './pricing.css'

interface PricingFeature {
  name: string
  free: boolean | string
  starter: boolean | string
  pro: boolean | string
}

const features: PricingFeature[] = [
  { name: 'Connected Devices', free: '1 Device', starter: '2 Devices', pro: 'Unlimited' },
  { name: 'Cloud AI Intelligence', free: false, starter: '50 Queries/mo', pro: 'Unlimited' },
  { name: 'Secure Cloud Sync', free: false, starter: true, pro: true },
  { name: 'Meeting Transcript Limit', free: '5k Chars', starter: '10k Chars', pro: '25k Chars' },
  { name: 'Cloud Transcription', free: '10 hrs/mo', starter: '20 hrs/mo', pro: 'Unlimited' },
  { name: 'Speaker Diarization', free: false, starter: false, pro: true },
  { name: 'Weekly AI Digests', free: false, starter: false, pro: true },
]

interface BillingConfig {
  tiers?: { id: string; price: string; yearlyPrice?: string }[]
}

export const PricingView: React.FC = () => {
  const navigate = useAppStore(s => s.navigate)
  const addToast = useAppStore(s => s.addToast)
  const currentTier = useAppStore(s => s.currentTier)
  const setGlobalTier = useAppStore(s => s.setCurrentTier)
  const [licenseKey, setLicenseKey] = useState('')
  const [isActivating, setIsActivating] = useState(false)
  const [sysMem, setSysMem] = useState<number>(16)
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')

  const [config, setConfig] = useState<BillingConfig | null>(null)

  // Tier is managed globally by useSystemState — no need to fetch here.
  // currentTier is already read from the store at L34.

  useEffect(() => {
    // Fetch system memory hint to provide context
    const fetchSysInfo = async () => {
      try {
        const hinfo = (await window.electronAPI?.diagnostic?.getSystemInfo?.()) as {
          memory?: { total: number }
        } | null
        if (hinfo && hinfo.memory) {
          setSysMem(Math.round(hinfo.memory.total / (1024 * 1024 * 1024)))
        }
      } catch (_err) {
        // ignore
      }
    }
    fetchSysInfo()

    const fetchConfig = async () => {
      try {
        const res = await window.electronAPI?.billing?.getConfig()
        if (res?.success && res.data) {
          setConfig(res.data)
        }
      } catch (_err) {
        // ignore
      }
    }
    fetchConfig()
  }, [])

  const getPriceNum = (tierId: string, fallback: string) => {
    const tier = config?.tiers?.find(t => t.id === tierId)
    if (billingInterval === 'yearly' && tier?.yearlyPrice) {
      return tier.yearlyPrice.replace('$', '')
    }
    const priceStr = tier?.price
    return priceStr ? priceStr.replace('$', '') : fallback
  }

  const handleUpgradeClick = (tier: string) => {
    openUpgrade(tier)
    addToast({
      type: 'info',
      title: 'Billing page opened',
      message:
        'Complete payment in your browser. Your license key will be emailed to you — enter it below to activate instantly!',
      duration: 10000,
    })
  }

  const handleActivateLicense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licenseKey.trim()) return

    setIsActivating(true)
    try {
      if (!window.electronAPI?.auth?.activateLicense) {
        throw new Error('License activation not available offline')
      }

      const res = (await window.electronAPI.auth.activateLicense({
        key: licenseKey.trim(),
      })) as unknown as {
        data?: { tier: string }
        tier: string
      }
      const updatedUser = res.data !== undefined ? res.data : res
      setGlobalTier(updatedUser.tier)
      addToast({
        type: 'success',
        title: 'Upgrade Successful',
        message: `Successfully upgraded to ${updatedUser.tier.toUpperCase()} tier!`,
      })
      setLicenseKey('')
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Activation Failed',
        message: err instanceof Error ? err.message : 'Failed to activate license',
      })
    } finally {
      setIsActivating(false)
    }
  }

  const containerVariants: import('framer-motion').Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  }

  const itemVariants: import('framer-motion').Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: 'spring', stiffness: 100, damping: 15 },
    },
  }

  const renderFeatureRow = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check size={18} className="ui-pricing-feature-icon included" />
      ) : (
        <X size={18} className="ui-pricing-feature-icon" style={{ opacity: 0.3 }} />
      )
    }
    return (
      <span
        style={{
          fontWeight: 600,
          color: value === 'Unlimited' ? 'var(--color-violet-light)' : 'inherit',
        }}
      >
        {value}
      </span>
    )
  }

  return (
    <div className="ui-pricing-container">
      <div className="mb-4">
        <IconButton
          icon={<ArrowLeft size={20} />}
          onClick={() => navigate('meeting-list')}
          tooltip="Back to Meetings"
        />
      </div>

      <motion.div
        className="ui-pricing-content"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div className="ui-pricing-header" variants={itemVariants}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 text-sm font-medium border border-violet-500/20 mb-2">
            <Shield size={14} /> Security First. Local First.
          </div>
          <h1 className="ui-pricing-title">Expand Your Cognitive Substrate</h1>
          <p className="ui-pricing-subtitle">
            BlueArkive is a Sovereign Memory Fabric. Your data is E2E encrypted and processed
            locally. Upgrade to seamlessly sync your mind across devices and unlock massive Cloud AI
            models.
          </p>

          {sysMem <= 8 && currentTier === 'free' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-2 text-sm text-yellow-500/90 flex items-center gap-2 bg-yellow-500/10 px-4 py-2 rounded-lg border border-yellow-500/20"
            >
              <Zap size={14} />
              We detected {sysMem}GB RAM. Pro tier offloads massive LLMs to our cloud, saving your
              battery & CPU.
            </motion.div>
          )}
        </motion.div>

        {/* Billing Interval Toggle */}
        <motion.div variants={itemVariants} className="flex items-center justify-center gap-4">
          <span
            className={`text-sm font-medium cursor-pointer transition-colors ${
              billingInterval === 'monthly' ? 'text-white' : 'text-[var(--color-text-tertiary)]'
            }`}
            onClick={() => setBillingInterval('monthly')}
          >
            Monthly
          </span>
          <button
            onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'yearly' : 'monthly')}
            className="relative w-14 h-7 rounded-full transition-colors duration-300"
            style={{
              background:
                billingInterval === 'yearly' ? 'var(--color-violet)' : 'rgba(255,255,255,0.1)',
            }}
          >
            <div
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300"
              style={{
                transform: billingInterval === 'yearly' ? 'translateX(30px)' : 'translateX(2px)',
              }}
            />
          </button>
          <span
            className={`text-sm font-medium cursor-pointer transition-colors ${
              billingInterval === 'yearly' ? 'text-white' : 'text-[var(--color-text-tertiary)]'
            }`}
            onClick={() => setBillingInterval('yearly')}
          >
            Yearly
          </span>
          {billingInterval === 'yearly' && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold border border-emerald-500/30"
            >
              Save ~20%
            </motion.span>
          )}
        </motion.div>

        <motion.div className="ui-pricing-grid" variants={containerVariants}>
          {/* Free Tier */}
          <motion.div className="ui-pricing-card" variants={itemVariants}>
            <div className="ui-pricing-badge-container">
              {currentTier === 'free' && (
                <span className="ui-pricing-badge current">Current Plan</span>
              )}
            </div>
            <h2 className="ui-pricing-plan-name">Sovereign Local</h2>
            <div className="ui-pricing-price">
              <span className="ui-pricing-currency">$</span>0
              <span className="ui-pricing-period">/ forever</span>
            </div>
            <p className="ui-pricing-desc">
              Absolute privacy. Local processing. Your mind, secured on this physical device.
            </p>

            <div className="ui-pricing-cta-wrap">
              <Button disabled variant="secondary" className="w-full">
                {currentTier === 'free' ? 'Active' : 'Free Tier'}
              </Button>
            </div>

            <div className="ui-pricing-features">
              {features.map((f, i) => (
                <div key={i} className="ui-pricing-feature">
                  {renderFeatureRow(f.free)}
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Starter Tier */}
          <motion.div className="ui-pricing-card" variants={itemVariants}>
            <div className="ui-pricing-badge-container">
              {currentTier === 'starter' && (
                <span className="ui-pricing-badge current">Current Plan</span>
              )}
            </div>
            <h2 className="ui-pricing-plan-name">Enhanced Sync</h2>
            <div className="ui-pricing-price">
              <span className="ui-pricing-currency">$</span>
              {billingInterval === 'yearly'
                ? getPriceNum('starter', '7')
                : getPriceNum('starter', '9')}
              <span className="ui-pricing-period">/ month</span>
            </div>
            {billingInterval === 'yearly' && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] -mt-1 mb-1">
                Billed as $
                {Number(
                  billingInterval === 'yearly'
                    ? getPriceNum('starter', '7')
                    : getPriceNum('starter', '9')
                ) * 12}
                /year
              </p>
            )}
            <p className="ui-pricing-desc">
              Connect two devices. Sync your thoughts securely and unlock baseline Cloud AI.
            </p>

            <div className="ui-pricing-cta-wrap">
              <Button
                variant={currentTier === 'starter' ? 'secondary' : 'primary'}
                className="w-full"
                onClick={() => handleUpgradeClick('starter')}
                disabled={
                  currentTier === 'starter' ||
                  currentTier === 'pro' ||
                  currentTier === 'team' ||
                  currentTier === 'enterprise'
                }
              >
                {currentTier === 'starter'
                  ? 'Active Plan'
                  : currentTier === 'pro' || currentTier === 'team' || currentTier === 'enterprise'
                    ? 'Included'
                    : 'Upgrade to Starter'}
              </Button>
            </div>

            <div className="ui-pricing-features">
              {features.map((f, i) => (
                <div key={i} className="ui-pricing-feature">
                  {renderFeatureRow(f.starter)}
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Pro Tier (Hero) */}
          <motion.div className="ui-pricing-card is-pro" variants={itemVariants}>
            <div className="ui-pricing-badge-container">
              {currentTier === 'pro' ? (
                <span className="ui-pricing-badge current">Current Plan</span>
              ) : (
                <span className="ui-pricing-badge popular">✨ Most Popular</span>
              )}
            </div>
            <h2 className="ui-pricing-plan-name">Limitless Memory</h2>
            <div className="ui-pricing-price">
              <span className="ui-pricing-currency">$</span>
              {billingInterval === 'yearly' ? getPriceNum('pro', '15') : getPriceNum('pro', '19')}
              <span className="ui-pricing-period">/ month</span>
            </div>
            {billingInterval === 'yearly' && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] -mt-1 mb-1">
                Billed as $
                {Number(
                  billingInterval === 'yearly' ? getPriceNum('pro', '15') : getPriceNum('pro', '19')
                ) * 12}
                /year
              </p>
            )}
            <p className="ui-pricing-desc">
              Zero limits. Full speaker diarization. High-capacity cloud models. The ultimate
              cognition engine.
            </p>

            <div className="ui-pricing-cta-wrap">
              <Button
                variant="primary"
                className="w-full"
                onClick={() => handleUpgradeClick('pro')}
                disabled={
                  currentTier === 'pro' || currentTier === 'team' || currentTier === 'enterprise'
                }
                style={{ background: currentTier !== 'pro' ? 'var(--color-violet)' : undefined }}
              >
                {currentTier === 'pro'
                  ? 'Active Plan'
                  : currentTier === 'team' || currentTier === 'enterprise'
                    ? 'Included'
                    : 'Go Pro'}
              </Button>
            </div>

            <div className="ui-pricing-features">
              {features.map((f, i) => (
                <div key={i} className="ui-pricing-feature">
                  {renderFeatureRow(f.pro)}
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Enterprise Banner */}
        <motion.div className="ui-pricing-enterprise" variants={itemVariants}>
          <div className="ui-pricing-enterprise-content">
            <h3 className="ui-pricing-enterprise-title">Team & Enterprise</h3>
            <p className="ui-pricing-enterprise-desc">
              Need organizational brain syncing? Deploy BlueArkive with SOC-2 compliance, E2E
              Immutable Audit Logs (`AuditLogger`), and up to 100k transcript limits.
            </p>
          </div>
          <Button variant="secondary" onClick={() => window.open('mailto:sales@bluearkive.com')}>
            Contact Sales
          </Button>
        </motion.div>

        {/* License Key Activatation */}
        <motion.div className="ui-pricing-license-zone" variants={itemVariants}>
          <h4 className="ui-pricing-license-title">Have a License Key?</h4>
          <p className="ui-pricing-license-desc">Activate your pre-purchased tier instantly.</p>
          <form className="ui-pricing-license-form" onSubmit={handleActivateLicense}>
            <div className="relative flex-1 flex items-center">
              <Key size={16} className="absolute left-3 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="ui-pricing-license-input pl-9"
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                disabled={isActivating}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={!licenseKey.trim() || isActivating}>
              {isActivating ? 'Verifying...' : 'Activate'}
            </Button>
          </form>
        </motion.div>
      </motion.div>
    </div>
  )
}
