import { useState, useEffect, useRef, useMemo } from 'react'
import type { LLMToken } from '../../../types/ipc'

/**
 * OPT-22: Accumulates tokens in a ref for O(1) appends instead of
 * copying the entire array on every token via setState (which was O(n²)
 * for long AI responses with 200-500 tokens).
 * React state is updated at a throttled rate via a tick counter.
 */
export function useLLMStream(noteId: string | null) {
  const tokensRef = useRef<LLMToken[]>([])
  const [renderTick, setRenderTick] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    if (!noteId) {
      tokensRef.current = []
      setRenderTick(0)
      setIsGenerating(false)
      return
    }

    tokensRef.current = []
    setRenderTick(0)

    const unsubscribe = window.electronAPI?.on?.llmToken?.((tokenData: LLMToken) => {
      if (tokenData.noteId !== noteId) return

      // O(1) push into ref — no array copy
      tokensRef.current.push(tokenData)

      if (tokenData.isComplete) {
        setIsGenerating(false)
        // Final render with all tokens
        setRenderTick(t => t + 1)
      } else {
        setIsGenerating(true)
        // Batch renders: only trigger re-render every 4 tokens
        if (tokensRef.current.length % 4 === 0) {
          setRenderTick(t => t + 1)
        }
      }
    })

    return () => unsubscribe?.()
  }, [noteId])

  // Read from ref on throttled tick
  const tokens = useMemo(() => [...tokensRef.current], [renderTick]) // eslint-disable-line react-hooks/exhaustive-deps
  const fullText = useMemo(() => tokensRef.current.map(t => t.token).join(''), [renderTick]) // eslint-disable-line react-hooks/exhaustive-deps

  return { tokens, fullText, isGenerating }
}
