import React, { useEffect, useState } from 'react'
import { modLabel } from '../../utils/platformShortcut'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import BulletList from '@tiptap/extension-bullet-list'
import Collaboration from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import * as Y from 'yjs'
import { AiExpansionNode } from './extensions/AiExpansionNode'
import { AiVerifiedParagraph } from './extensions/AiVerifiedParagraph'

import { IndexeddbPersistence } from 'y-indexeddb'
import { useNotes } from '../../hooks/queries/useNotes'

interface NoteEditorProps {
  meetingId: string
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ meetingId }) => {
  const [providerOrDoc, setProviderOrDoc] = useState<Y.Doc | null>(null)

  useEffect(() => {
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

  if (!providerOrDoc) {
    return <div className="p-4 text-[var(--color-text-tertiary)]">Initializing Note Editor...</div>
  }

  return <NoteEditorInner meetingId={meetingId} providerOrDoc={providerOrDoc} />
}

interface NoteEditorInnerProps {
  meetingId: string
  providerOrDoc: Y.Doc
}

const NoteEditorInner: React.FC<NoteEditorInnerProps> = ({ meetingId, providerOrDoc }) => {
  const { data: notes, createNote, updateNote } = useNotes(meetingId)
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  // Cleanup debounced save on unmount
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  // Use refs for values needed in onUpdate callback
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
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          bulletList: false,
          paragraph: false,
        }),
        AiVerifiedParagraph,
        BulletList,
        Placeholder.configure({
          placeholder: `Start typing your notes... (${modLabel}+Enter to expand via AI)`,
          emptyNodeClass: 'my-custom-is-empty',
        }),
        AiExpansionNode.configure({
          getMeetingContext: () => ({
            meetingId,
            noteId: notesRef.current?.[0]?.id,
          }),
        }),
        Collaboration.configure({
          document: providerOrDoc,
        }),
      ],
      // Content is managed by Yjs
      editable: true,
      editorProps: {
        attributes: {
          class: 'ui-note-editor-content sovereign-scrollbar',
        },
        handleDOMEvents: {
          mouseover: (_view, event) => {
            const target = event.target as HTMLElement
            const p = target.closest('.ai-verified-paragraph')
            if (p) {
              const context = p.getAttribute('data-source-context')
              if (context && context !== '[]') {
                try {
                  const sourceSegments = JSON.parse(context)
                  window.dispatchEvent(
                    new CustomEvent('highlight-source-segments', {
                      detail: { segments: sourceSegments },
                    })
                  )
                } catch (e) {
                  // ignore
                }
              }
            }
            return false
          },
          mouseout: (_view, event) => {
            const target = event.target as HTMLElement
            if (
              target.classList.contains('ai-verified-paragraph') ||
              target.closest('.ai-verified-paragraph')
            ) {
              window.dispatchEvent(
                new CustomEvent('highlight-source-segments', {
                  detail: { segments: [] },
                })
              )
            }
            return false
          },
        },
      },
      onUpdate: ({ editor }) => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }

        saveTimeoutRef.current = setTimeout(async () => {
          const text = editor.getHTML()
          lastSavedHtmlRef.current = text
          const currentNotes = notesRef.current
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
    [providerOrDoc, meetingId]
  )

  const editorRef = React.useRef<ReturnType<typeof useEditor> | null>(null)
  React.useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const lastSavedHtmlRef = React.useRef('')
  useEffect(() => {
    const autoSaveIntervalMs = 30_000
    const timer = setInterval(() => {
      const ed = editorRef.current
      if (!ed) return // Removed ed.isEmpty check to allow saving cleared documents

      const text = ed.getHTML()
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

    const handleBeforeUnload = () => {
      const ed = editorRef.current
      if (!ed) return // Removed ed.isEmpty check
      const text = ed.getHTML()
      if (text === lastSavedHtmlRef.current) return
      lastSavedHtmlRef.current = text
      try {
        localStorage.setItem(`note-draft-${meetingId}`, text)
      } catch {
        // full
      }
      const cn = notesRef.current
      if (cn?.length) {
        try {
          window.electronAPI?.note?.update({
            noteId: cn[0]?.id ?? '',
            updates: { original_text: text },
          })
        } catch {
          // best-effort
        }
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    try {
      const draft = localStorage.getItem(`note-draft-${meetingId}`)
      if (draft) {
        localStorage.removeItem(`note-draft-${meetingId}`)
      }
    } catch {
      // unavailable
    }

    return () => {
      clearInterval(timer)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [meetingId])

  if (!editor) {
    return <div className="p-4 text-[var(--color-text-tertiary)]">Initializing Note Editor...</div>
  }

  return (
    <div className="ui-note-editor-panel relative">
      <div className="ui-note-editor-scroll sovereign-scrollbar">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}
