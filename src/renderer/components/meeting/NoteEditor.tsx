import React, { useEffect, useState } from 'react'
import { modLabel } from '../../utils/platformShortcut'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import BulletList from '@tiptap/extension-bullet-list'
import Collaboration from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import * as Y from 'yjs'
import { AiExpansionNode } from './extensions/AiExpansionNode'
import { AiVerifiedParagraph } from './extensions/AiVerifiedParagraph'

import { IndexeddbPersistence } from 'y-indexeddb'
import { useNotes } from '../../hooks/queries/useNotes'
import {
  QUICK_NOTE_EVENT,
  escapeHtml,
  takePendingQuickNotes,
  type QuickNoteRequest,
} from '../../utils/quickNotes'

interface NoteEditorProps {
  meetingId: string
}

/** Add each line as its own paragraph at the end of the document. */
function appendParagraphs(editor: Editor, lines: string[]): void {
  for (const line of lines) {
    if (editor.isEmpty) {
      editor.commands.setContent(`<p>${escapeHtml(line)}</p>`)
    } else {
      editor.commands.insertContentAt(editor.state.doc.content.size, {
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })
    }
  }
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
  const { data: notes, isSuccess: notesLoaded, createNote, updateNote } = useNotes(meetingId)
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  // The note row for this meeting, once known. Typing continues while the
  // create call and the list refetch are in flight; without remembering the
  // id (and that a create is pending) each debounce in that window inserted
  // another duplicate note.
  const noteIdRef = React.useRef<string | null>(null)
  const creatingRef = React.useRef(false)
  const notesLoadedRef = React.useRef(false)
  const editorRef = React.useRef<ReturnType<typeof useEditor> | null>(null)
  const lastSavedHtmlRef = React.useRef('')

  // Use refs for values needed in onUpdate callback
  const notesRef = React.useRef(notes)
  const createNoteRef = React.useRef(createNote)
  const updateNoteRef = React.useRef(updateNote)
  React.useEffect(() => {
    notesRef.current = notes
    createNoteRef.current = createNote
    updateNoteRef.current = updateNote
    notesLoadedRef.current = notesLoaded
    if (notes?.[0]?.id) noteIdRef.current = notes[0].id
  }, [notes, notesLoaded, createNote, updateNote])

  React.useEffect(() => {
    noteIdRef.current = null
    creatingRef.current = false
  }, [meetingId])

  /** Persist the editor HTML: update the meeting's note, creating it once. */
  const saveHtml = React.useCallback(
    (html: string) => {
      const noteId = noteIdRef.current ?? notesRef.current?.[0]?.id ?? null
      if (noteId) {
        updateNoteRef.current.mutate({ noteId, updates: { original_text: html } })
        return true
      }
      // Don't create until we know the meeting has no note yet, and never
      // start a second create while one is running.
      if (!notesLoadedRef.current || creatingRef.current) return false
      creatingRef.current = true
      createNoteRef.current.mutate(
        { meetingId, timestamp: Math.floor(Date.now() / 1000), text: html },
        {
          onSuccess: created => {
            if (created?.id) noteIdRef.current = created.id
          },
          onSettled: () => {
            creatingRef.current = false
          },
        }
      )
      return true
    },
    [meetingId]
  )
  const saveHtmlRef = React.useRef(saveHtml)
  React.useEffect(() => {
    saveHtmlRef.current = saveHtml
  }, [saveHtml])

  // Leaving the meeting within the 1.5s debounce used to drop the pending
  // save: the text survived in the local Yjs document, but the saved note
  // (what search, export and the digest read) stayed stale. Issue it now.
  // Declared before useEditor on purpose: unmount cleanups run in declaration
  // order, so this one still sees a live editor.
  React.useEffect(() => {
    return () => {
      if (!saveTimeoutRef.current) return
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      try {
        const ed = editorRef.current
        if (!ed || ed.isDestroyed) return
        const html = ed.getHTML()
        if (html !== lastSavedHtmlRef.current && saveHtmlRef.current(html)) {
          lastSavedHtmlRef.current = html
        }
      } catch {
        // editor already torn down — the autosave on next open covers it
      }
    }
  }, [])

  const parsedContextCache = React.useRef(new WeakMap<HTMLElement, string[]>()).current

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          bulletList: false,
          paragraph: false,
          // Yjs (Collaboration) owns undo/redo. Running StarterKit's own
          // history alongside it corrupts the undo stack.
          undoRedo: false,
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
            noteId: noteIdRef.current ?? notesRef.current?.[0]?.id,
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
            const p = target.closest('.ai-verified-paragraph') as HTMLElement | null
            if (p) {
              let sourceSegments = parsedContextCache.get(p)
              if (!sourceSegments) {
                const context = p.getAttribute('data-source-context')
                if (context && context !== '[]') {
                  try {
                    const parsed = JSON.parse(context)
                    if (Array.isArray(parsed)) {
                      sourceSegments = parsed
                      parsedContextCache.set(p, sourceSegments)
                    }
                  } catch (e) {
                    // ignore
                  }
                }
              }
              if (sourceSegments && sourceSegments.length > 0) {
                window.dispatchEvent(
                  new CustomEvent('highlight-source-segments', {
                    detail: { segments: sourceSegments },
                  })
                )
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

        saveTimeoutRef.current = setTimeout(() => {
          const text = editor.getHTML()
          // Only mark as saved if a save was actually issued; otherwise the
          // 30s autosave below retries it.
          if (saveHtmlRef.current(text)) lastSavedHtmlRef.current = text
        }, 1500)
      },
    },
    [providerOrDoc, meetingId]
  )

  React.useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // The editor's content lives in IndexedDB (Yjs); SQLite holds the saved
  // HTML. If the local document is empty but a saved note exists — browser
  // storage was cleared, the database was restored from a backup, or this is
  // a new install with existing data — load the saved note instead of showing
  // a blank editor whose next keystroke would overwrite it.
  const seededRef = React.useRef(false)
  useEffect(() => {
    seededRef.current = false
  }, [meetingId])
  useEffect(() => {
    if (!editor || !notesLoaded || seededRef.current) return
    seededRef.current = true
    const saved = notes?.[0]?.original_text ?? ''
    const hasSavedText = saved.replace(/<[^>]*>/g, '').trim().length > 0
    if (hasSavedText && editor.isEmpty) {
      lastSavedHtmlRef.current = saved
      editor.commands.setContent(saved)
    }

    // Quick notes typed in the widget while this meeting's editor was closed:
    // they are in the saved note already, but not in this document unless it
    // was just loaded from that note.
    const documentText = editor.getText()
    const missing = takePendingQuickNotes(meetingId).filter(line => !documentText.includes(line))
    if (missing.length > 0) {
      appendParagraphs(editor, missing)
      const html = editor.getHTML()
      if (saveHtmlRef.current(html)) lastSavedHtmlRef.current = html
    }
  }, [editor, notes, notesLoaded, meetingId])

  // Quick notes typed in the widget while this editor is open go straight into
  // the document. Not before the saved note has been loaded: text inserted into
  // a still-empty document would stop that load and the save after it would
  // replace the stored note.
  useEffect(() => {
    if (!editor) return
    const onQuickNote = (event: Event) => {
      const request = (event as CustomEvent<QuickNoteRequest>).detail
      if (!request || request.meetingId !== meetingId) return
      if (!seededRef.current || editor.isDestroyed) return
      appendParagraphs(editor, [request.text])
      const html = editor.getHTML()
      if (saveHtmlRef.current(html)) lastSavedHtmlRef.current = html
      request.handled = true
    }
    window.addEventListener(QUICK_NOTE_EVENT, onQuickNote)
    return () => window.removeEventListener(QUICK_NOTE_EVENT, onQuickNote)
  }, [editor, meetingId])
  useEffect(() => {
    const autoSaveIntervalMs = 30_000
    const timer = setInterval(() => {
      const ed = editorRef.current
      if (!ed) return // Removed ed.isEmpty check to allow saving cleared documents

      const text = ed.getHTML()
      if (text === lastSavedHtmlRef.current) return
      if (saveHtmlRef.current(text)) lastSavedHtmlRef.current = text
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
      const noteId = noteIdRef.current ?? notesRef.current?.[0]?.id
      if (noteId) {
        try {
          window.electronAPI?.note?.update({
            noteId,
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
