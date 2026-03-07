import React, { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import BulletList from '@tiptap/extension-bullet-list'
import Collaboration from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import * as Y from 'yjs'

import { IndexeddbPersistence } from 'y-indexeddb'
import { useNotes } from '../../hooks/queries/useNotes'
import { ModelSpinupIndicator } from '../ui/ModelSpinupIndicator'

interface NoteEditorProps {
  meetingId: string
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ meetingId }) => {
  const { data: notes, createNote, updateNote } = useNotes(meetingId)
  const [providerOrDoc, setProviderOrDoc] = useState<Y.Doc | null>(null)
  const [isAIExpanding, setIsAIExpanding] = useState(false)
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Generate isolated Y doc per meeting ID
    const ydoc = new Y.Doc()
    const provider = new IndexeddbPersistence(`bluearkive-${meetingId}`, ydoc)

    provider.on('synced', () => {
      setProviderOrDoc(ydoc)
    })

    return () => {
      provider.destroy()
      ydoc.destroy()
    }
  }, [meetingId])

  useEffect(() => {
    const handleExpand = async () => {
      if (!providerOrDoc) return
      // We need the editor instance to exist
      const e = document.querySelector('.ProseMirror') as HTMLElement | null
      const currentNoteId = notes?.[0]?.id

      if (!currentNoteId) return // Cannot expand an empty not-yet-saved note right away securely without refactoring

      // Dispatch custom event to let the user know
      // Note expansion triggered
      setIsAIExpanding(true)

      try {
        const res = await window.electronAPI.note.expand({
          noteId: currentNoteId,
          meetingId,
          timestamp: Math.floor(Date.now() / 1000),
          text: e ? e.innerHTML : '', // Tiptap content or fallback
        })
        if (res.success && res.data) {
          const expansionHtml = `
            <div class="ai-expansion mt-4 pl-4 border-l-2 border-[var(--color-violet)] bg-[var(--color-violet)]/10 p-3 rounded-r-lg">
              <strong class="text-[var(--color-violet)] flex items-center gap-2 mb-1">
                <span class="text-lg">✨</span> AI Expansion
              </strong>
              <div class="text-[var(--text-sm)] opacity-90">${res.data.expandedText}</div>
              <div class="mt-2 text-[var(--text-xs)] text-[var(--color-violet)] opacity-70">
                <a href="#anchor" data-source-anchor="true">View Source Context</a>
              </div>
            </div>
            <p></p>
          `

          // To achieve single stroke Ctrl+Z, we dispatch a single transaction
          // Since we are not in the useEditor scope directly here (or we are, but without editor ref)
          // it's easier to handle this inside the NoteEditor component where `editor` is available
          window.dispatchEvent(new CustomEvent('insert-ai-text', { detail: expansionHtml }))
        }
      } catch (err) {
        // Expansion failed silently — user sees no change
      } finally {
        setIsAIExpanding(false)
      }
    }

    window.addEventListener('trigger-ai-expansion', handleExpand)
    return () => window.removeEventListener('trigger-ai-expansion', handleExpand)
  }, [providerOrDoc, notes, meetingId])

  // Use refs for values needed in onUpdate callback — avoids unstable deps in useEditor
  const notesRef = React.useRef(notes)
  const createNoteRef = React.useRef(createNote)
  const updateNoteRef = React.useRef(updateNote)
  React.useEffect(() => {
    notesRef.current = notes
    createNoteRef.current = createNote
    updateNoteRef.current = updateNote
  }, [notes, createNote, updateNote])

  const editor = useEditor(
    {
      immediatelyRender: false, // Required for @tiptap/react v3 — prevents infinite re-render loop
      extensions: [
        StarterKit.configure({
          bulletList: false, // Disabling default to override
        }),
        BulletList,
        Placeholder.configure({
          placeholder: 'Start typing your notes... (Cmd+Enter to expand via AI)',
          emptyNodeClass: 'my-custom-is-empty',
        }),
        ...(providerOrDoc
          ? [
              Collaboration.configure({
                document: providerOrDoc,
              }),
            ]
          : []),
      ],
      content: providerOrDoc ? undefined : '', // Content is managed by Yjs if active
      editable: true,
      editorProps: {
        attributes: {
          class: 'ui-note-editor-content',
        },
        handleKeyDown: (_, event) => {
          // Intercept Command+Enter for AI expansion shell trigger
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            window.dispatchEvent(new CustomEvent('trigger-ai-expansion'))
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor }) => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }

        saveTimeoutRef.current = setTimeout(async () => {
          const text = editor.getHTML()
          // Update dedup ref so periodic save skips duplicate
          lastSavedHtmlRef.current = text
          const currentNotes = notesRef.current
          // Map to central note or create one if none exists
          if (currentNotes && currentNotes.length > 0) {
            updateNoteRef.current.mutate({
              noteId: currentNotes[0]?.id ?? '',
              updates: { original_text: text },
            })
          } else {
            createNoteRef.current.mutate({
              meetingId,
              timestamp: Math.floor(Date.now() / 1000),
              text,
            })
          }
        }, 1500)
      },
    },
    [providerOrDoc, meetingId] // Only stable deps — editor recreated only when doc or meeting changes
  )

  // Keep editorRef in sync for the periodic auto-save timer
  const editorRef = React.useRef<ReturnType<typeof useEditor> | null>(null)
  React.useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // ── Periodic auto-save timer ─────────────────────────────────
  // Separate from the debounced save-on-edit (1500ms).
  // This ensures content is flushed to DB even if the user stops typing,
  // protecting against data loss on crash.
  const lastSavedHtmlRef = React.useRef('')
  useEffect(() => {
    const autoSaveIntervalMs = 30_000 // 30s
    const timer = setInterval(() => {
      const ed = editorRef.current
      if (!ed || ed.isEmpty) return

      const text = ed.getHTML()
      // Skip save if content hasn't changed since last save (prevents race with debounced save)
      if (text === lastSavedHtmlRef.current) return
      lastSavedHtmlRef.current = text

      const currentNotes = notesRef.current
      if (currentNotes && currentNotes.length > 0) {
        updateNoteRef.current.mutate({
          noteId: currentNotes[0]?.id ?? '',
          updates: { original_text: text },
        })
      }
    }, autoSaveIntervalMs)

    return () => clearInterval(timer)
  }, []) // No deps — refs are stable

  useEffect(() => {
    const handleInsert = (e: Event) => {
      const html = (e as CustomEvent).detail
      if (editor) {
        // Wrap in commands.command() for true single-transaction undo
        // insertContent() may split into multiple undo steps in some Tiptap versions
        editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            const node = editor.schema.nodeFromJSON({
              type: 'paragraph',
              content: [{ type: 'text', text: html }],
            })
            tr.insert(editor.state.selection.from, node)
            // Single tr = single Ctrl+Z to undo entire AI expansion
          }
          return true
        })
      }
    }
    window.addEventListener('insert-ai-text', handleInsert)
    return () => window.removeEventListener('insert-ai-text', handleInsert)
  }, [editor])

  if (!editor || !providerOrDoc) {
    return <div className="p-4 text-[var(--color-text-tertiary)]">Initializing Note Editor...</div>
  }

  return (
    <div className="ui-note-editor-panel relative">
      <div className="ui-note-editor-scroll scrollbar-webkit">
        <EditorContent editor={editor} className="h-full" />
      </div>
      {isAIExpanding && (
        <div className="absolute bottom-4 right-6 z-50">
          <ModelSpinupIndicator />
        </div>
      )}
    </div>
  )
}
