// Phase 0.2B: convert SVG `<foreignObject>` (when it wraps a tiny slice
// of HTML — h1-h6, p, span, b, i, u, em, strong, br) into a SIF
// RichTextElement.
//
// Scope: top-level usage only. Browsers render foreignObject contents
// with the host's HTML / CSS engine, which is out of reach for a static
// SVG → PPTX converter. We support the most common case ("a styled text
// fragment placed inside SVG with absolute coordinates") by mapping a
// whitelist of inline / block tags to text runs with bold / italic /
// underline / line-break semantics. Anything outside the whitelist is
// dropped silently (matching the converter's policy elsewhere).

import type { RichTextElement, TextRun } from '../../sif/types/elements/text'
import { getAttr, getOrderedMixedChildren } from '../parser'
import { parseColor } from './color'
import type { TransformMatrix } from './group'
import { applyMatrixToPoint, decomposeMatrix } from './group'
import { resolveWebFontFamily } from '../../utils/font'

export interface ForeignObjectConvertOptions {
  generateId: (prefix: string) => string
  /**
   * Phase 0.2B v2: ambient transform from any enclosing `<g>` /
   * `<svg>` viewport. Without this the foreignObject's `x` / `y`
   * attributes stay in their local coordinate system and the resulting
   * text frame lands in the wrong panel of a grouped fixture.
   */
  transformMatrix?: TransformMatrix
}

const INLINE_STYLE: Record<string, Partial<TextRun>> = {
  b: { fontWeight: 'bold' },
  strong: { fontWeight: 'bold' },
  i: { fontStyle: 'italic' },
  em: { fontStyle: 'italic' },
  u: { decoration: { underline: true } },
}

const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'])

const HEADING_SIZE_FACTORS: Record<string, number> = {
  h1: 2.0,
  h2: 1.5,
  h3: 1.17,
  h4: 1.0,
  h5: 0.83,
  h6: 0.67,
}

/**
 * Convert a `<foreignObject>` node into a RichTextElement. Returns
 * `undefined` if the node has no usable HTML content (e.g. it wraps
 * a tag the whitelist doesn't cover and contains no plain text).
 */
export function convertForeignObject(
  node: Record<string, unknown>,
  options: ForeignObjectConvertOptions
): RichTextElement | undefined {
  const rawX = parseFloat(getAttr(node, 'x') || '0')
  const rawY = parseFloat(getAttr(node, 'y') || '0')
  const rawWidth = parseFloat(getAttr(node, 'width') || '0')
  const rawHeight = parseFloat(getAttr(node, 'height') || '0')
  // Apply the ambient transform to the foreignObject's anchor and to
  // its width / height so the resulting box lives in absolute units.
  // We assume the matrix is translate-only or uniformly scaled — the
  // common case for grouping callouts on a slide.
  const matrix = options.transformMatrix
  const topLeft = matrix
    ? applyMatrixToPoint(rawX, rawY, matrix)
    : { x: rawX, y: rawY }
  const { scaleX, scaleY } = matrix ? decomposeMatrix(matrix) : { scaleX: 1, scaleY: 1 }
  const x = topLeft.x
  const y = topLeft.y
  const width = rawWidth * Math.abs(scaleX || 1)
  const height = rawHeight * Math.abs(scaleY || 1)
  const fontFamily = resolveWebFontFamily(getAttr(node, 'font-family'))
  const fontSize = parseFloat(getAttr(node, 'font-size') || '16') * Math.abs((scaleX + scaleY) / 2 || 1)
  const colorAttr = getAttr(node, 'color') || getAttr(node, 'fill') || '#000000'

  const baseRun: TextRun = {
    text: '',
    fontFamily,
    fontSize,
  }

  // foreignObject's child is typically a `<div>` or `<body>`; either
  // way we treat the whole subtree as a flat list of runs separated by
  // BLOCK_TAGS (which become `\n` boundaries) and `<br/>` lines.
  const runs: TextRun[] = []
  walkHtmlChildren(node, baseRun, runs, fontSize)

  // Filter out empty runs that contributed no text but kept formatting.
  const usableRuns = runs.filter(r => r.text.length > 0)
  if (usableRuns.length === 0) return undefined

  const text = usableRuns.map(r => r.text).join('')

  return {
    id: options.generateId('text'),
    type: 'text',
    x,
    y,
    width: width || estimateTextWidth(text, fontSize),
    height: height || fontSize * 1.45 * countLines(text),
    text,
    runs: usableRuns,
    fontFamily,
    fontSize,
    fill: { type: 'solid', color: parseColor(colorAttr) },
  }
}

/**
 * Walk an HTML-ish subtree and accumulate `TextRun` entries. Block
 * tags (h1..h6, p, div) inject a `\n` between their content and the
 * surrounding flow; `<br/>` inserts a single `\n`. Unknown tags are
 * silently descended into so plain text leaves still survive.
 */
function walkHtmlChildren(
  node: Record<string, unknown>,
  inheritedRun: TextRun,
  out: TextRun[],
  baseFontSize: number
): void {
  // Phase 0.2B v2: prefer the ordered (document-order) child list so
  // `<p>Body with <b>bold</b>.</p>` keeps "Body with " before "bold".
  // Falls back to the unordered key walk when the parser didn't
  // capture ordering for this subtree.
  const ordered = getOrderedMixedChildren(node)
  if (ordered) {
    for (const entry of ordered) {
      if (entry.tag === '#text') {
        const raw = entry.text ?? ''
        if (raw) out.push({ ...inheritedRun, text: raw })
        continue
      }
      const key = entry.tag
      if (key === 'br') {
        out.push({ ...inheritedRun, text: '\n' })
        continue
      }
      const isBlock = BLOCK_TAGS.has(key)
      const styleOverlay = INLINE_STYLE[key]
      let tagRun: TextRun = inheritedRun
      if (isBlock) {
        tagRun = {
          ...inheritedRun,
          fontSize: baseFontSize * (HEADING_SIZE_FACTORS[key] ?? 1),
        }
        if (key.startsWith('h')) tagRun.fontWeight = 'bold'
      } else if (styleOverlay) {
        tagRun = mergeRun(inheritedRun, styleOverlay)
      }
      walkHtmlChildren(entry.node, tagRun, out, baseFontSize)
      if (isBlock) out.push({ ...tagRun, text: '\n' })
    }
    // Direct `#text` of the root container may live on the node too
    // even when ordered children covered the subtree; harvest it for
    // the simple `<foreignObject>plain text</foreignObject>` case.
    if (ordered.length === 0) {
      const fallback = node['#text']
      if (fallback !== undefined) out.push({ ...inheritedRun, text: String(fallback) })
    }
    return
  }

  for (const key of Object.keys(node)) {
    if (key.startsWith('@_')) continue

    const value = node[key]

    if (key === '#text') {
      out.push({ ...inheritedRun, text: String(value) })
      continue
    }

    if (key === 'br') {
      out.push({ ...inheritedRun, text: '\n' })
      continue
    }

    // Resolve the per-tag style overlay up-front so the simple "string
    // leaf" case (`<h1>Title</h1>` → `{ h1: 'Title' }`) gets the same
    // treatment as the recursive object case.
    const isBlock = BLOCK_TAGS.has(key)
    const styleOverlay = INLINE_STYLE[key]
    let tagRun: TextRun = inheritedRun
    if (isBlock) {
      tagRun = {
        ...inheritedRun,
        fontSize: baseFontSize * (HEADING_SIZE_FACTORS[key] ?? 1),
      }
      if (key.startsWith('h')) tagRun.fontWeight = 'bold'
    } else if (styleOverlay) {
      tagRun = mergeRun(inheritedRun, styleOverlay)
    }

    const children = Array.isArray(value) ? value : [value]
    for (const child of children) {
      if (child === null || child === undefined) continue
      if (typeof child !== 'object') {
        out.push({ ...tagRun, text: String(child) })
        continue
      }
      walkHtmlChildren(child as Record<string, unknown>, tagRun, out, baseFontSize)
    }

    if (isBlock) {
      out.push({ ...tagRun, text: '\n' })
    }
  }
}

/**
 * Merge two TextRun-shaped style records. The overlay wins for
 * primitive fields; `decoration` is shallow-merged so `<u><b>x</b></u>`
 * keeps both underline and bold.
 */
function mergeRun(base: TextRun, overlay: Partial<TextRun>): TextRun {
  return {
    ...base,
    ...overlay,
    decoration: overlay.decoration
      ? { ...(base.decoration || {}), ...overlay.decoration }
      : base.decoration,
    text: base.text,
  }
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.max(text.length * fontSize * 0.55, fontSize * 2)
}

function countLines(text: string): number {
  return Math.max(text.split('\n').length, 1)
}
