/**
 * Small helpers for brute-force similarity search over stored embeddings.
 */

/** Cosine similarity of two vectors of the same length (0 when either is all zeros). */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    normA += x * x
    normB += y * y
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Read an embedding stored as raw little-endian float32 bytes.
 * Returns null when the byte length is not a whole number of floats.
 */
export function embeddingFromBlob(blob: Uint8Array): Float32Array | null {
  if (blob.byteLength === 0 || blob.byteLength % 4 !== 0) return null
  // A typed-array view needs a 4-byte-aligned offset; copy when it is not.
  if (blob.byteOffset % 4 === 0) {
    return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
  }
  return new Float32Array(blob.slice().buffer)
}

/** Keeps the `k` highest-scoring items offered to it. */
export class TopK<T> {
  private readonly entries: Array<{ score: number; item: T }> = []

  constructor(private readonly k: number) {
    if (!Number.isInteger(k) || k <= 0) throw new Error('k must be a positive integer')
  }

  offer(score: number, item: T): void {
    if (Number.isNaN(score)) return
    const lowest = this.entries[this.entries.length - 1]
    if (this.entries.length >= this.k && lowest && score <= lowest.score) return
    // k is small (tens), so a sorted insert beats maintaining a heap.
    let at = this.entries.length
    while (at > 0 && (this.entries[at - 1]?.score ?? -Infinity) < score) at--
    this.entries.splice(at, 0, { score, item })
    if (this.entries.length > this.k) this.entries.pop()
  }

  /** Best first. */
  results(): Array<{ score: number; item: T }> {
    return [...this.entries]
  }
}
