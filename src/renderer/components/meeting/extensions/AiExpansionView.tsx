import React, { useEffect, useState, useRef } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { Sparkles, Check, X, Loader2, AlertCircle } from 'lucide-react'
import { rendererLog } from '../../../utils/logger'

const log = rendererLog.create('AiExpansion')

export const AiExpansionView: React.FC<NodeViewProps> = props => {
  const { node, deleteNode, editor, getPos, updateAttributes } = props
  const { sourceText, expandedText, meetingId, noteId } = node.attrs

  const [isGenerating, setIsGenerating] = useState(!expandedText)
  const [hasError, setHasError] = useState(false)
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

    const attemptExpand = async () => {
      try {
        setIsGenerating(true)
        setHasError(false)
        setIsSlow(false)

        // 60s timeout to prevent infinite spinner on slow hardware
        const AI_TIMEOUT_MS = 60_000
        const expandPromise = window.electronAPI?.note?.expand({
          noteId: noteId || 'current',
          meetingId: meetingId || 'current',
          timestamp: Math.floor(Date.now() / 1000),
          text: sourceText || '',
        })

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI expansion timed out after 60s')), AI_TIMEOUT_MS)
        )

        const res = await Promise.race([expandPromise, timeoutPromise])

        if (isMounted && res?.success && res.data) {
          updateAttributes({
            expandedText: res.data.expandedText,
          })
        } else if (isMounted) {
          setHasError(true)
        }
      } catch (err) {
        log.error('AI Expansion failed:', err)
        if (isMounted) setHasError(true)
      } finally {
        if (isMounted) setIsGenerating(false)
        clearTimeout(slowTimer)
      }
    }

    attemptExpand()
    return () => {
      isMounted = false
      clearTimeout(slowTimer)
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
    setIsGenerating(true)
    // Clear expandedText to re-trigger the useEffect
    updateAttributes({ expandedText: '' })
  }

  return (
    <NodeViewWrapper className="ui-ai-expansion-widget" contentEditable={false}>
      <h4 className="ui-ai-expansion-header">
        {isGenerating ? (
          <Loader2 size={16} className="ui-ai-spin-icon" />
        ) : hasError ? (
          <AlertCircle size={16} />
        ) : (
          <Sparkles size={16} />
        )}
        {hasError ? 'Expansion Failed' : 'AI Expansion'}
      </h4>
      <div className="ui-ai-expansion-body">
        {expandedText ? (
          <p>{expandedText}</p>
        ) : hasError ? (
          <p className="ui-ai-expansion-error-text">
            Could not generate expansion. Check your connection or try again.
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
        <div className="ui-ai-expansion-actions">
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
      )}

      {!isGenerating && hasError && (
        <div className="ui-ai-expansion-actions">
          <button
            type="button"
            className="ui-ai-expansion-btn ui-ai-expansion-btn-accept"
            onClick={handleRetry}
          >
            <Loader2 size={12} /> Retry
          </button>
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
