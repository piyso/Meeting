/**
 * AudioProvenanceService — Ed25519 attestations for audio segments
 *
 * What an attestation says: "the installation holding this key recorded a
 * segment with this SHA-256 at this time". The key pair is created once and
 * kept in the OS keychain, so every attestation from one installation carries
 * the same public key.
 *
 * What it does not say: who was speaking, or that the audio is genuine — and
 * since audio is not kept after transcription, a segment can only be checked
 * against its attestation by someone who still has that audio.
 */

import { createHash, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'crypto'
import { keytarSafe } from './keytarSafe'
import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('AudioProvenance')

export interface ProvenanceAttestation {
  id: string
  meetingId: string
  segmentIndex: number
  audioHash: string // SHA-256 of the audio segment
  signature: string // Ed25519 signature of the hash
  publicKey: string // Public key used for verification
  timestamp: number
  verified: boolean
}

const KEYCHAIN_SERVICE = 'bluearkive'
const KEYCHAIN_ACCOUNT = 'audio-provenance-key'

/** The exact bytes an attestation's signature covers. */
function signedMessage(fields: {
  meetingId: string
  segmentIndex: number
  audioHash: string
  timestamp: number
}): Buffer {
  return Buffer.from(
    `bluearkive-attestation-v1\n${fields.meetingId}\n${fields.segmentIndex}\n${fields.audioHash}\n${fields.timestamp}`,
    'utf-8'
  )
}

export class AudioProvenanceService {
  private keyPair: { publicKey: string; privateKey: string } | null = null
  private loading: Promise<void> | null = null

  /**
   * Load this installation's signing key pair from the OS keychain, creating
   * it on first use. (A fresh pair used to be generated in memory on every
   * launch, so no two sessions' attestations shared a key and none could be
   * tied to the installation.)
   *
   * Does not touch the keychain until something is actually signed or
   * verified: it is called during startup, and a keychain prompt there would
   * hold up the first window.
   */
  async initialize(): Promise<void> {
    // Deliberately empty — see ensureKeyPair().
  }

  private ensureKeyPair(): Promise<void> {
    if (this.keyPair) return Promise.resolve()
    if (!this.loading) {
      this.loading = this.loadKeyPair().finally(() => {
        this.loading = null
      })
    }
    return this.loading
  }

  private async loadKeyPair(): Promise<void> {
    try {
      const keytar = await keytarSafe()
      const stored = await keytar?.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
      if (stored) {
        const parsed = JSON.parse(stored) as { publicKey?: string; privateKey?: string }
        if (parsed.publicKey && parsed.privateKey) {
          this.keyPair = { publicKey: parsed.publicKey, privateKey: parsed.privateKey }
          return
        }
      }

      const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })
      this.keyPair = { publicKey, privateKey }
      await keytar?.setPassword(
        KEYCHAIN_SERVICE,
        KEYCHAIN_ACCOUNT,
        JSON.stringify({ publicKey, privateKey })
      )
      log.info('Audio provenance key pair created')
    } catch (err) {
      log.warn('Failed to initialize provenance keys:', err)
    }
  }

  /**
   * Sign an audio segment and produce an attestation.
   */
  async signSegment(
    meetingId: string,
    segmentIndex: number,
    audioData: Buffer
  ): Promise<ProvenanceAttestation | null> {
    await this.ensureKeyPair()
    if (!this.keyPair) {
      log.warn('Cannot sign — key pair not initialized')
      return null
    }

    try {
      const audioHash = createHash('sha256').update(audioData).digest('hex')
      const timestamp = Date.now()

      // Ed25519 is signed in one shot with a null digest. (createSign('') —
      // the streaming API — throws "Invalid digest" for Ed25519 keys, so this
      // method returned null for every segment.)
      // The signature covers the hash together with the meeting, position and
      // time, so an attestation cannot be moved to another meeting or slot.
      const signature = cryptoSign(
        null,
        signedMessage({ meetingId, segmentIndex, audioHash, timestamp }),
        this.keyPair.privateKey
      ).toString('base64')

      const attestation: ProvenanceAttestation = {
        id: uuidv4(),
        meetingId,
        segmentIndex,
        audioHash,
        signature,
        publicKey: this.keyPair.publicKey,
        timestamp,
        verified: true,
      }

      await this.persistAttestation(attestation)
      return attestation
    } catch (err) {
      log.error('Failed to sign audio segment:', err)
      return null
    }
  }

  /**
   * Verify an attestation against the audio it claims to describe: the audio
   * must hash to the attested value and the signature must be valid.
   */
  verifyAttestation(attestation: ProvenanceAttestation, audioData: Buffer): boolean {
    const computedHash = createHash('sha256').update(audioData).digest('hex')
    if (computedHash !== attestation.audioHash) return false
    return this.verifySignature(attestation)
  }

  /** Check that an attestation's fields are exactly what its key signed. */
  verifySignature(attestation: ProvenanceAttestation): boolean {
    try {
      return cryptoVerify(
        null,
        signedMessage(attestation),
        attestation.publicKey,
        Buffer.from(attestation.signature, 'base64')
      )
    } catch {
      return false
    }
  }

  /**
   * Get all attestations for a meeting.
   */
  getAttestations(meetingId: string): ProvenanceAttestation[] {
    try {
      const db = getDatabaseService().getDb()
      const rows = db
        .prepare(`SELECT * FROM audio_attestations WHERE meeting_id = ? ORDER BY segment_index ASC`)
        .all(meetingId) as Array<{
        id: string
        meeting_id: string
        segment_index: number
        audio_hash: string
        signature: string
        public_key: string
        timestamp: number
        verified: number
      }>
      // Columns are snake_case; returning the rows as they come left every
      // camelCase field undefined, so each one was reported as tampered.
      return rows.map(row => ({
        id: row.id,
        meetingId: row.meeting_id,
        segmentIndex: row.segment_index,
        audioHash: row.audio_hash,
        signature: row.signature,
        publicKey: row.public_key,
        timestamp: row.timestamp,
        verified: row.verified === 1,
      }))
    } catch {
      return []
    }
  }

  /**
   * Verify the entire chain of attestations for a meeting.
   */
  verifyMeetingChain(meetingId: string): {
    valid: boolean
    totalSegments: number
    verifiedSegments: number
    tamperedSegments: number[]
  } {
    const attestations = this.getAttestations(meetingId)
    const tampered: number[] = []

    // Each stored record is checked against its own signature: a row whose
    // hash, position, meeting or time was edited after signing fails. Whether
    // the *audio* matches needs the audio itself (verifyAttestation), and all
    // records of a meeting must come from one key.
    const signer = attestations[0]?.publicKey
    for (const att of attestations) {
      if (att.publicKey !== signer || !this.verifySignature(att)) {
        tampered.push(att.segmentIndex)
      }
    }

    return {
      valid: tampered.length === 0,
      totalSegments: attestations.length,
      verifiedSegments: attestations.length - tampered.length,
      tamperedSegments: tampered,
    }
  }

  /**
   * Export a verifiable provenance report.
   */
  exportProvenanceReport(meetingId: string): string {
    const attestations = this.getAttestations(meetingId)
    const chainResult = this.verifyMeetingChain(meetingId)

    return JSON.stringify(
      {
        meeting_id: meetingId,
        generated_at: new Date().toISOString(),
        chain_valid: chainResult.valid,
        total_segments: chainResult.totalSegments,
        verified_segments: chainResult.verifiedSegments,
        attestations: attestations.map(a => ({
          segment: a.segmentIndex,
          hash: a.audioHash,
          signature: a.signature.substring(0, 32) + '...',
          timestamp: new Date(a.timestamp).toISOString(),
        })),
      },
      null,
      2
    )
  }

  // ── Private ──

  private async persistAttestation(att: ProvenanceAttestation): Promise<void> {
    try {
      const db = getDatabaseService().getDb()
      db.exec(`
        CREATE TABLE IF NOT EXISTS audio_attestations (
          id TEXT PRIMARY KEY,
          meeting_id TEXT NOT NULL,
          segment_index INTEGER NOT NULL,
          audio_hash TEXT NOT NULL,
          signature TEXT NOT NULL,
          public_key TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          verified INTEGER DEFAULT 1,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (meeting_id) REFERENCES meetings(id)
        )
      `)
      try {
        db.exec(
          'CREATE INDEX IF NOT EXISTS idx_attest_meeting ON audio_attestations(meeting_id, segment_index)'
        )
      } catch {
        /* index exists */
      }

      db.prepare(
        `INSERT INTO audio_attestations (id, meeting_id, segment_index, audio_hash, signature, public_key, timestamp, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        att.id,
        att.meetingId,
        att.segmentIndex,
        att.audioHash,
        att.signature,
        att.publicKey,
        att.timestamp,
        att.verified ? 1 : 0
      )
    } catch (err) {
      log.warn('Failed to persist attestation:', err)
    }
  }
}

let instance: AudioProvenanceService | null = null
export function getAudioProvenanceService(): AudioProvenanceService {
  if (!instance) instance = new AudioProvenanceService()
  return instance
}
