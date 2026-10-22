// Formula boundary detection.
//
// Given a text payload from an SVG `<text>` element, these helpers
// recognise the LaTeX-style delimiters that mark formula regions:
//
//   - `$$…$$` and `\[…\]` → block-level formula
//   - `$…$` and `\(…\)`   → inline formula
//   - literal `<math>…</math>` → pass-through MathML
//
// `extractInlineFormulaSegments` further splits a mixed text into
// alternating text/formula pieces and applies a small heuristic
// that re-attaches a leading `^` / `_` to the preceding identifier
// (so `x^2` parses as one formula instead of two).

import type { FormulaSource, InlineFormulaSegment } from './types'

export function extractFormulaSource(input: string): FormulaSource | null {
  const trimmed = input.trim()

  if (!trimmed) return null

  if (/^<math[\s>]/i.test(trimmed) && /<\/math>$/i.test(trimmed)) {
    return { format: 'mathml', source: trimmed }
  }

  const patterns = [
    /^\$\$([\s\S]+)\$\$$/,
    /^\\\[([\s\S]+)\\\]$/,
    /^\$([\s\S]+)\$$/,
    /^\\\(([\s\S]+)\\\)$/
  ]

  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match) {
      return { format: 'latex', source: match[1].trim() }
    }
  }

  return null
}

export function extractInlineFormulaSegments(input: string): InlineFormulaSegment[] | null {
  const segments: InlineFormulaSegment[] = []
  const pattern = /(\\\(([\s\S]+?)\\\)|\$([^\$\n]+?)\$)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(input)) !== null) {
    const start = match.index
    const end = pattern.lastIndex

    if (start > lastIndex) {
      segments.push({
        type: 'text',
        source: input.slice(lastIndex, start),
        displayText: input.slice(lastIndex, start)
      })
    }

    const source = (match[2] ?? match[3] ?? '').trim()
    if (source) {
      segments.push({
        type: 'formula',
        source,
        displayText: source
      })
    }

    lastIndex = end
  }

  if (lastIndex < input.length) {
    segments.push({
      type: 'text',
      source: input.slice(lastIndex),
      displayText: input.slice(lastIndex)
    })
  }

  if (!segments.some(segment => segment.type === 'formula') || segments.length < 2) {
    return null
  }

  // Heuristic: a leading `^` / `_` in a formula segment is
  // almost certainly a script attached to the preceding identifier
  // (e.g. `x^2`). Move that one character into the formula and
  // leave the rest in the text segment.
  for (let i = 0; i < segments.length; i++) {
    const current = segments[i]
    if (current.type !== 'formula') continue
    if (!/^[\^_]/.test(current.source)) continue

    const previous = segments[i - 1]
    if (!previous || previous.type !== 'text' || !previous.source) continue

    const prevChars = [...previous.source]
    const anchorChar = prevChars.pop()
    if (!anchorChar || !/[A-Za-z0-9)\]]/.test(anchorChar)) continue

    previous.source = prevChars.join('')
    previous.displayText = previous.source
    current.source = `${anchorChar}${current.source}`
  }

  return segments.filter(segment => segment.source.length > 0)
}
