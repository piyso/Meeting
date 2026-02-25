import React, { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import BulletList from '@tiptap/extension-bullet-list'
import Collaboration from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import * as Y from 'yjs'

import { IndexeddbPersistence } from 'y-indexeddb'
import { useNotes } from '../../hooks/queries/useNotes'

interface NoteEditorProps {
  meetingId: string
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ meetingId }) => {
  const { data: notes, createNote, updateNote } = useNotes(meetingId)
  const [providerOrDoc, setProviderOrDoc] = useState<Y.Doc | null>(null)
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Generate isolated Y doc per meeting ID
    const ydoc = new Y.Doc()
    const provider = new IndexeddbPersistence(`piyapi-notes-${meetingId}`, ydoc)
    
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
      const e = document.querySelector('.ProseMirror') as any
      const currentNoteId = notes?.[0]?.id

      if (!currentNoteId) return // Cannot expand an empty not-yet-saved note right away securely without refactoring
      
      // Dispatch custom event to let the user know
      console.log('Expanding note...', currentNoteId)
      
      try {
        const res = await window.electronAPI.note.expand({ 
          noteId: currentNoteId,
          meetingId,
          timestamp: Math.floor(Date.now() / 1000),
          text: e ? e.innerHTML : '' // Tiptap content or fallback
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
        console.error('Failed to expand:', err)
      }
    }

    window.addEventListener('trigger-ai-expansion', handleExpand)
    return () => window.removeEventListener('trigger-ai-expansion', handleExpand)
  }, [providerOrDoc, notes])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false, // Disabling default to override
      }),
      BulletList,
      Placeholder.configure({
        placeholder: 'Start typing your notes... (Cmd+Enter to expand via AI)',
        emptyNodeClass: 'my-custom-is-empty',
      }),
      ...(providerOrDoc ? [
        Collaboration.configure({
          document: providerOrDoc,
        }),
      ] : []),
    ],
    content: providerOrDoc ? undefined : '', // Content is managed by Yjs if active
    editable: true,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-200px)] px-[var(--space-16)] py-[var(--space-24)]',
      },
      handleKeyDown: (_, event) => {
        // Intercept Command+Enter for AI expansion shell trigger
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          window.dispatchEvent(new CustomEvent('trigger-ai-expansion'))
          return true
        }
        return false
      }
    },
    onUpdate: ({ editor }) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      saveTimeoutRef.current = setTimeout(async () => {
        const text = editor.getHTML()
        // Map to central note or create one if none exists
        if (notes && notes.length > 0) {
          updateNote.mutate({ 
            noteId: notes[0]!.id, 
            updates: { original_text: text } 
          })
        } else {
          createNote.mutate({ 
            meetingId, 
            timestamp: Math.floor(Date.now() / 1000), 
            text 
          })
        }
      }, 1500)
    }
  }, [providerOrDoc, meetingId, notes, createNote, updateNote])

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
    <div className="h-full w-full overflow-y-auto scrollbar-webkit">
      <EditorContent editor={editor} className="h-full" />
    </div>
  )
}
