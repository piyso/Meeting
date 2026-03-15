/**
 * Ask Your Meetings — Conversational AI Chat View
 *
 * Uses the dedicated intelligence:askMeetings IPC handler with real-time
 * token streaming for a ChatGPT-like typewriter experience.
 * Search: semantic search for retrieval → LLM RAG for answering.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { ChevronLeft, Send, Trash2 } from 'lucide-react'
import { IconButton } from '../components/ui/IconButton'
import { AISourceBadge } from '../components/ui/AISourceBadge'
import { ProTeaseOverlay } from '../components/ui/ProTeaseOverlay'
import type { SemanticSearchResult } from '../../types/ipc'
import './ask-meetings.css'

// ─── Types ───────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  sources?: Array<{
    meetingId: string
    meetingTitle: string
    snippet: string
    relevance: number
  }>
  isStreaming?: boolean
}

function MarkdownText({ content }: { content: string }) {
  if (!content) return null

  const blocks: React.ReactNode[] = []
  let inCodeBlock = false
  let codeContent = ''
  let listItems: React.ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      if (listType === 'ol') {
        blocks.push(
          <ol key={key} className="ask-msg-list">
            {listItems}
          </ol>
        )
      } else {
        blocks.push(
          <ul key={key} className="ask-msg-list">
            {listItems}
          </ul>
        )
      }
      listItems = []
      listType = null
    }
  }

  const formatInline = (text: string): React.ReactNode[] => {
    // Handle bold, italic, inline code, and links
    return text
      .split(/((?:\*\*.*?\*\*)|(?:\*[^*]+?\*)|(?:`[^`]+?`)|(?:\[.*?\]\(.*?\)))/g)
      .map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={idx}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
          return <em key={idx}>{part.slice(1, -1)}</em>
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={idx} className="ask-msg-inline-code">
              {part.slice(1, -1)}
            </code>
          )
        }
        const linkMatch = part.match(/^\[(.+?)\]\((.+?)\)$/)
        if (linkMatch) {
          return (
            <a
              key={idx}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="ask-msg-link"
            >
              {linkMatch[1]}
            </a>
          )
        }
        return part
      })
  }

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    if (line.startsWith('```')) {
      flushList(`list-pre-code-${i}`)
      if (inCodeBlock) {
        blocks.push(
          <pre key={i} className="code-block">
            <code>{codeContent.trim()}</code>
          </pre>
        )
        inCodeBlock = false
        codeContent = ''
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeContent += line + '\n'
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/)
    if (headingMatch) {
      flushList(`list-pre-h-${i}`)
      const level = (headingMatch[1] ?? '#').length
      const Tag = `h${level}` as keyof JSX.IntrinsicElements
      blocks.push(
        <Tag key={i} className="ask-msg-heading">
          {formatInline(headingMatch[2] ?? '')}
        </Tag>
      )
      continue
    }

    // Blockquotes
    if (line.trim().startsWith('>')) {
      flushList(`list-pre-bq-${i}`)
      blocks.push(<blockquote key={i}>{formatInline(line.replace(/^>\s?/, ''))}</blockquote>)
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.+)/)
    if (ulMatch) {
      if (listType !== 'ul') flushList(`list-switch-${i}`)
      listType = 'ul'
      listItems.push(<li key={i}>{formatInline(ulMatch[1] ?? '')}</li>)
      continue
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)/)
    if (olMatch) {
      if (listType !== 'ol') flushList(`list-switch-${i}`)
      listType = 'ol'
      listItems.push(<li key={i}>{formatInline(olMatch[1] ?? '')}</li>)
      continue
    }

    // Regular text — flush any pending list
    flushList(`list-pre-text-${i}`)
    blocks.push(
      <div key={i} style={{ minHeight: line.trim() === '' ? '1.5em' : 'auto' }}>
        {formatInline(line)}
      </div>
    )
  }

  flushList('list-final')

  if (inCodeBlock) {
    blocks.push(
      <pre key="unclosed" className="code-block">
        <code>{codeContent.trim()}</code>
      </pre>
    )
  }

  return <div className="ask-msg-text">{blocks}</div>
}

// ─── Component ───────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'bluearkive:ask-meetings-history'

const loadHistory = (userId: string): ChatMessage[] => {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}:${userId}`)
    if (stored) return JSON.parse(stored)
  } catch (e) {
    // ignore
  }
  return []
}

export default function AskMeetingsView() {
  const navigate = useAppStore(s => s.navigate)
  const currentTier = useAppStore(s => s.currentTier)
  const [userId, setUserId] = useState<string>('default')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // On mount, load user and their history
  useEffect(() => {
    let mounted = true
    window.electronAPI?.auth
      ?.getCurrentUser?.()
      .then(res => {
        if (!mounted) return
        let uid = 'default'
        if (res?.success && res.data?.email) {
          uid = res.data.email
        }
        setUserId(uid)
        setMessages(loadHistory(uid))
        setIsLoaded(true)
      })
      .catch(() => {
        if (mounted) {
          setMessages(loadHistory('default'))
          setIsLoaded(true)
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  // Persist history
  useEffect(() => {
    if (!isLoaded) return
    // Bug #9 fix: cap at 50 messages to avoid exceeding localStorage 5MB limit
    const cappedMessages = messages.filter(m => !m.isStreaming).slice(-50)
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}:${userId}`, JSON.stringify(cappedMessages))
    } catch {
      // QuotaExceededError — silently fail, non-critical
    }
  }, [messages, userId, isLoaded])

  const handleClearHistory = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      // Auto-dismiss after 3 seconds if user doesn't confirm
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setMessages([])
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}:${userId}`)
    setConfirmClear(false)
  }

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Listen for real-time token streaming from the main process
  useEffect(() => {
    const streamListener = window.electronAPI?.on?.['intelligence:streamToken']
    if (!streamListener) return

    const cleanup = streamListener((data: { token: string; fullText: string }) => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.isStreaming) {
          return prev.map((msg, i) =>
            i === prev.length - 1 ? { ...msg, content: data.fullText } : msg
          )
        }
        return prev
      })
    })

    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  const handleSubmit = useCallback(
    async (e?: React.FormEvent | string) => {
      let query = input.trim()
      if (typeof e === 'string') {
        query = e
      } else if (e && 'preventDefault' in e) {
        e.preventDefault()
      }
      if (!query || isLoading) return

      // Add user message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: query,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setIsLoading(true)

      // Add streaming placeholder
      const assistantId = `assistant-${Date.now()}`
      setMessages(prev => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        },
      ])

      try {
        // Step 1: Semantic search across all transcripts for context
        const searchResult = await window.electronAPI?.search?.semantic({
          query,
          limit: 5,
        })

        let sources: ChatMessage['sources'] = []
        let contextText = ''

        // searchResult.data may be { results: [...], query } (object) or SemanticSearchResult[] (array)
        const rawData = searchResult.data as unknown
        const searchResults: SemanticSearchResult[] = Array.isArray(rawData)
          ? rawData
          : (rawData as { results?: SemanticSearchResult[] })?.results || []

        if (searchResult.success && searchResults.length > 0) {
          sources = searchResults.map((r: SemanticSearchResult) => ({
            meetingId: r.meeting?.id || '',
            meetingTitle: r.meeting?.title || 'Untitled Meeting',
            snippet: r.snippet,
            relevance: r.relevance,
          }))

          // Build context from top results for LLM
          contextText = searchResults
            .map(
              (r: SemanticSearchResult, i: number) =>
                `[Source ${i + 1}: ${r.meeting?.title || 'Meeting'}]\n${r.snippet}`
            )
            .join('\n\n')
        }

        // Step 2: Use dedicated askMeetings handler with streaming
        const intelligenceResult = await window.electronAPI?.intelligence?.askMeetings({
          question: query,
          context: contextText,
        })

        // Final answer (streaming would have already updated content in real-time)
        const answer =
          intelligenceResult.success && intelligenceResult.data
            ? intelligenceResult.data.answer
            : 'I could not process your question. Make sure the AI engine is loaded.'

        // Update the streaming message with the final answer + sources
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantId ? { ...msg, content: answer, sources, isStreaming: false } : msg
          )
        )
      } catch (error) {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: `Error: ${(error as Error).message || 'Failed to process your question.'}`,
                  isStreaming: false,
                }
              : msg
          )
        )
      } finally {
        setIsLoading(false)
      }
    },
    [input, isLoading]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // ── Full-page lock for free/starter users ──
  const isAiLocked = currentTier === 'free' || currentTier === 'starter'
  if (isAiLocked) {
    return (
      <div className="ask-meetings-view" id="ask-meetings-view">
        <header className="ui-header">
          <IconButton
            icon={<ChevronLeft size={18} />}
            onClick={() => navigate('meeting-list')}
            className="mr-2"
            tooltip="Back to Meetings"
          />
          <div className="ui-header-title">
            <h1>Ask Your Meetings</h1>
            <span className="ui-header-subtitle">
              AI-powered search across all your transcripts
            </span>
          </div>
        </header>
        <div style={{ flex: 1, position: 'relative' }}>
          <ProTeaseOverlay
            title="Unlock Ask Your Meetings"
            description={
              currentTier === 'starter'
                ? 'AI conversational search is a Pro feature.'
                : 'Upgrade to search across all your meeting transcripts with AI.'
            }
            targetTier="pro"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="ask-meetings-view" id="ask-meetings-view">
      {/* Header */}
      <header className="ui-header">
        <IconButton
          icon={<ChevronLeft size={18} />}
          onClick={() => navigate('meeting-list')}
          className="mr-2"
          tooltip="Back to Meetings"
        />
        <div className="ui-header-title">
          <h1>Ask Your Meetings</h1>
          <span className="ui-header-subtitle">AI-powered search across all your transcripts</span>
        </div>
        <div className="ml-auto">
          <IconButton
            icon={<Trash2 size={16} />}
            onClick={handleClearHistory}
            tooltip={confirmClear ? 'Click again to confirm' : 'Clear Chat Context'}
            className={
              confirmClear
                ? 'text-[var(--color-rose)] animate-pulse transition-colors'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-rose)] transition-colors'
            }
          />
        </div>
      </header>

      {/* Messages List */}
      <div className="ask-meetings-messages" id="ask-meetings-messages">
        {messages.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center"
            style={{ padding: '0 20px', animation: 'fadeInUp 0.6s ease-out forwards' }}
          >
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-violet)]/10 text-[var(--color-violet)] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(139,92,246,0.15)] ring-1 ring-[var(--color-violet)]/20">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-title)] mb-3 tracking-tight">
              Ask Your Meetings
            </h2>
            <p className="text-[var(--text-md)] text-[var(--color-text-muted)] mb-8 max-w-md leading-relaxed">
              I index every transcript, decision, and note directly on your device. Ask me anything
              to instantly synthesize context.
            </p>
            <div className="grid grid-cols-1 gap-3 w-full max-w-md">
              <button
                onClick={() => handleSubmit('What were my key decisions this week?')}
                className="text-left px-5 py-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] transition-all duration-200 text-[var(--text-sm)] text-[var(--color-text)] shadow-sm hover:shadow active:scale-[0.98] flex items-center"
              >
                <span className="text-[var(--color-violet)] mr-3 opacity-80">✦</span> What were my
                key decisions this week?
              </button>
              <button
                onClick={() => handleSubmit('Summarize action items assigned to me')}
                className="text-left px-5 py-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] transition-all duration-200 text-[var(--text-sm)] text-[var(--color-text)] shadow-sm hover:shadow active:scale-[0.98] flex items-center"
              >
                <span className="text-[var(--color-violet)] mr-3 opacity-80">✦</span> Summarize
                action items assigned to me
              </button>
              <button
                onClick={() => handleSubmit('When did we last discuss the Q3 roadmap?')}
                className="text-left px-5 py-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] transition-all duration-200 text-[var(--text-sm)] text-[var(--color-text)] shadow-sm hover:shadow active:scale-[0.98] flex items-center"
              >
                <span className="text-[var(--color-violet)] mr-3 opacity-80">✦</span> When did we
                last discuss the Q3 roadmap?
              </button>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`ask-msg ask-msg--${msg.role}`}>
              <div
                className="ask-msg-bubble relative"
                style={{ marginTop: msg.role === 'assistant' ? '12px' : 0 }}
              >
                {msg.role === 'assistant' && (
                  <div className="absolute -top-3 left-4" style={{ transform: 'translateY(-50%)' }}>
                    <AISourceBadge
                      source={((msg as { source?: string }).source as 'edge' | 'cloud') || 'edge'}
                    />
                  </div>
                )}
                {msg.isStreaming && !msg.content ? (
                  <div className="ask-msg-streaming">
                    <span className="ask-msg-dot" />
                    <span className="ask-msg-dot" />
                    <span className="ask-msg-dot" />
                  </div>
                ) : (
                  <MarkdownText content={msg.content} />
                )}
              </div>

              {/* Source citations */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="ask-sources">
                  <span className="ask-sources-label">Sources:</span>
                  {msg.sources.map((src, i) => (
                    <button
                      key={i}
                      className="ask-source-chip"
                      onClick={() => {
                        if (src.meetingId) {
                          navigate('meeting-detail', src.meetingId)
                        }
                      }}
                    >
                      📄 {src.meetingTitle} ({Math.round(Math.min(src.relevance, 1) * 100)}%)
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area Dock */}
      <div className="ui-ask-input-dock">
        <form className="ask-meetings-input" onSubmit={handleSubmit} id="ask-meetings-input-form">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your meetings..."
            rows={1}
            className="ask-meetings-textarea"
            disabled={isLoading}
            id="ask-meetings-textarea"
          />
          <IconButton
            icon={
              isLoading ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-spin"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 2a10 10 0 0 1 10 10"></path>
                </svg>
              ) : (
                <Send size={18} />
              )
            }
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isLoading}
            className="ask-meetings-send"
            tooltip="Send Message"
          />
        </form>
      </div>
    </div>
  )
}
