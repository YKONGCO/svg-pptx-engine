// PPTX-side glue for the `src/formula/` pipeline.
//
// This file is the *only* place in the package that knows about
// `PptxGenJS`, `TextElement`, `pxToInch`, etc. — everything else
// in the formula module is pure LaTeX/MathML/OMML.
//
// The pure pipeline lives in `src/formula/`. It is re-exported
// here so the historical import paths
// (`../utils/formula`) keep working without churn at the call
// sites.

import type PptxGenJS from 'pptxgenjs'
import type { TextElement } from '../../sif/types/elements/text'
import type { Fill, GradientFill, SolidFill } from '../../sif/types/style/fill'
import { fontStyleToBool, fontWeightToBool, hexToPptxColor, pxToInch, pxToPt, textAlignToPptx } from '../utils'
import { containsCjk, resolveFontBridge } from '../../utils/font'
import {
  estimateTextWidth,
  extractFormulaSource,
  extractInlineFormulaSegments,
  flattenText,
  getFormulaColors,
  injectMathColors,
  injectUniformMathColor,
  latexToMathML,
  mathMLToOmml,
  parseMathML
} from '../../formula'
import { BASELINE, resolveFormulaBaseline } from './baseline'

// ─── Re-exports (public API, unchanged) ─────────────────────────────

export {
  latexToMathML,
  mathMLToOmml,
  parseMathML,
  extractInlineFormulaSegments,
  extractFormulaSource,
  flattenText,
  escapeXml,
  setFormulaColors,
  getFormulaColors,
  injectMathColors,
  injectUniformMathColor,
  normaliseHexColor,
  mathNodeToMathML,
  GREEK_MAP,
  OPERATOR_MAP,
  OPERATOR_NAMES,
  ACCENT_OVER,
  LINE_OVER,
  DOTS,
  MATRIX_ENVS,
  LEFT_RIGHT_DELIMS,
  TEXT_COMMANDS,
  type MathNode,
  type MathTag,
  type FormulaSource,
  type InlineFormulaSegment,
  type FormulaColors
} from '../../formula'

/** Stable, testable entry point for the LaTeX→MathML stage. */
export function __private__latexToMathML(latex: string): string {
  return latexToMathML(latex)
}

// ─── PPTX-specific glue ─────────────────────────────────────────────

/** The shape `PptxGenJS` expects for a formula in `slide.addFormula`. */
export interface ConvertedFormula {
  type: 'formula'
  options: PptxGenJS.FormulaProps & {
    /** When true, the PPTX generator emits the LaTeX source as a
     * styled text run instead of an OMML formula object. */
    asText?: boolean
    /** The raw LaTeX (or MathML) source. Used by the text-fallback
     * rendering path. */
    source?: string
  }
}

interface InlineLayoutMetrics {
  width: number
  fontSize: number
  y: number
  h: number
}

/** Convert a SIF `<text>` fill into a hex colour suitable for the
 *  formula box. Gradient fills degrade to the first stop colour. */
function convertFillToColor(fill: Fill): string | undefined {
  if (fill.type === 'solid') {
    return hexToPptxColor((fill as SolidFill).color)
  }

  if (fill.type === 'gradient') {
    const gradient = (fill as GradientFill).gradient
    if (gradient.stops.length > 0) {
      return hexToPptxColor(gradient.stops[0].color)
    }
  }

  return undefined
}

function resolveFormulaAlign(text: TextElement): 'left' | 'center' | 'right' {
  if (text.textAnchor === 'middle') return 'center'
  if (text.textAnchor === 'end') return 'right'

  const align = textAlignToPptx(text.textAlign)
  return align === 'right' ? 'right' : align === 'center' ? 'center' : 'left'
}

// ─── Formula nudge (PPTX box positioning) ──────────────────────────

/** Visual nudge applied to inline formulas at the *box* level
 *  (x and y), in inches. PowerPoint renders the OMML glyphs
 *  centred inside the formula box, but the visual centre of
 *  the rendered math is *not* the geometric centre of the box
 *  — big operators carry extra padding at the top, and the
 *  baseline of a fraction sits below the box's middle line.
 *
 *  The values below are empirical; they move the formula box
 *  slightly down-and-right so the rendered glyphs line up
 *  with the surrounding text baseline instead of appearing
 *  nudged up-and-left.
 *
 *  Override via `setFormulaNudge({ x, y })` if your font set
 *  needs a different offset (e.g. a custom Cambria Math
 *  replacement). */
export interface FormulaNudge {
  /** Horizontal nudge in inches. Positive = right. */
  x?: number
  /** Vertical nudge in inches. Positive = down. */
  y?: number
}

const DEFAULT_FORMULA_NUDGE: Required<FormulaNudge> = {
  // Phase 1: derive from the centralised BASELINE constants so
  // historical inch values (-0.12in, -0.02in at 18-pt) and the new
  // em-based representation agree to float rounding.
  x: BASELINE.FORMULA_X_NUDGE_EM,  // ~ -0.14em leftward
  y: BASELINE.FORMULA_Y_NUDGE_EM,  // ~ -0.025em upward
}

let currentFormulaNudge: Required<FormulaNudge> = { ...DEFAULT_FORMULA_NUDGE }

export function setFormulaNudge(nudge: FormulaNudge | null): void {
  currentFormulaNudge = nudge
    ? { ...DEFAULT_FORMULA_NUDGE, ...nudge }
    : { ...DEFAULT_FORMULA_NUDGE }
}

export function getFormulaNudge(): Readonly<Required<FormulaNudge>> {
  return currentFormulaNudge
}

// ─── Per-text metrics (width, baseline, font size) ─────────────────

function estimateFormulaWidth(latex: string, fontSize: number, letterSpacing: number = 0): number {
  const mathml = latexToMathML(latex)
  const displayText = flattenText(parseMathML(mathml))
  return estimateTextWidth(displayText || latex, fontSize, letterSpacing)
}

function estimateInlineTextWidth(text: string, fontSize: number, letterSpacing: number = 0): number {
  return estimateTextWidth(text, fontSize, letterSpacing) * 0.78
}

function getInlineFormulaMetrics(text: TextElement, source: string): InlineLayoutMetrics {
  // Two strategies for inline math:
  //
  //   1. "compact" — single-token sub/sup scripts (`x^2`,
  //      `e^{i\pi}`). The box height is one line of the
  //      surrounding text, and the formula sits on the same
  //      baseline. Font size ≈ 95% of the surrounding text so
  //      the superscript/subscript looks like ordinary text.
  //
  //   2. "display" — anything that stacks vertically (\frac,
  //      \sum, \int, \sqrt, matrices, …). We *aggressively*
  //      shrink the font and clamp the box height to
  //      `text.height * 0.95` so the formula never grows the
  //      row. PowerPoint scales the OMML glyphs to fit the box,
  //      so a smaller box = smaller glyphs = a row that still
  //      looks like one line of mixed text.
  const isCompactScript = /^[A-Za-z0-9)(]\]]+[\^_]/.test(source)
    && !/\\frac|\\sqrt|\\int|\\sum|\\prod|\\binom|\\begin/.test(source)

  // Font size: compact formulas inherit the text size; display
  // formulas shrink to ~62% of the text font so even a 2-line
  // fraction stays inside one line of mixed text.
  const inlineFontSize = isCompactScript
    ? text.fontSize * 0.95
    : text.fontSize * 0.62

  // Width: glyph-by-glyph at the formula's own (shrunken) size
  // *plus* a small slack factor. PowerPoint's inline-math
  // renderer uses Cambria Math glyphs whose bounding boxes are
  // slightly wider than the per-glyph width estimate
  // (operators like `√`, `∑`, `∏` carry a small side bearing
  // on each side). 1.20× is just enough headroom for the
  // common case without inflating the row layout. Matrices
  // / arrays benefit from the matrix-specific path inside
  // `estimateFormulaWidth`.
  const widthBase = estimateFormulaWidth(source, inlineFontSize, text.letterSpacing)
  const width = widthBase * (isCompactScript ? 1.0 : 1.20)

  // Box height: clamp inside `text.height * 0.95` so the row
  // never grows. For display formulas with fractions, this is
  // what makes them "look smaller" — the OMML glyphs scale to
  // fit the box.
  const h = text.height * 0.95

  // y: keep the formula on the text's baseline. For compact
  // scripts the visual centre equals the text baseline, so y
  // stays at `text.y` minus a tiny optical nudge (a fraction
  // of the formula font size).
  const y = text.y - inlineFontSize * 0.04

  return {
    width,
    fontSize: inlineFontSize,
    y,
    h
  }
}

// ─── High-level converters used by `src/pptx/converters/text.ts` ───

export function convertTextToFormula(text: TextElement): ConvertedFormula | null {
  const formulaSource = extractFormulaSource(text.text)
  if (!formulaSource) {
    return null
  }

  const rawMathml = formulaSource.format === 'latex'
    ? latexToMathML(formulaSource.source)
    : formulaSource.source

  // The text element's `fill` is the author's *custom* colour for
  // this specific formula. When present, we honour it verbatim by
  // stamping the same hex value on every `<mi>` / `<mn>` / `<mo>`
  // so the per-run rPr blocks emitted by mml2omml (now in the
  // DrawingML `<a:rPr>` form) all carry the same colour. This is
  // the most reliable path for PowerPoint's inline-math renderer
  // because it only honours run-level `<a:rPr>`, not the
  // `<m:oMathPr>` default-property block.
  //
  // When the text has no explicit fill (or the fill is a gradient
  // without a usable stop) we fall back to the per-element palette
  // configured via `setFormulaColors(...)` — that palette is what
  // distinguishes variables (mi), numbers (mn) and operators (mo)
  // and is intended for deck-wide theming only.
  const customColor = convertFillToColor(text.fill)
  const useCustom = !!customColor

  const coloured = useCustom
    ? injectUniformMathColor(rawMathml, customColor!)
    : injectMathColors(rawMathml, getFormulaColors())
  const omml = mathMLToOmml(coloured)
  const textColor = customColor ?? 'FFFFFF'

  // Phase 1: detect block-level formulas ($$…$$ / \[…\] / <math>)
  // and route them through `convertBlockFormula` so they render as
  // a centred addText frame with the v1.x block padding. The
  // extractor already trims the delimiters in `formulaSource.source`
  // so we can check whether the source started with them.
  const trimmed = text.text.trim()
  const isBlock = /^\$\$[\s\S]+\$\$$/.test(trimmed)
    || /^\\\[[\s\S]+\\]$/.test(trimmed)
    || /^<math[\s>]/i.test(trimmed)
  if (isBlock) {
    return convertBlockFormula(text, omml, textColor)
  }

  return {
    type: 'formula',
    options: {
      x: pxToInch(text.x),
      y: pxToInch(text.y),
      w: pxToInch(text.width),
      h: pxToInch(text.height),
      fontSize: pxToPt(text.fontSize),
      color: textColor,
      align: resolveFormulaAlign(text),
      omml,
      objectName: text.id
    }
  }
}

/**
 * Phase 1: block-level formula renderer. Used when the entire
 * `<text>` payload is wrapped in `$$…$$` / `\[…\]` / `<math>…</math>`.
 * Centres the formula in its own addText frame with
 * `BLOCK_PADDING_EM` (em) of vertical breathing room above and
 * below, and pins the formula baseline so consecutive block
 * formulas don't drift vertically.
 */
export function convertBlockFormula(
  text: TextElement,
  omml: string,
  color: string
): ConvertedFormula {
  const paddingPx = text.fontSize * BASELINE.BLOCK_PADDING_EM
  const baseline = resolveFormulaBaseline(text.fontSize)
  const top = text.y - paddingPx
  const height = text.height + paddingPx * 2
  return {
    type: 'formula',
    options: {
      x: pxToInch(text.x),
      y: pxToInch(top),
      w: pxToInch(text.width),
      h: pxToInch(height),
      fontSize: pxToPt(text.fontSize),
      color,
      align: 'center',
      omml,
      objectName: text.id,
      // Phase 1: surface the formula's baseline so callers can
      // align the next text row without a re-measurement.
      baseline
    }
  } as ConvertedFormula & { options: ConvertedFormula['options'] & { baseline: { ascent: number; descent: number } } }
}

export function convertMixedTextToFragments(text: TextElement): Array<ConvertedFormula | {
  type: 'text'
  text: string
  options: PptxGenJS.TextPropsOptions
}> | null {
  const segments = extractInlineFormulaSegments(text.text)
  if (!segments) {
    return null
  }

  const anchorX = text.textAnchor === 'middle'
    ? text.x + text.width / 2
    : text.textAnchor === 'end'
      ? text.x + text.width
      : text.x

  // Compute each formula segment's metrics up front so we can
  // emit a stable layout (no second pass over the same SVG
  // text element). The height is clamped to `text.height * 0.95`
  // inside `getInlineFormulaMetrics` so display-style formulas
  // (\frac, \int, matrices, …) never grow the row.
  const formulaMetrics = new Map<number, InlineLayoutMetrics>()
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type === 'formula') {
      formulaMetrics.set(i, getInlineFormulaMetrics(text, segments[i].source))
    }
  }

  const widths = segments.map((segment, i) => (
    segment.type === 'text'
      ? estimateInlineTextWidth(segment.source, text.fontSize, text.letterSpacing)
      : formulaMetrics.get(i)!.width
  ))

  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  const startX = text.textAnchor === 'middle'
    ? anchorX - totalWidth / 2
    : text.textAnchor === 'end'
      ? anchorX - totalWidth
      : text.x

  let cursorX = startX
  const fragments: Array<ConvertedFormula | {
    type: 'text'
    text: string
    options: PptxGenJS.TextPropsOptions
  }> = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const width = widths[i]

    if (segment.type === 'text') {
      // Inline text segments next to a formula: still need the
      // CJK-correct font face so a label like "当 x = 2 时" renders
      // with the East-Asian face and not the system default.
      const inlineBridge = resolveFontBridge(text.fontFamily)
      const inlineFontFace = containsCjk(segment.source)
        ? inlineBridge.pptx.eastAsia
        : inlineBridge.pptx.latin
      fragments.push({
        type: 'text',
        text: segment.source,
        options: {
          fontFace: inlineFontFace,
          fontSize: pxToPt(text.fontSize),
          bold: fontWeightToBool(text.fontWeight),
          italic: fontStyleToBool(text.fontStyle),
          x: pxToInch(cursorX),
          y: pxToInch(text.y),
          w: pxToInch(width),
          h: pxToInch(text.height),
          margin: 0,
          color: convertFillToColor(text.fill),
          align: 'left',
          valign: 'top'
        }
      })
    } else {
      const metrics = formulaMetrics.get(i)!
      // Phase 1: nudge values now live in the centralised BASELINE
      // table and are expressed in *em* units; convert to inches
      // against the metrics' own font size so the offset scales with
      // the formula (a 0.14em nudge on a 28-pt formula is wider than
      // on a 14-pt one).
      const nudgeXPx = metrics.fontSize * currentFormulaNudge.x
      const nudgeYPx = metrics.fontSize * currentFormulaNudge.y
      const formula = convertTextToFormula({
        ...text,
        text: `$${segment.source}$`,
        x: cursorX + nudgeXPx,
        y: text.y + nudgeYPx,
        width: metrics.width,
        height: metrics.h,
        fontSize: metrics.fontSize,
        textAnchor: 'start',
        textAlign: 'left'
      })
      if (formula) {
        formula.options.align = 'left'
        fragments.push(formula)
      }
    }

    cursorX += width
  }

  return fragments
}
