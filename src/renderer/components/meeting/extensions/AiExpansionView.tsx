import React, { useEffect, useState, useRef } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { Sparkles, Check, X, Loader2, AlertCircle } from 'lucide-react'

export const AiExpansionView: React.FC<NodeViewProps> = props => {
  const { node, deleteNode, editor, getPos, updateAttributes } = props
  const { sourceText, expandedText, meetingId, noteId } = node.attrs

  const [isGenerating, setIsGenerating] = useState(!expandedText)
  const [hasError, setHasError] = useState(false)
  const hasFetched = useRef(false)

  useEffect(() => {
    // If text already exists (loaded from DB), don't refetch
    if (expandedText || hasFetched.current) {
      if (expandedText) setIsGenerating(false)
      return
    }

    hasFetched.current = true
    let isMounted = true

    const attemptExpand = async () => {
      try {
        setIsGenerating(true)
        setHasError(false)
        const res = await window.electronAPI?.note?.expand({
          noteId: noteId || 'current',
          meetingId: meetingId || 'current',
          timestamp: Math.floor(Date.now() / 1000),
          text: sourceText || '',
        })

        if (isMounted && res?.success && res.data) {
          updateAttributes({
            expandedText: res.data.expandedText,
          })
        } else if (isMounted) {
          setHasError(true)
        }
      } catch (err) {
        console.error('AI Expansion failed:', err)
        if (isMounted) setHasError(true)
      } finally {
        if (isMounted) setIsGenerating(false)
      }
    }

    attemptExpand()
    return () => {
      isMounted = false
    }
  }, [expandedText, sourceText, meetingId, noteId, updateAttributes])

  const handleAccept = () => {
    const pos = getPos()
    if (typeof pos === 'number' && expandedText) {
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .insertContent(expandedText)
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
