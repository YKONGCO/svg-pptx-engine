// Phase 1: inline-segment splitter, lifted out of the PPTX layer
// into the SIF layer so SVG converters can also benefit from it.
//
// Given the raw text content of a `<text>` / `<tspan>` (with the
// formula delimiters visible, e.g. `x^2 + $y^2$`), this module
// returns an ordered list of segments. Each segment is either
//   - a plain text piece, or
//   - a formula piece, whose `source` carries the LaTeX / MathML.
//
// The split follows the same LaTeX-ish rules as the v1.x PPTX-side
// helper (see `src/formula/extract.ts`): `$…$` / `\(…\)` mark
// inline formulas; `$$…$$` / `\[…\]` mark block-level formulas
// (detected via the `kind: 'block'` variant). Pure plain text
// returns `null` so the caller can fast-path to a single text frame.
//
// Each segment carries a `run` reference — typically the parent
// tspan's `TextRun` — so the PPTX layer can apply the per-run style
// (bold/italic/colour) to *both* the text and formula pieces without
// re-deriving them. The SVG converter fills this in after building
// the runs.

import type { TextRun } from '../types/elements/text'
import { extractInlineFormulaSegments } from '../../formula/extract'

/** A formula input the pipeline understands. Re-exported from
 *  `src/formula/types.ts` to keep the SIF surface self-contained. */
export type FormulaSource = {
  format: 'latex' | 'mathml'
  source: string
}

/**
 * One slice of a mixed text run. `text` segments render as plain
 * text; `formula` segments become OMML boxes; `block` segments
 * render as their own centred addText frame.
 */
export type InlineSegment =
  | {
      kind: 'text'
      /** Visible text (formula delimiters already stripped). */
      text: string
      /** The parent run for style inheritance. */
      run: TextRun
    }
  | {
      kind: 'formula'
      /** LaTeX / MathML payload. */
      source: FormulaSource
      run: TextRun
    }
  | {
      kind: 'block'
      source: FormulaSource
      run: TextRun
    }

/**
 * Phase 1 main entry: split a single text string into InlineSegments.
 * Returns `null` if the string contains no formula boundaries at all
 * (so callers can emit a single text frame without overhead).
 *
 * @param raw     The text payload, as found in `text.text` or a
 *                tspan's text content.
 * @param run     The owning run, used as the style carrier for every
 *                emitted segment.
 * @param options When `options.supportsBlock` is true, `$$…$$` and
 *                `\[…\]` boundaries produce `kind: 'block'` segments.
 *                Otherwise they're treated as inline formulas (the
 *                v1.x behaviour).
 */
export function splitInlineSegments(
  raw: string,
  run: TextRun,
  options?: { supportsBlock?: boolean }
): InlineSegment[] | null {
  if (!raw) return null
  const segments = extractInlineSegmentsImpl(raw, !!options?.supportsBlock)
  if (!segments) return null
  return segments.map(s => attachRun(s, run))
}

function attachRun(seg: InlineSegmentRaw, run: TextRun): InlineSegment {
  if (seg.kind === 'text') return { kind: 'text', text: seg.text ?? '', run }
  return { kind: seg.kind, source: seg.source as FormulaSource, run }
}

interface InlineSegmentRaw {
  kind: 'text' | 'formula' | 'block'
  text?: string
  source?: FormulaSource
}

/**
 * Wraps the v1.x `extractInlineFormulaSegments` so the SIF layer
 * doesn't depend on the PPTX-side `convertMixedTextToFragments`. The
 * shape returned here is the same flat list the PPTX layer expects;
 * the only addition is the `block` kind for `$$…$$` / `\[…\]`.
 */
function extractInlineSegmentsImpl(
  raw: string,
  supportsBlock: boolean
): InlineSegmentRaw[] | null {
  // Quick path: if there's no `$` / `\[` / `\(` in the string we
  // can short-circuit and tell the caller there's no work to do.
  if (!hasBoundary(raw)) return null

  // Block-level: try the whole-string block wrappers first so a
  // single `$$…$$` doesn't get split into pieces by the inline
  // matcher.
  if (supportsBlock) {
    const block = matchBlockFormula(raw)
    if (block) return [block]
  }

  const inline = extractInlineFormulaSegments(raw)
  if (!inline) {
    // Could still be a single block wrapper that the inline matcher
    // ignored (e.g. unbalanced inline dollars) — fall back to a
    // single text segment so the caller doesn't lose content.
    return [{ kind: 'text', text: raw }]
  }
  return inline.map<InlineSegmentRaw>(s => {
    if (s.type === 'text') return { kind: 'text', text: s.source }
    return { kind: 'formula', source: { format: 'latex', source: s.source } }
  })
}

function hasBoundary(raw: string): boolean {
  if (raw.indexOf('$') === -1 && raw.indexOf('\\') === -1) return false
  return true
}

function matchBlockFormula(raw: string): InlineSegmentRaw | null {
  const trimmed = raw.trim()
  if (trimmed.startsWith('<math')) return { kind: 'block', source: { format: 'mathml', source: trimmed } }
  const dollars = trimmed.match(/^\$\$([\s\S]+)\$\$$/)
  if (dollars) return { kind: 'block', source: { format: 'latex', source: dollars[1].trim() } }
  const bracket = trimmed.match(/^\\\[([\s\S]+)\\]$/)
  if (bracket) return { kind: 'block', source: { format: 'latex', source: bracket[1].trim() } }
  return null
}
