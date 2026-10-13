/**
 * The shape of a record on its way to the cloud.
 *
 * Kept apart from SyncManager so that the code which downloads records again
 * (CloudRestoreService) and its tests are written against the very same
 * functions the uploader uses, not a copy of them.
 */

import { v4 as uuidv4 } from 'uuid'
import type { Memory } from './backend/IBackendProvider'

export interface SyncRecordRef {
  table_name: string
  operation_type: string
  record_id: string
  /** Epoch seconds at which the change was queued. */
  created_at: number
}

export interface EncryptedSyncPayload {
  ciphertext: string
  iv: string
  salt: string
  authTag: string
  algorithm: string
}

/**
 * Split a record whose text is longer than `sizeLimit` into several payloads,
 * cut at a line break, sentence end or space where there is one.
 *
 * Each piece carries `parent_id`, `chunk_index` and `total_chunks`; the text
 * of the piece replaces `text`, `content` and `original_text`.
 */
export function chunkSyncPayload(
  payload: Record<string, unknown>,
  sizeLimit: number
): Record<string, unknown>[] {
  const content = payload.text || payload.content || payload.original_text
  if (typeof content !== 'string' || content.length <= sizeLimit) {
    return [payload]
  }

  const chunks: Record<string, unknown>[] = []
  const parentId = uuidv4()

  let remaining = content
  let chunkIndex = 0
  while (remaining.length > 0) {
    let chunkContent: string
    if (remaining.length <= sizeLimit) {
      chunkContent = remaining
      remaining = ''
    } else {
      // Find the last sentence boundary within the size limit
      const slice = remaining.substring(0, sizeLimit)
      // Try newline, then period+space, then space as fallback
      let splitAt = slice.lastIndexOf('\n')
      if (splitAt < sizeLimit * 0.5) splitAt = slice.lastIndexOf('. ')
      if (splitAt < sizeLimit * 0.5) splitAt = slice.lastIndexOf(' ')
      if (splitAt < sizeLimit * 0.3) {
        splitAt = sizeLimit // fallback to hard cut
      } else {
        splitAt += 1 // include the delimiter
      }

      chunkContent = remaining.substring(0, splitAt).trim()
      remaining = remaining.substring(splitAt).trim()
    }

    chunks.push({
      ...payload,
      text: chunkContent,
      content: chunkContent,
      original_text: chunkContent,
      parent_id: parentId,
      chunk_index: chunkIndex,
      total_chunks: -1, // known only once the loop is done
    })
    chunkIndex++
  }

  for (const chunk of chunks) {
    chunk.total_chunks = chunks.length
  }
  return chunks
}

/**
 * The memory one encrypted payload is stored as.
 *
 * `_embedding` is accepted for callers that still compute one and is not
 * uploaded. PiyAPI never stored a client-supplied vector (its index holds
 * 1536-dimension vectors from its own model; the local model produces 384),
 * so sending it only put a plaintext-derived vector next to the ciphertext
 * for no search benefit.
 */
export function buildSyncMemory(
  record: SyncRecordRef,
  encrypted: EncryptedSyncPayload,
  _embedding?: number[]
): Memory {
  return {
    content: encrypted.ciphertext,
    namespace: `meetings.${record.table_name}`,
    tags: [record.table_name, record.operation_type, `rid:${record.record_id}`],
    metadata: {
      record_id: record.record_id,
      iv: encrypted.iv,
      salt: encrypted.salt,
      authTag: encrypted.authTag,
      algorithm: encrypted.algorithm,
      created_at: record.created_at,
      encrypted: true,
      // Tells PiyAPI the content is ciphertext it cannot read: store it, and
      // run nothing that works on the words (embedding, PHI detection,
      // entity extraction, chunking).
      client_encrypted: true,
      // The same request, as servers from before `client_encrypted` know it.
      skip_server_embedding: true,
    },
    // No sourceType: PiyAPI's `source_type` is a fixed list of content
    // origins, not table names. The table is in the namespace and the tags.
    eventTime: new Date(record.created_at * 1000).toISOString(),
  }
}
