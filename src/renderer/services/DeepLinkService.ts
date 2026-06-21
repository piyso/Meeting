/**
 * DeepLinkService — Hash-based routing for shareable meeting URLs
 *
 * 12.2 FIX: Implements `#/meeting/abc123?t=120` style deep linking.
 * Syncs navigation with window.location.hash for:
 * - Shareable meeting links
 * - Browser-style back/forward navigation
 * - Deep link from external apps (calendar, Slack, etc.)
 *
 * Lives in renderer process because it depends on window.location / hashchange.
 */

export interface DeepLinkRoute {
  view: string
  meetingId?: string
  timestamp?: number
  params: Record<string, string>
}

export class DeepLinkService {
  private listeners: Array<(route: DeepLinkRoute) => void> = []
  private currentRoute: DeepLinkRoute | null = null
  private deferredTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Parse the current hash into a route.
   */
  static parseHash(hash: string): DeepLinkRoute | null {
    if (!hash || !hash.startsWith('#/')) return null

    try {
      const url = new URL(hash.substring(1), 'http://localhost')
      const parts = url.pathname.split('/').filter(Boolean)
      const view = parts[0] || 'meetings'
      const meetingId = parts[1] || undefined
      const timestamp = url.searchParams.get('t')
        ? parseInt(url.searchParams.get('t')!, 10)
        : undefined

      const params: Record<string, string> = {}
      url.searchParams.forEach((value, key) => {
        if (key !== 't') params[key] = value
      })

      return { view, meetingId, timestamp, params }
    } catch {
      console.debug('[DeepLink] Failed to parse hash:', hash)
      return null
    }
  }

  /**
   * Build a hash string from a route.
   */
  static buildHash(route: DeepLinkRoute): string {
    const path = route.meetingId ? `/${route.view}/${route.meetingId}` : `/${route.view}`

    const searchParams = new URLSearchParams()
    if (route.timestamp !== undefined) {
      searchParams.set('t', String(route.timestamp))
    }
    for (const [key, value] of Object.entries(route.params)) {
      searchParams.set(key, value)
    }

    const query = searchParams.toString()
    return `#${path}${query ? '?' + query : ''}`
  }

  /**
   * Navigate to a route (updates hash and notifies listeners).
   */
  navigate(route: DeepLinkRoute): void {
    const hash = DeepLinkService.buildHash(route)
    if (window.location.hash !== hash) {
      window.location.hash = hash
    }
    this.currentRoute = route
    this.notifyListeners(route)
  }

  /**
   * Get the current route from the hash.
   */
  getCurrentRoute(): DeepLinkRoute | null {
    if (this.currentRoute) return this.currentRoute
    return DeepLinkService.parseHash(window.location.hash)
  }

  /**
   * Listen for route changes (hashchange events + programmatic navigation).
   */
  onRouteChange(callback: (route: DeepLinkRoute) => void): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  /**
   * Start listening to hashchange events.
   */
  startListening(): void {
    const handler = () => {
      const route = DeepLinkService.parseHash(window.location.hash)
      if (route) {
        this.currentRoute = route
        this.notifyListeners(route)
      }
    }

    window.addEventListener('hashchange', handler)

    // Parse initial hash
    const initialRoute = DeepLinkService.parseHash(window.location.hash)
    if (initialRoute) {
      this.currentRoute = initialRoute
      // Defer initial notification to let stores initialize.
      // Track timer so stopListening can cancel it.
      this.deferredTimer = setTimeout(() => {
        this.deferredTimer = null
        this.notifyListeners(initialRoute)
      }, 0)
    }

    this._cleanup = () => {
      window.removeEventListener('hashchange', handler)
      if (this.deferredTimer) {
        clearTimeout(this.deferredTimer)
        this.deferredTimer = null
      }
    }
  }

  private _cleanup: (() => void) | null = null

  /**
   * Stop listening to hashchange events.
   */
  stopListening(): void {
    if (this._cleanup) {
      this._cleanup()
      this._cleanup = null
    }
  }

  private notifyListeners(route: DeepLinkRoute): void {
    for (const listener of this.listeners) {
      try {
        listener(route)
      } catch (err) {
        console.debug('[DeepLink] Listener error:', err)
      }
    }
  }
}

// Singleton
let instance: DeepLinkService | null = null

export function getDeepLinkService(): DeepLinkService {
  if (!instance) {
    instance = new DeepLinkService()
  }
  return instance
}
