import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { AiExpansionView } from './AiExpansionView'

export interface AiExpansionOptions {
  HTMLAttributes: Record<string, unknown>
  getMeetingContext: () => { meetingId?: string; noteId?: string }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiExpansion: {
      /**
       * Insert an AI Expansion node
       */
      insertAiExpansion: (options: {
        expandedText?: string
        sourceText?: string
        meetingId?: string
        noteId?: string
      }) => ReturnType
    }
  }
}

export const AiExpansionNode = Node.create<AiExpansionOptions>({
  name: 'aiExpansion',

  group: 'block',

  // Atomic: the node is treated as a single unit — cursor can't enter it.
  // Content is managed entirely by the React NodeView.
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      getMeetingContext: () => ({}),
    }
  },

  addAttributes() {
    return {
      expandedText: {
        default: '',
        parseHTML: element => element.getAttribute('data-expanded-text'),
        renderHTML: attributes => {
          return {
            'data-expanded-text': attributes.expandedText,
          }
        },
      },
      sourceText: {
        default: '',
        parseHTML: element => element.getAttribute('data-source-text'),
        renderHTML: attributes => {
          return {
            'data-source-text': attributes.sourceText,
          }
        },
      },
      meetingId: {
        default: '',
      },
      noteId: {
        default: '',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'blockquote[data-type="ai-expansion"]',
        getAttrs: element => {
          const el = element as HTMLElement
          return {
            expandedText: el.getAttribute('data-expanded-text') || el.textContent || '',
            sourceText: el.getAttribute('data-source-text') || '',
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    // BUG FIX: atom nodes can't use `0` (content hole).
    // We must render the expandedText directly as text content inside the blockquote.
    // This ensures getHTML() produces: <blockquote data-type="ai-expansion">actual text here</blockquote>
    // which converts cleanly to Markdown: > actual text here
    const text = (node.attrs.expandedText as string) || ''
    return [
      'blockquote',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'ai-expansion',
        'data-source-text': node.attrs.sourceText || '',
        'data-expanded-text': text,
        class: 'ai-expansion-export',
      }),
      text,
    ]
  },

  addCommands() {
    return {
      insertAiExpansion:
        (options: {
          expandedText?: string
          sourceText?: string
          meetingId?: string
          noteId?: string
        }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          })
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        const { state } = this.editor
        const { selection } = state

        // Extract exact text of the current block
        const { $from } = selection
        const blockNode = $from.node($from.depth)
        const sourceText = blockNode.textContent.trim()

        if (!sourceText) return false

        const context = this.options.getMeetingContext()

        // BUG FIX: Use `tr.insert` at the END of the current block
        // instead of `insertContent` at cursor, which would destroy
        // any selected text. We compute the position right after the
        // current top-level block and insert there.
        const resolvedPos = state.doc.resolve($from.pos)
        // Walk up to the top-level block (depth 1)
        const blockEnd = resolvedPos.end(1)

        const { tr } = state
        const aiNodeType = state.schema.nodes.aiExpansion
        const paragraphType = state.schema.nodes.paragraph
        if (!aiNodeType || !paragraphType) return false

        const aiNode = aiNodeType.create({
          sourceText,
          meetingId: context.meetingId,
          noteId: context.noteId,
        })
        const emptyParagraph = paragraphType.create()

        // Insert after the current block: AI node + new paragraph for cursor
        tr.insert(blockEnd + 1, aiNode)
        tr.insert(blockEnd + 1 + aiNode.nodeSize, emptyParagraph)

        this.editor.view.dispatch(tr)
        return true
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(AiExpansionView)
  },
})
