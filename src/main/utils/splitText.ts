/**
 * Split text into pieces of at most `size` characters, breaking between lines.
 * A single line longer than `size` is cut hard. No text is dropped: joining
 * the pieces with newlines gives back the input (apart from hard cuts, which
 * join without a separator).
 */
export function splitIntoParts(text: string, size: number): string[] {
  if (size <= 0) throw new Error('size must be positive')
  const parts: string[] = []
  let current = ''
  for (const line of text.split('\n')) {
    let rest = line
    while (rest.length > size) {
      if (current) {
        parts.push(current)
        current = ''
      }
      parts.push(rest.slice(0, size))
      rest = rest.slice(size)
    }
    if (current && current.length + rest.length + 1 > size) {
      parts.push(current)
      current = rest
    } else {
      current = current ? `${current}\n${rest}` : rest
    }
  }
  if (current) parts.push(current)
  return parts
}
