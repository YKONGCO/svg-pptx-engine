// src/html/converters/text.ts
//
// Convert block-level text containers (<h1>...<h6>, <p>, <blockquote>,
// <pre>) into SIF TextElement / RichTextElement. Inline content (b,
// i, span, …) is flattened by `flattenInlineContent()` into a run
// list. When inline markup is present we emit RichTextElement; when
// the content is plain text we emit TextElement (cheaper for the
// renderer).

import type { TextElement, RichTextElement, TextRun, FontWeight, FontStyle, TextDecorationStyle } from '../../sif/types/elements/text'
import type { Fill } from '../../sif/types/style/fill'
import type { ComputedStyle, StyleMap } from '../css/cascade'
import type { HtmlElement } from '../parser'
import { getTextContent } from '../parser'
import { resolveWebFontFamily } from '../../utils/font'
import { toPx, isLength, parseColor } from '../css/units'
import { flattenInlineContent } from './inline'

const TAG_FONT_SIZES: Record<string, number> = {
  h1: 32, h2: 24, h3: 20, h4: 18, h5: 16, h6: 14,
}

const TAG_FONT_WEIGHTS: Record<string, FontWeight> = {
  h1: 'bold', h2: 'bold', h3: 'bold', h4: 'bold', h5: 'bold', h6: 'bold',
}

const TAG_DEFAULT_FONT: Record<string, string> = {
  pre: 'monospace',
}

interface TextContext {
  fontSize: number
  fontFamily: string
  color: string
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  textDecoration?: TextDecorationStyle
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right' | 'justify'
}

const DEFAULT_CONTEXT: TextContext = {
  fontSize: 16,
  fontFamily: resolveWebFontFamily(undefined),
  color: '#000000',
}

export function convertTextElement(
  el: HtmlElement,
  styles: StyleMap,
  inherited: TextContext = DEFAULT_CONTEXT
): TextElement | RichTextElement {
  const style = styles.get(el.nodeId) ?? new Map()
  const ctx = resolveContext(el.tagName, style, inherited)
  const hasInline = hasInlineChildren(el)

  if (!hasInline) {
    return buildTextElement(el, ctx, getTextContent(el))
  }

  const runs = flattenInlineContent(el, styles, {
    fontSize: ctx.fontSize,
    fontFamily: ctx.fontFamily,
    fontWeight: ctx.fontWeight,
    fontStyle: ctx.fontStyle,
    decoration: ctx.textDecoration,
    fill: { type: 'solid', color: ctx.color } as Fill,
  })
  return buildRichTextElement(el, ctx, runs)
}

// =============================================================================
// Context resolution
// =============================================================================

function resolveContext(tag: string, style: ComputedStyle, inherited: TextContext): TextContext {
  const defaultSize = TAG_FONT_SIZES[tag] ?? inherited.fontSize
  const sizeRaw = style.get('font-size')
  const fontSize = sizeRaw ? Math.max(8, toPx(sizeRaw, { baseFontSize: defaultSize })) : defaultSize

  const familyRaw = style.get('font-family') ?? TAG_DEFAULT_FONT[tag]
  const fontFamily = resolveWebFontFamily(familyRaw ?? inherited.fontFamily)

  const colorRaw = style.get('color') ?? inherited.color
  const color = normalizeColor(colorRaw || '#000000')

  const weightRaw = style.get('font-weight')
  let fontWeight: FontWeight | undefined
  if (weightRaw) {
    if (weightRaw === 'normal' || weightRaw === 'bold' || weightRaw === 'lighter' || weightRaw === 'bolder') {
      fontWeight = weightRaw
    } else {
      const n = parseInt(weightRaw, 10)
      if (Number.isFinite(n)) fontWeight = n
    }
  }
  if (fontWeight === undefined) fontWeight = TAG_FONT_WEIGHTS[tag] ?? inherited.fontWeight

  const styleRaw = style.get('font-style')
  const fontStyle: FontStyle | undefined = (styleRaw === 'italic' || styleRaw === 'oblique' || styleRaw === 'normal')
    ? styleRaw
    : inherited.fontStyle

  const decRaw = style.get('text-decoration') || style.get('text-decoration-line')
  const textDecoration: TextDecorationStyle | undefined = decRaw
    ? {
        underline: decRaw.includes('underline') || undefined,
        lineThrough: decRaw.includes('line-through') || undefined,
        overline: decRaw.includes('overline') || undefined,
      }
    : inherited.textDecoration

  const lhRaw = style.get('line-height')
  const lineHeight = lhRaw
    ? (isLength(lhRaw)
        ? toPx(lhRaw, { baseFontSize: fontSize })
        : parseFloat(lhRaw) * fontSize) || undefined
    : undefined

  const alignRaw = style.get('text-align')
  const textAlign: TextContext['textAlign'] =
    alignRaw === 'left' || alignRaw === 'center' || alignRaw === 'right' || alignRaw === 'justify'
      ? alignRaw
      : undefined

  return { fontSize, fontFamily, color, fontWeight, fontStyle, textDecoration, lineHeight, textAlign }
}

// =============================================================================
// Element builders
// =============================================================================

function buildTextElement(el: HtmlElement, ctx: TextContext, text: string): TextElement {
  return {
    id: `el-${el.nodeId}`,
    type: 'text',
    text,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fontFamily: ctx.fontFamily,
    fontSize: ctx.fontSize,
    fill: { type: 'solid', color: ctx.color },
    fontWeight: ctx.fontWeight,
    fontStyle: ctx.fontStyle,
    lineHeight: ctx.lineHeight,
    decoration: ctx.textDecoration,
    textAlign: ctx.textAlign,
  }
}

function buildRichTextElement(el: HtmlElement, ctx: TextContext, runs: TextRun[]): RichTextElement {
  // Concatenate plain text from runs (for fallbacks / accessibility).
  const plain = runs.map(r => r.text || '').join('')
  return {
    id: `el-${el.nodeId}`,
    type: 'text',
    text: plain,
    runs,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fontFamily: ctx.fontFamily,
    fontSize: ctx.fontSize,
    fill: { type: 'solid', color: ctx.color },
    lineHeight: ctx.lineHeight,
    textAlign: ctx.textAlign,
  }
}

// =============================================================================
// Inline children detection
// =============================================================================

function hasInlineChildren(el: HtmlElement): boolean {
  for (const c of el.children) {
    if (c.type === 'element') return true
  }
  return false
}

// =============================================================================
// Color normalisation
// =============================================================================

export function normalizeColor(raw: string): string {
  const parsed = parseColor(raw)
  if (!parsed) return raw
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase()
  const a = parsed.a
  if (a < 1) {
    return `#${toHex(parsed.r)}${toHex(parsed.g)}${toHex(parsed.b)}${toHex(Math.round(a * 255))}`
  }
  return `#${toHex(parsed.r)}${toHex(parsed.g)}${toHex(parsed.b)}`
}