/**
 * Billing IPC Handler
 *
 * Handles billing-related IPC calls from the renderer process.
 * Provides tier configuration and billing status without exposing
 * PiyAPI internals to the frontend.
 *
 * Channels:
 *   - billing:getConfig  → Returns billing URL + tier data for UI
 *   - billing:getStatus  → Returns current billing status
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../types/ipcChannels'
import { config } from '../../config/environment'
import { BLUEARKIVE_TIERS, TIER_HIERARCHY } from '../../services/TierMappingService'
import { Logger } from '../../services/Logger'

const log = Logger.create('BillingHandler')

/**
 * Register billing IPC handlers
 */
export function registerBillingHandlers(): void {
  /**
   * billing:getConfig
   *
   * Returns billing URL and tier configurations for the renderer.
   * Used by openUpgrade, UpgradePrompt, PricingView.
   */
  ipcMain.handle(IPC_CHANNELS.billing.getConfig, async () => {
    try {
      const tiers = TIER_HIERARCHY.map(tierId => {
        const tier = BLUEARKIVE_TIERS[tierId]
        return {
          id: tierId,
          name: tier.name,
          price: tier.price,
          priceINR: tier.priceINR,
          period: tier.period,
          yearlyPrice: tier.yearlyPrice,
          yearlyPriceINR: tier.yearlyPriceINR,
          features: tier.features,
        }
      })

      return {
        success: true,
        data: {
          billingUrl: config.BLUEARKIVE_BILLING_URL,
          functionsUrl: config.BLUEARKIVE_FUNCTIONS_URL,
          appName: config.APP_NAME,
          tiers,
        },
      }
    } catch (error) {
      log.error('Failed to get billing config:', error)
      return {
        success: false,
        error: {
          code: 'BILLING_CONFIG_ERROR',
          message: 'Failed to load billing configuration',
          timestamp: Date.now(),
        },
      }
    }
  })

  /**
   * billing:getStatus
   *
   * Returns current billing/subscription status from keytar.
   * Used by SettingsView to show plan badge and billing warnings.
   */
  ipcMain.handle(IPC_CHANNELS.billing.getStatus, async () => {
    try {
      const { KeyStorageService } = await import('../../services/KeyStorageService')

      // Get current user ID
      const userId = await KeyStorageService.getCurrentUserId()
      if (!userId) {
        return {
          success: true,
          data: { status: 'unknown', tier: 'free' },
        }
      }

      const tier = (await KeyStorageService.getPlanTier(userId)) || 'free'
      const billingStatus = (await KeyStorageService.getBillingStatus(userId)) || 'active'

      return {
        success: true,
        data: {
          status: billingStatus,
          tier,
        },
      }
    } catch (error) {
      log.error('Failed to get billing status:', error)
      return {
        success: false,
        error: {
          code: 'BILLING_STATUS_ERROR',
          message: 'Failed to load billing status',
          timestamp: Date.now(),
        },
      }
    }
  })

  /**
   * billing:openCheckout
   *
   * Securely builds the external checkout URL (injecting the Supabase JWT token
   * and current tier/email state) and opens it in the default system browser.
   */
  ipcMain.handle(IPC_CHANNELS.billing.openCheckout, async (_, params: { targetTier?: string }) => {
    try {
      const { KeyStorageService } = await import('../../services/KeyStorageService')
      const { shell } = await import('electron')
      const keytar = await import('keytar')

      // C5: token intentionally NOT fetched — never pass JWT as URL query param

      const userId = await KeyStorageService.getCurrentUserId()
      const email = (await keytar.default.getPassword('bluearkive', 'user-email')) || ''
      const tier = userId ? (await KeyStorageService.getPlanTier(userId)) || 'free' : 'free'

      const isDevMode = !!process.env.VITE_DEV_SERVER_URL
      const billingUrl = isDevMode
        ? `${process.env.VITE_DEV_SERVER_URL}billing-web/index.html`
        : config.BLUEARKIVE_BILLING_URL || 'https://bluearkive.com/billing'

      const url = new URL(billingUrl)

      if (email) url.searchParams.set('email', email)
      if (tier) url.searchParams.set('current_tier', tier)
      if (params?.targetTier) url.searchParams.set('target_tier', params.targetTier)
      // C5 fix: Do NOT pass JWT token as URL query parameter — it leaks via
      // browser history, server logs, and HTTP Referer headers.
      // The billing page should authenticate via Supabase session or a server-side
      // short-lived token exchange instead.

      if (config.BLUEARKIVE_FUNCTIONS_URL) {
        url.searchParams.set('api_base', config.BLUEARKIVE_FUNCTIONS_URL)
      }

      url.searchParams.set('source', 'desktop_app')

      await shell.openExternal(url.toString())

      return { success: true }
    } catch (error) {
      log.error('Failed to open checkout:', error)
      return {
        success: false,
        error: {
          code: 'BILLING_OPEN_ERROR',
          message: 'Failed to open billing checkout',
          timestamp: Date.now(),
        },
      }
    }
  })

  log.info('Billing IPC handlers registered')
}
