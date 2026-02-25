import { useState, useEffect } from 'react'
import type { LLMToken } from '../../../types/ipc'

export function useLLMStream(noteId: string | null) {
  const [tokens, setTokens] = useState<LLMToken[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    if (!noteId) {
      setTokens([])
      setIsGenerating(false)
      return
    }

    setTokens([])
    // We assume it might be generating if a request just started, but we'll wait for the first token.

    const unsubscribe = window.electronAPI.on.llmToken((tokenData: LLMToken) => {
      if (tokenData.noteId !== noteId) return

      setIsGenerating(!tokenData.isComplete)
      setTokens((prev) => [...prev, tokenData])
    })

    return () => unsubscribe()
  }, [noteId])

  const fullText = tokens.map((t) => t.token).join('')

  return { tokens, fullText, isGenerating }
}
