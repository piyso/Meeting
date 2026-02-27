/**
 * Auth Handlers — Authentication-related IPC handlers
 *
 * Handles:
 *  - auth:login — Login with email + password
 *  - auth:register — Register new account
 *  - auth:logout — Clear session
 *  - auth:getCurrentUser — Get stored user info
 *  - auth:isAuthenticated — Check auth status
 *  - auth:generateRecoveryKey — Generate a 12-word BIP39-style recovery phrase
 *  - auth:googleAuth — Start Google OAuth flow
 *  - auth:refreshToken — Manually refresh token
 */

import { ipcMain } from 'electron'
import crypto from 'crypto'
import { Logger } from '../../services/Logger'

const log = Logger.create('AuthHandlers')

// BIP39-style word list (subset for recovery phrases)
const WORDLIST = [
  'abandon',
  'ability',
  'able',
  'about',
  'above',
  'absent',
  'absorb',
  'abstract',
  'absurd',
  'abuse',
  'access',
  'accident',
  'account',
  'accuse',
  'achieve',
  'acid',
  'acoustic',
  'acquire',
  'across',
  'act',
  'action',
  'actor',
  'actress',
  'actual',
  'adapt',
  'add',
  'addict',
  'address',
  'adjust',
  'admit',
  'adult',
  'advance',
  'advice',
  'aerobic',
  'affair',
  'afford',
  'afraid',
  'again',
  'age',
  'agent',
  'agree',
  'ahead',
  'aim',
  'air',
  'airport',
  'aisle',
  'alarm',
  'album',
  'alcohol',
  'alert',
  'alien',
  'all',
  'alley',
  'allow',
  'almost',
  'alone',
  'alpha',
  'already',
  'also',
  'alter',
  'always',
  'amateur',
  'amazing',
  'among',
  'amount',
  'amused',
  'analyst',
  'anchor',
  'ancient',
  'anger',
  'angle',
  'angry',
  'animal',
  'ankle',
  'announce',
  'annual',
  'another',
  'answer',
  'antenna',
  'antique',
  'anxiety',
  'any',
  'apart',
  'apology',
  'appear',
  'apple',
  'approve',
  'april',
  'arch',
  'arctic',
  'area',
  'arena',
  'argue',
  'arm',
  'armed',
  'armor',
  'army',
  'around',
  'arrange',
  'arrest',
  'arrive',
  'arrow',
  'art',
  'artefact',
  'artist',
  'artwork',
  'ask',
  'aspect',
  'assault',
  'asset',
  'assist',
  'assume',
  'asthma',
  'athlete',
  'atom',
  'attack',
  'attend',
  'attitude',
  'attract',
  'auction',
  'audit',
  'august',
  'aunt',
  'author',
  'auto',
  'autumn',
  'average',
  'avocado',
  'avoid',
  'awake',
  'aware',
  'awesome',
  'awful',
  'awkward',
  'axis',
  'baby',
  'bachelor',
  'bacon',
  'badge',
  'bag',
  'balance',
  'balcony',
  'ball',
  'bamboo',
  'banana',
  'banner',
  'bar',
  'barely',
  'bargain',
  'barrel',
  'base',
  'basic',
  'basket',
  'battle',
  'beach',
  'bean',
  'beauty',
  'because',
  'become',
  'beef',
  'before',
  'begin',
  'behave',
  'behind',
  'believe',
  'below',
  'bench',
  'benefit',
  'best',
  'betray',
  'better',
  'between',
  'beyond',
  'bicycle',
  'bid',
  'bike',
  'bind',
  'biology',
  'bird',
  'birth',
  'bitter',
  'black',
  'blade',
  'blame',
  'blanket',
  'blast',
  'bleak',
  'bless',
  'blind',
  'blood',
  'blossom',
  'blow',
  'blue',
  'blur',
  'blush',
  'board',
  'boat',
  'body',
  'boil',
  'bomb',
  'bone',
  'bonus',
  'book',
  'boost',
  'border',
  'boring',
  'borrow',
  'boss',
  'bottom',
  'bounce',
  'box',
  'boy',
  'bracket',
  'brain',
  'brand',
  'brass',
  'brave',
  'bread',
  'breeze',
  'brick',
  'bridge',
  'brief',
  'bright',
  'bring',
  'brisk',
  'broccoli',
  'broken',
  'bronze',
  'broom',
  'brother',
  'brown',
  'brush',
  'bubble',
  'buddy',
  'budget',
  'buffalo',
  'build',
  'bulb',
  'bulk',
  'bullet',
  'bundle',
  'bunny',
  'burden',
  'burger',
  'burst',
  'bus',
  'business',
  'busy',
]

const PHRASE_LENGTH = 24

function generateRecoveryPhrase(): string[] {
  const phrase: string[] = []
  for (let i = 0; i < PHRASE_LENGTH; i++) {
    const randomIndex = crypto.randomInt(0, WORDLIST.length)
    phrase.push(WORDLIST[randomIndex] ?? 'unknown')
  }
  return phrase
}

export function registerAuthHandlers(): void {
  // auth:login — Login with email + password
  ipcMain.handle('auth:login', async (_, params) => {
    try {
      if (!params?.email || !params?.password) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'email and password are required',
            timestamp: Date.now(),
          },
        }
      }

      const { getAuthService } = await import('../../services/AuthService')
      const authService = getAuthService()
      const result = await authService.login(params.email, params.password)

      return {
        success: true,
        data: {
          user: result.user,
          expiresIn: result.tokens.expiresIn,
        },
      }
    } catch (error) {
      log.warn('Login failed', error)
      return {
        success: false,
        error: {
          code: 'AUTH_LOGIN_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:register — Register new account
  ipcMain.handle('auth:register', async (_, params) => {
    try {
      if (!params?.email || !params?.password) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'email and password are required',
            timestamp: Date.now(),
          },
        }
      }

      const { getAuthService } = await import('../../services/AuthService')
      const authService = getAuthService()
      const result = await authService.register(params.email, params.password)

      return {
        success: true,
        data: {
          user: result.user,
          expiresIn: result.tokens.expiresIn,
        },
      }
    } catch (error) {
      log.warn('Registration failed', error)
      return {
        success: false,
        error: {
          code: 'AUTH_REGISTER_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:logout — Clear session and tokens
  ipcMain.handle('auth:logout', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      await getAuthService().logout()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_LOGOUT_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:getCurrentUser — Get stored user info
  ipcMain.handle('auth:getCurrentUser', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      const user = await getAuthService().getCurrentUser()
      return { success: true, data: user }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_GET_USER_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:isAuthenticated — Check if user is logged in
  ipcMain.handle('auth:isAuthenticated', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      const authenticated = await getAuthService().isAuthenticated()
      return { success: true, data: { authenticated } }
    } catch (error) {
      return { success: true, data: { authenticated: false } }
    }
  })

  // auth:googleAuth — Start Google OAuth flow in system browser
  ipcMain.handle('auth:googleAuth', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      await getAuthService().startGoogleAuth()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_GOOGLE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:refreshToken — Manually trigger token refresh
  ipcMain.handle('auth:refreshToken', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      const tokens = await getAuthService().refreshToken()
      return { success: true, data: { refreshed: tokens !== null } }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_REFRESH_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:generateRecoveryKey — Generate a 12-word recovery phrase
  ipcMain.handle('auth:generateRecoveryKey', async () => {
    try {
      const phrase = generateRecoveryPhrase()

      // Store in keychain for this session
      try {
        const { KeyStorageService } = await import('../../services/KeyStorageService')
        const userId = await KeyStorageService.getCurrentUserId()
        if (userId) {
          await KeyStorageService.storeRecoveryPhrase(userId, phrase.join(' '))
        }
      } catch (err) {
        log.debug('Recovery phrase keychain store skipped', err)
      }

      return {
        success: true,
        data: { phrase },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_RECOVERY_KEY_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
