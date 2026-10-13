/**
 * VectorWhiteningService.test.ts
 *
 * Hardcore mathematical validation for:
 * 1. Mean-centering & Anisotropy correction
 * 2. Dominant Singular Vector / Component Nullification
 * 3. Matryoshka Adaptive Slicing (64d, 128d) & L2 Renormalization
 * 4. Maximal Marginal Relevance (MMR) Redundancy Suppression
 */

import { describe, it, expect } from 'vitest'
import { VectorWhiteningService } from '../VectorWhiteningService'

describe('VectorWhiteningService & MMR Reranker', () => {
  it('should compute exact mean vector across an embedding corpus', () => {
    const embeddings = [
      [1.0, 2.0, 3.0],
      [3.0, 4.0, 5.0],
      [2.0, 6.0, 4.0],
    ]

    const mean = VectorWhiteningService.computeMeanVector(embeddings)
    expect(mean[0]).toBeCloseTo(2.0, 5)
    expect(mean[1]).toBeCloseTo(4.0, 5)
    expect(mean[2]).toBeCloseTo(4.0, 5)
  })

  it('should mean-center and produce unit L2 normalized vector', () => {
    const vec = [5.0, 5.0, 5.0]
    const mean = [2.0, 1.0, 1.0]

    const centered = VectorWhiteningService.centerVector(vec, mean)
    // Diff is [3, 4, 4] -> norm is sqrt(9+16+16) = sqrt(41) ≈ 6.4031
    const norm = Math.sqrt(centered.reduce((a, b) => a + b * b, 0))
    expect(norm).toBeCloseTo(1.0, 4)
  })

  it('should completely nullify projection along dominant singular components', () => {
    // Dominant vector along X axis
    const dominantAxis = [1.0, 0.0, 0.0]
    const sampleVec = [0.8, 0.6, 0.0] // L2 = 1

    const corrected = VectorWhiteningService.removeDominantComponents(sampleVec, [dominantAxis])

    // After removing X axis component, dot product with dominant axis must be exactly 0
    const residualProjection = VectorWhiteningService.dotProduct(corrected, dominantAxis)
    expect(residualProjection).toBeCloseTo(0.0, 5)

    // Result should be purely along Y axis: [0, 1, 0]
    expect(corrected[0]).toBeCloseTo(0.0, 5)
    expect(corrected[1]).toBeCloseTo(1.0, 5)
  })

  it('should slice vectors via Matryoshka representation and preserve unit L2 norm', () => {
    const vec384 = new Array<number>(384).fill(0).map((_, i) => Math.sin(i))
    const norm384 = VectorWhiteningService.normalizeL2(vec384)

    // Slicing to 64 dimensions
    const vec64 = VectorWhiteningService.matryoshkaSlice(norm384, 64)
    expect(vec64.length).toBe(64)

    const norm64 = Math.sqrt(vec64.reduce((a, b) => a + b * b, 0))
    expect(norm64).toBeCloseTo(1.0, 4)

    // Slicing to 128 dimensions
    const vec128 = VectorWhiteningService.matryoshkaSlice(norm384, 128)
    expect(vec128.length).toBe(128)
    const norm128 = Math.sqrt(vec128.reduce((a, b) => a + b * b, 0))
    expect(norm128).toBeCloseTo(1.0, 4)
  })

  it('should diversify search results using MMR and suppress near-duplicate results', () => {
    const query = [0.8, 0.6, 0.0]

    const candidateDocs = [
      { id: 'doc-1', text: 'DSP Studio Calibration', embedding: [1.0, 0.0, 0.0] },
      { id: 'doc-2', text: 'DSP Studio Calibration Copy', embedding: [0.99, 0.01, 0.0] }, // near-duplicate of doc-1
      { id: 'doc-3', text: 'Bitemporal Knowledge Graph', embedding: [0.8, 0.6, 0.0] }, // high query relevance, diverse from doc-1
    ]

    const mmrResults = VectorWhiteningService.rerankMMR(query, candidateDocs, 2, 0.5)

    expect(mmrResults.length).toBe(2)
    expect(mmrResults[0]?.id).toBe('doc-3') // Exact query match selected first
    expect(mmrResults[1]?.id).toBe('doc-1') // Diverse candidate selected second over near-duplicate doc-2
  })
})
