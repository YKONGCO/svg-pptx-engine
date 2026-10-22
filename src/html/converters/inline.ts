// src/html/converters/inline.ts
//
// flattenInlineContent(): walk the children of a text element and
// produce a flat list of TextRuns. This is the heart of HTML→SIF
// text conversion: every paragraph, heading, and list item goes
// through here so its inline styling (bold, italic, links, breaks)
// is preserved as TextRun entries.
//
// Design notes:
//   - We walk element children in order. Text nodes append to the
//     "current" run; inline elements (b, i, span, …) recurse with
//     the right style overrides merged on top of the parent.
//   - <br> flushes the current run and starts a new one — that's the
//     only way to get a hard line break inside a single SIF
//     TextElement.
//   - After walking, adjacent runs with identical styling are
//     merged (squeeze) so we don't emit a new run for every
//     adjacent <b> or <span>.

import type { TextRun, FontWeight, FontStyle, TextDecorationStyle } from '../../sif/types/elements/text'
import type { Fill } from '../../sif/types/style/fill'
import type { ComputedStyle, StyleMap } from '../css/cascade'
import type { HtmlElement, HtmlText } from '../parser'
import { getChildren } from '../parser'
import { resolveWebFontFamily } from '../../utils/font'
import { readInlineFill } from './visual'

/**
 * The style overrides a parent passes down to a child run. Each
 * field is optional; we only fill it in if the corresponding HTML
 * element (b, i, span, …) sets it.
 */
interface RunStyle {
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  decoration?: TextDecorationStyle
  baselineShift?: 'super' | 'sub' | number
  fill?: Fill
  fontFamily?: string
  fontSize?: number
}

const EMPTY_STYLE: RunStyle = Object.freeze({}) as RunStyle

/**
 * Walk `root`'s children, returning a flat array of TextRuns.
 *
 * `parentStyle` is the style inherited from the *text element* that
 * owns this inline content (e.g. its fontFamily / fontSize). The
 * function does NOT use the cascade's per-element style for each
 * inline child — for inline content we only need to look at the
 * HTML tag (b/i/u/…) and the inline `style` attribute. Anything
 * more complex (e.g. `.special { … }` on a span) is best-effort
 * honoured via the `styles` map.
 */
export function flattenInlineContent(
  root: HtmlElement,
  styles: StyleMap,
  parentStyle: RunStyle = EMPTY_STYLE
): TextRun[] {
  const out: TextRun[] = []
  for (const child of root.children) {
    if (child.type === 'text') {
      appendText(out, child, parentStyle)
    } else if (child.type === 'element') {
      visitElement(child, out, styles, parentStyle)
    }
    // comments are dropped
  }
  squeeze(out)
  return out
}

function appendText(out: TextRun[], node: HtmlText, style: RunStyle): void {
  const text = node.text
  if (!text) return
  const last = out[out.length - 1]
  if (last && !last.text?.endsWith('\n') && sameStyle(styleOf(last), style)) {
    last.text += text
  } else {
    out.push(buildRun(text, style))
  }
}

function visitElement(
  el: HtmlElement,
  out: TextRun[],
  styles: StyleMap,
  parentStyle: RunStyle
): void {
  // <br> is the only element that doesn't recurse. The PPTX layer
  // recognises a trailing `\n` as a hard line break via
  // `breakLine: true`; we embed it directly so the squeeze pass
  // doesn't fold neighbouring runs together.
  if (el.tagName === 'br') {
    const last = out[out.length - 1]
    if (last) {
      last.text = (last.text || '') + '\n'
    } else {
      out.push(buildRun('\n', EMPTY_STYLE))
    }
    return
  }

  const next = mergeStyle(parentStyle, el, styles)
  for (const child of el.children) {
    if (child.type === 'text') {
      appendText(out, child, next)
    } else if (child.type === 'element') {
      visitElement(child, out, styles, next)
    }
  }
}

// =============================================================================
// Style application per inline tag
// =============================================================================

/**
 * Compute the RunStyle for an inline element by combining the
 * parent's style with what this element adds.
 */
function mergeStyle(parent: RunStyle, el: HtmlElement, styles: StyleMap): RunStyle {
  const out: RunStyle = { ...parent }

  switch (el.tagName) {
    case 'b':
    case 'strong':
      out.fontWeight = 'bold'
      break
    case 'i':
    case 'em':
    case 'cite':
    case 'dfn':
      out.fontStyle = 'italic'
      break
    case 'u':
    case 'ins':
      out.decoration = { ...(parent.decoration ?? {}), underline: true }
      break
    case 's':
    case 'del':
    case 'strike':
      out.decoration = { ...(parent.decoration ?? {}), lineThrough: true }
      break
    case 'mark':
      out.fill = { type: 'solid', color: '#FFEB3B' }
      break
    case 'sub':
      out.baselineShift = 'sub'
      break
    case 'sup':
      out.baselineShift = 'super'
      break
    case 'code':
    case 'kbd':
    case 'samp':
    case 'var':
      out.fontFamily = resolveWebFontFamily('monospace')
      break
    case 'small':
      out.fontSize = (parent.fontSize ?? 16) * 0.83
      break
    case 'big':
      out.fontSize = (parent.fontSize ?? 16) * 1.2
      break
    case 'span':
    case 'a':
      // Style comes from CSS / inline — read from `styles` map
      // and convert relevant longhands into RunStyle fields.
      applyComputedStyle(out, el, styles)
      break
  }
  return out
}

function applyComputedStyle(out: RunStyle, el: HtmlElement, styles: StyleMap): void {
  const style = styles.get(el.nodeId)
  if (!style) return

  const fw = style.get('font-weight')
  if (fw === 'bold' || fw === 'normal' || fw === 'bolder' || fw === 'lighter') {
    out.fontWeight = fw as FontWeight
  } else if (fw) {
    const n = parseInt(fw, 10)
    if (Number.isFinite(n)) out.fontWeight = n
  }
  const fs = style.get('font-style')
  if (fs === 'italic' || fs === 'normal' || fs === 'oblique') {
    out.fontStyle = fs as FontStyle
  }
  const td = style.get('text-decoration') || style.get('text-decoration-line')
  if (td) {
    out.decoration = {
      ...(out.decoration ?? {}),
      underline: td.includes('underline') || undefined,
      lineThrough: td.includes('line-through') || undefined,
      overline: td.includes('overline') || undefined,
    }
  }
  const color = style.get('color')
  if (color) {
    out.fill = readInlineFill(color)
  }
  const ff = style.get('font-family')
  if (ff) {
    out.fontFamily = resolveWebFontFamily(ff)
  }
}

function styleOf(run: TextRun): RunStyle {
  return {
    fontWeight: run.fontWeight,
    fontStyle: run.fontStyle,
    decoration: run.decoration,
    baselineShift: run.baselineShift,
    fill: run.fill,
    fontFamily: run.fontFamily,
    fontSize: run.fontSize,
  }
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return (
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.baselineShift === b.baselineShift &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    sameDecoration(a.decoration, b.decoration) &&
    sameFill(a.fill, b.fill)
  )
}

function sameDecoration(a: TextDecorationStyle | undefined, b: TextDecorationStyle | undefined): boolean {
  const norm = (d?: TextDecorationStyle) =>
    JSON.stringify({
      u: !!(d && d.underline),
      l: !!(d && d.lineThrough),
      o: !!(d && d.overline),
    })
  return norm(a) === norm(b)
}

function sameFill(a: Fill | undefined, b: Fill | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.type === 'solid' && b.type === 'solid') return a.color === b.color
  return false
}

function buildRun(text: string, style: RunStyle): TextRun {
  const out: TextRun = { text }
  if (style.fontWeight !== undefined) out.fontWeight = style.fontWeight
  if (style.fontStyle !== undefined) out.fontStyle = style.fontStyle
  if (style.decoration !== undefined) out.decoration = style.decoration
  if (style.baselineShift !== undefined) out.baselineShift = style.baselineShift
  if (style.fill !== undefined) out.fill = style.fill
  if (style.fontFamily !== undefined) out.fontFamily = style.fontFamily
  if (style.fontSize !== undefined) out.fontSize = style.fontSize
  return out
}

// =============================================================================
// Run squeeze
// =============================================================================

function squeeze(runs: TextRun[]): void {
  for (let i = runs.length - 2; i >= 0; i--) {
    const a = runs[i]
    const b = runs[i + 1]
    // Don't merge across a hard line break boundary.
    if ((a.text ?? '').includes('\n') || (b.text ?? '').includes('\n')) continue
    if (sameStyle(styleOf(a), styleOf(b))) {
      a.text = (a.text || '') + (b.text || '')
      runs.splice(i + 1, 1)
    }
  }
}
