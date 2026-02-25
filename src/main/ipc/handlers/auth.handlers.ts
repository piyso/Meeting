/**
 * Auth Handlers — Authentication-related IPC handlers
 *
 * Handles:
 *  - auth:generateRecoveryKey — Generate a 12-word BIP39-style recovery phrase
 */

import { ipcMain } from 'electron'
import crypto from 'crypto'

// BIP39-style word list (subset for recovery phrases)
const WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'awesome', 'awful', 'awkward', 'axis', 'baby',
  'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball', 'bamboo',
  'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base', 'basic',
  'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become', 'beef',
  'before', 'begin', 'behave', 'behind', 'believe', 'below', 'bench', 'benefit',
  'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike',
  'bind', 'biology', 'bird', 'birth', 'bitter', 'black', 'blade', 'blame',
  'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood', 'blossom', 'blow',
  'blue', 'blur', 'blush', 'board', 'boat', 'body', 'boil', 'bomb',
  'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow', 'boss',
  'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand', 'brass',
  'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief', 'bright', 'bring',
  'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother', 'brown', 'brush',
  'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb', 'bulk', 'bullet',
  'bundle', 'bunny', 'burden', 'burger', 'burst', 'bus', 'business', 'busy',
]

const PHRASE_LENGTH = 12

/**
 * Generate a cryptographically secure recovery phrase
 */
function generateRecoveryPhrase(): string[] {
  const phrase: string[] = []
  for (let i = 0; i < PHRASE_LENGTH; i++) {
    const randomIndex = crypto.randomInt(0, WORDLIST.length)
    phrase.push(WORDLIST[randomIndex]!)
  }
  return phrase
}

export function registerAuthHandlers(): void {
  // auth:generateRecoveryKey — Generate a 12-word recovery phrase
  ipcMain.handle('auth:generateRecoveryKey', async () => {
    try {
      const phrase = generateRecoveryPhrase()

      // Optionally store in keychain for this session
      try {
        const { KeyStorageService, KeyType } = await import('../../services/KeyStorageService')
        const userId = await KeyStorageService.getCurrentUserId()
        if (userId) {
          await KeyStorageService.storeRecoveryPhrase(userId, phrase.join(' '))
        }
      } catch {
        // Non-critical — user will write it down
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
