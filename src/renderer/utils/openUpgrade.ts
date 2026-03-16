import { rendererLog } from './logger'

const log = rendererLog.create('openUpgrade')

/**
 * Centralized upgrade helper — builds a billing URL with user context
 * and opens it in the default browser.
 *
 * In dev mode, routes to the local billing-web page served by Vite.
 * In production, routes to the live billing-web-azure.vercel.app page.
 *
 * Usage:
 *   import { openUpgrade } from '../utils/openUpgrade'
 *   <Button onClick={() => openUpgrade('pro')}>Upgrade</Button>
 */

const DEV_BILLING_URL = 'http://localhost:5173/billing-web/index.html'
const PROD_BILLING_URL = 'https://billing-web-azure.vercel.app'

export async function openUpgrade(targetTier?: string): Promise<void> {
  try {
    await window.electronAPI?.billing?.openCheckout?.({ targetTier })
  } catch (error) {
    log.error('Failed to open upgrade:', error)
    // Fallback if IPC fails
    const isDevMode = !!window.location.hostname.includes('localhost')
    const fallback = isDevMode ? DEV_BILLING_URL : PROD_BILLING_URL
    await window.electronAPI?.shell?.openExternal?.(fallback)
  }
}
