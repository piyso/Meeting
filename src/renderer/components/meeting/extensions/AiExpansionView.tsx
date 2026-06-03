import React, { useEffect, useState, useRef } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { Sparkles, Check, X, Loader2, AlertCircle } from 'lucide-react'
import { rendererLog } from '../../../utils/logger'

const log = rendererLog.create('AiExpansion')

export const AiExpansionView: React.FC<NodeViewProps> = props => {
  const { node, deleteNode, editor, getPos, updateAttributes } = props
  const { sourceText, expandedText, meetingId, noteId, sourceContext } = node.attrs

  const [isGenerating, setIsGenerating] = useState(!expandedText)
  const [hasError, setHasError] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasFetched = useRef(false)

  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    // If text already exists (loaded from DB), don't refetch
    if (expandedText || hasFetched.current) {
      if (expandedText) setIsGenerating(false)
      return
    }

    hasFetched.current = true
    let isMounted = true

    // Show "Taking longer than expected..." after 15s
    const slowTimer = setTimeout(() => {
      if (isMounted) setIsSlow(true)
    }, 15_000)

    // P1-8 FIX: Track timeout ID so we can clear it on unmount.
    // Without this, the 60s reject() fires into void → unhandled rejection.
    let aiTimeoutTimer: ReturnType<typeof setTimeout> | undefined

    const attemptExpand = async () => {
      try {
        setIsGenerating(true)
        setHasError(false)
        setErrorCode(null)
        setErrorMessage(null)
        setIsSlow(false)

        // 60s timeout to prevent infinite spinner on slow hardware
        const AI_TIMEOUT_MS = 60_000
        const expandPromise = window.electronAPI?.note?.expand({
          noteId: noteId || 'current',
          meetingId: meetingId || 'current',
          timestamp: Math.floor(Date.now() / 1000),
          text: sourceText || '',
        })

        const timeoutPromise = new Promise<never>((_, reject) => {
          aiTimeoutTimer = setTimeout(
            () => reject(new Error('AI expansion timed out after 60s')),
            AI_TIMEOUT_MS
          )
        })

        let res: Awaited<typeof expandPromise>
        try {
          res = await Promise.race([expandPromise, timeoutPromise])
        } finally {
          // Always clear timeout after race settles
          if (aiTimeoutTimer) clearTimeout(aiTimeoutTimer)
        }

        if (isMounted && res?.success && res.data) {
          updateAttributes({
            expandedText: res.data.expandedText,
            sourceContext: res.data.sourceSegments ? JSON.stringify(res.data.sourceSegments) : '',
          })
        } else if (isMounted) {
          setHasError(true)
          if (res?.error?.code) setErrorCode(res.error.code)
          if (res?.error?.message) setErrorMessage(res.error.message)
        }
      } catch (err) {
        log.error('AI Expansion failed:', err)
        if (isMounted) {
          setHasError(true)
          setErrorCode(null)
        }
      } finally {
        if (isMounted) setIsGenerating(false)
        clearTimeout(slowTimer)
      }
    }

    attemptExpand()
    return () => {
      isMounted = false
      clearTimeout(slowTimer)
      // P1-8 FIX: Clear timeout promise if component unmounts mid-generation
      if (aiTimeoutTimer) clearTimeout(aiTimeoutTimer)
    }
  }, [expandedText, sourceText, meetingId, noteId, updateAttributes])

  const handleAccept = () => {
    const pos = getPos()
    if (typeof pos === 'number' && expandedText) {
      // Use explicit text node type to prevent LLM output containing
      // angle brackets (e.g. "discussed <Project Alpha>") from being
      // parsed as HTML tags by Tiptap's insertContent.
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .insertContent({
          type: 'paragraph',
          attrs: {
            sourceContext: sourceContext || '',
          },
          content: [{ type: 'text', text: expandedText }],
        })
        .run()
    }
  }

  const handleReject = () => {
    deleteNode()
  }

  const handleRetry = () => {
    hasFetched.current = false
    setHasError(false)
    setErrorCode(null)
    setErrorMessage(null)
    setIsGenerating(true)
    // Clear expandedText to re-trigger the useEffect
    updateAttributes({ expandedText: '', sourceContext: '' })
  }

  const handleHighlightSource = () => {
    if (!sourceContext) return
    try {
      const segments = JSON.parse(sourceContext)
      const event = new CustomEvent('highlight-source-segments', { detail: { segments } })
      window.dispatchEvent(event)
    } catch (e) {
      log.error('Failed to parse sourceContext for highlighting', e)
    }
  }

  const clearHighlight = () => {
    const event = new CustomEvent('highlight-source-segments', { detail: { segments: [] } })
    window.dispatchEvent(event)
  }

  return (
    <NodeViewWrapper className="ui-ai-expansion-widget" contentEditable={false}>
      <h4 className="ui-ai-expansion-header">
        {isGenerating ? (
          <Loader2 size={16} className="ui-ai-spin-icon" />
        ) : hasError ? (
          <AlertCircle
            size={16}
            className={errorCode === 'UNGROUNDED_NOTE' ? 'text-amber-500' : ''}
          />
        ) : (
          <Sparkles size={16} />
        )}
        {hasError
          ? errorCode === 'UNGROUNDED_NOTE'
            ? 'Forensic Guardrail Triggered'
            : 'Expansion Failed'
          : 'AI Expansion'}
      </h4>
      <div className="ui-ai-expansion-body">
        {expandedText ? (
          <p>{expandedText}</p>
        ) : hasError ? (
          <p className="ui-ai-expansion-error-text">
            {errorCode === 'UNGROUNDED_NOTE'
              ? errorMessage ||
                'Cannot correlate this note with the surrounding transcript. Expansion aborted to preserve forensic integrity.'
              : 'Could not generate expansion. Check your connection or try again.'}
          </p>
        ) : (
          <div className="ui-ai-shimmer-container">
            <div className="ui-ai-shimmer-bar" style={{ width: '100%' }} />
            <div className="ui-ai-shimmer-bar" style={{ width: '83%' }} />
            <div className="ui-ai-shimmer-bar" style={{ width: '66%' }} />
            {isSlow && (
              <p className="ui-ai-expansion-slow-hint">
                Taking longer than expected — AI engine may still be loading...
              </p>
            )}
          </div>
        )}
      </div>

      {!isGenerating && expandedText && (
        <div className="ui-ai-expansion-actions flex justify-between items-center w-full">
          {sourceContext && sourceContext !== '[]' && (
            <button
              type="button"
              className="ui-ai-expansion-btn text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              onMouseEnter={handleHighlightSource}
              onMouseLeave={clearHighlight}
              onClick={handleHighlightSource}
            >
              <Sparkles size={12} className="mr-1 inline" /> View Source Context
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              className="ui-ai-expansion-btn ui-ai-expansion-btn-accept"
              onClick={handleAccept}
            >
              <Check size={12} /> Accept
            </button>
            <button
              type="button"
              className="ui-ai-expansion-btn ui-ai-expansion-btn-reject"
              onClick={handleReject}
            >
              <X size={12} /> Reject
            </button>
          </div>
        </div>
      )}

      {!isGenerating && hasError && (
        <div className="ui-ai-expansion-actions">
          {/* Hide Retry for UNGROUNDED_NOTE — re-requesting gibberish will always fail */}
          {errorCode !== 'UNGROUNDED_NOTE' && (
            <button
              type="button"
              className="ui-ai-expansion-btn ui-ai-expansion-btn-accept"
              onClick={handleRetry}
            >
              <Loader2 size={12} /> Retry
            </button>
          )}
          <button
            type="button"
            className="ui-ai-expansion-btn ui-ai-expansion-btn-reject"
            onClick={handleReject}
          >
            <X size={12} /> Dismiss
          </button>
        </div>
      )}
    </NodeViewWrapper>
  )
}
