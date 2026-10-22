// Text element types
import { BaseElement } from './base'
import { Fill } from '../style/fill'
import { Stroke } from '../style/stroke'
import { VisualEffect } from '../style/effect'

export type FontWeight = 'normal' | 'bold' | 'lighter' | 'bolder' | number
export type FontStyle = 'normal' | 'italic' | 'oblique'
export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type TextAnchor = 'start' | 'middle' | 'end'
export type TextDecoration = 'none' | 'underline' | 'line-through' | 'overline'
export type VerticalAlign = 'top' | 'middle' | 'bottom' | 'baseline'

/**
 * Text decoration styles
 */
export interface TextDecorationStyle {
  underline?: boolean
  lineThrough?: boolean
  overline?: boolean
  underlineColor?: string
  lineThroughColor?: string
  overlineColor?: string
}

/**
 * Text element
 */
export interface TextElement extends BaseElement {
  type: 'text'

  // Text content
  text: string

  // Font properties
  fontFamily: string
  fontSize: number        // in pixels
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  fontVariant?: 'normal' | 'small-caps'

  // Text color (uses fill)
  fill: Fill

  /**
   * Optional outline (text stroke). SVG allows `stroke` on `<text>` /
   * `<tspan>` for hollow/outlined text. PPTX's equivalent is the
   * `<a:rPr><a:ln/></a:rPr>` run-property line; pptxgenjs exposes this
   * via `TextPropsOptions.outline: { color, size }`. We carry the
   * full SIF Stroke so the converter can pick color/width; lineCap /
   * lineJoin are not surfaced (PPTX text outline is single-segment).
   */
  stroke?: Stroke

  // Alignment
  textAlign?: TextAlign
  textAnchor?: TextAnchor         // text alignment anchor within the text box
  verticalAlign?: VerticalAlign   // vertical alignment within the text box
  lineHeight?: number             // line height in pixels
  letterSpacing?: number          // letter spacing in pixels

  // Decoration
  decoration?: TextDecorationStyle

  // Paragraph properties
  indent?: number                 // first line indent
  marginLeft?: number
  marginRight?: number

  // Text rotation
  textRotation?: number           // degrees

  /**
   * Phase 0.2B: `textLength` constrains the rendered width of the
   * `<text>` element. When combined with `lengthAdjust`, the renderer
   * stretches glyphs (`spacingAndGlyphs`) or only inter-glyph spacing
   * (`spacing`, the default) to hit the target width.
   */
  textLength?: number             // pixels
  lengthAdjust?: 'spacing' | 'spacingAndGlyphs'

  /**
   * Phase 0.2B: SVG `xml:space="preserve"` — keep all whitespace inside
   * `<text>` / `<tspan>` verbatim (no collapsing of consecutive spaces,
   * no trimming of leading / trailing whitespace).
   */
  preserveWhitespace?: boolean

  // Phase 1.5: text-on-path support. When set, the text is laid out
  // along the path's `d` string starting at `startOffset` (a length
  // along the path in user units). PPTX rendering of curved text is
  // best-effort; the renderer falls back to a single tspan for
  // non-linear paths.
  textPath?: {
    /** Reference id of the <path> in <defs>. */
    href: string
    /** Path data (the resolved `d` attribute from the referenced path). */
    d: string
    /** Start offset along the path, in user units. */
    startOffset: number
  }

  /**
   * Visual effect applied to the text (drop shadow, glow, ...).
   * Mirrors the `effect` field on `BaseElement` but lives on
   * `TextElement` too because PPTX users often want a text-level
   * drop shadow (e.g. "SHADOW" labels in the 05-filters fixtures)
   * and pptxgenjs's `TextPropsOptions.shadow` is the natural place
   * to emit it. Blur / luminance-matrix effects are dropped.
   */
  effect?: VisualEffect
}

/**
 * Text run (part of a text element with different formatting)
 */
export interface TextRun {
  text: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  fill?: Fill
  decoration?: TextDecorationStyle
  /**
   * Phase 0.2B: per-run rotation in degrees (SVG `<tspan rotate>`).
   * SVG allows a per-character list (`rotate="0 45 90"`); we collapse
   * to the first finite value so downstream renderers only need to
   * carry a single number.
   */
  rotate?: number
  /**
   * Phase 0.2B: SVG `baseline-shift` on `<tspan>`. `super` / `sub` map
   * to PPTX superscript / subscript; a numeric value is interpreted as
   * a percentage of the em (positive = up, negative = down).
   */
  baselineShift?: 'super' | 'sub' | number
  /**
   * Phase 0.2B: SVG `textLength` on `<tspan>` — forces the run to render
   * at the given pixel width. The renderer converts to PPTX `charSpacing`
   * to approximate the effect (PPTX has no native textLength).
   */
  textLength?: number
  lengthAdjust?: 'spacing' | 'spacingAndGlyphs'
  /** Phase 0.2B: per-run `xml:space="preserve"`. */
  preserveWhitespace?: boolean
}

/**
 * Rich text element with multiple runs
 */
export interface RichTextElement extends BaseElement {
  type: 'text'
  text: string                     // Plain text fallback
  runs: TextRun[]                  // Formatted runs

  // Default font properties
  fontFamily: string
  fontSize: number
  fill: Fill
  /** See {@link TextElement.stroke}. */
  stroke?: Stroke
  /** See {@link TextElement.effect}. */
  effect?: VisualEffect

  // Alignment
  textAlign?: TextAlign
  textAnchor?: TextAnchor
  verticalAlign?: VerticalAlign
  lineHeight?: number

  /** Phase 0.2B: see {@link TextElement.textLength}. */
  textLength?: number
  lengthAdjust?: 'spacing' | 'spacingAndGlyphs'
  preserveWhitespace?: boolean
}
