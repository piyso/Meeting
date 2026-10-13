/**
 * Notes are stored as the editor's HTML. Wherever their words matter rather
 * than their markup — search excerpts, Markdown and PDF export — this turns
 * one back into the text a person typed.
 *
 * It is not a sanitiser: the result is text, to be shown or escaped as text.
 */
export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Lower-case, without accents — how the search index compares words. */
export function foldForSearch(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** The words of a search query, folded; operators and quotes dropped. */
export function searchTerms(query: string): string[] {
  return foldForSearch(query)
    .replace(/["*(){}[\]^~\\|:]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length > 0)
}

/**
 * A stretch of `text` around the first place one of `terms` starts a word,
 * or null when none of them does.
 */
export function excerptAround(text: string, terms: string[], radius = 90): string | null {
  const folded = foldForSearch(text)
  // Folding can change length (ligatures, combining marks); excerpt positions
  // then would not line up with the original, so fall back to the folded text.
  const source = folded.length === text.length ? text : folded

  let at = -1
  for (const term of terms) {
    let from = 0
    for (;;) {
      const found = folded.indexOf(term, from)
      if (found < 0) break
      const before = found === 0 ? '' : (folded[found - 1] ?? '')
      if (!/[\p{L}\p{N}]/u.test(before)) {
        if (at < 0 || found < at) at = found
        break
      }
      from = found + 1
    }
  }
  if (at < 0) return null

  let start = Math.max(0, at - radius)
  let end = Math.min(source.length, at + radius)
  // Do not cut words in half where there is a space nearby to cut at.
  if (start > 0) {
    const space = source.indexOf(' ', start)
    if (space >= 0 && space < at) start = space + 1
  }
  if (end < source.length) {
    const space = source.lastIndexOf(' ', end)
    if (space > at) end = space
  }
  const body = source.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${body}${end < source.length ? '…' : ''}`
}

/** Whether every term starts some word of `text`. */
export function containsAllTerms(text: string, terms: string[]): boolean {
  return terms.every(term => excerptAround(text, [term], 0) !== null)
}
