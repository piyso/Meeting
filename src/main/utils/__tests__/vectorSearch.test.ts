import { describe, it, expect } from 'vitest'
import { TopK, cosineSimilarity, embeddingFromBlob } from '../vectorSearch'

describe('cosineSimilarity', () => {
  it('is 1 for the same direction, 0 for orthogonal, -1 for opposite', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('is 0 instead of NaN when a vector is all zeros', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })
})

describe('embeddingFromBlob', () => {
  it('reads float32 values back', () => {
    const source = new Float32Array([0.25, -1.5, 3])
    const blob = Buffer.from(source.buffer)
    expect(Array.from(embeddingFromBlob(blob) ?? [])).toEqual([0.25, -1.5, 3])
  })

  it('handles a view that does not start on a 4-byte boundary', () => {
    const source = new Float32Array([1, 2])
    const padded = new Uint8Array(1 + source.byteLength)
    padded.set(new Uint8Array(source.buffer), 1)
    const unaligned = padded.subarray(1)
    expect(unaligned.byteOffset % 4).not.toBe(0)
    expect(Array.from(embeddingFromBlob(unaligned) ?? [])).toEqual([1, 2])
  })

  it('rejects lengths that are not whole floats', () => {
    expect(embeddingFromBlob(new Uint8Array(6))).toBeNull()
    expect(embeddingFromBlob(new Uint8Array(0))).toBeNull()
  })
})

describe('TopK', () => {
  it('keeps the k best, best first', () => {
    const top = new TopK<string>(3)
    const scores: Array<[number, string]> = [
      [0.1, 'a'],
      [0.9, 'b'],
      [0.5, 'c'],
      [0.7, 'd'],
      [0.3, 'e'],
    ]
    for (const [score, item] of scores) top.offer(score, item)
    expect(top.results().map(r => r.item)).toEqual(['b', 'd', 'c'])
  })

  it('ignores NaN scores', () => {
    const top = new TopK<string>(2)
    top.offer(Number.NaN, 'bad')
    top.offer(0.2, 'ok')
    expect(top.results().map(r => r.item)).toEqual(['ok'])
  })

  it('returns fewer than k when fewer were offered', () => {
    const top = new TopK<number>(5)
    top.offer(1, 1)
    expect(top.results()).toHaveLength(1)
  })
})
