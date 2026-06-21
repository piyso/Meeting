import Paragraph from '@tiptap/extension-paragraph'

export const AiVerifiedParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      sourceContext: {
        default: null,
        parseHTML: element => element.getAttribute('data-source-context'),
        renderHTML: attributes => {
          if (!attributes.sourceContext) {
            return {}
          }
          return {
            'data-source-context': attributes.sourceContext,
            class: 'ai-verified-paragraph',
          }
        },
      },
    }
  },
})
