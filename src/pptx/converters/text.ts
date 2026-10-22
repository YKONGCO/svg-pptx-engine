// Text Converter - Converts SIF text elements to pptxgenjs text

import PptxGenJS from 'pptxgenjs'
import type { TextElement, RichTextElement } from '../../sif/types/elements/text'
import type { Fill, SolidFill, GradientFill } from '../../sif/types/style/fill'
import type { Stroke } from '../../sif/types/style/stroke'
import {
  hexToPptxColor,
  opacityToTransparency,
  pxToInch,
  pxToPt,
  fontWeightToBool,
  fontStyleToBool,
  PX_TO_PT,
  textAlignToPptx,
  verticalAlignToPptx
} from '../utils'
import { convertMixedTextToFragments, convertTextToFormula, type ConvertedFormula } from '../utils/formula'
import { distributeTextAlongPath, pathArcLength } from '../utils/text-path'
import { BASELINE } from '../utils/baseline'
import { containsCjk, resolveFontBridge } from '../../utils/font'
import { convertEffect } from './shape'

/**
 * Convert text fill to pptxgenjs color
 */
export function convertTextFill(fill: Fill): string {
  if (fill.type === 'solid') {
    const solid = fill as SolidFill
    return hexToPptxColor(solid.color)
  }

  if (fill.type === 'gradient') {
    const gradientFill = fill as GradientFill
    if (gradientFill.gradient.stops.length > 0) {
      return hexToPptxColor(gradientFill.gradient.stops[0].color)
    }
  }

  return '000000'
}

/**
 * Resolve a text-stroke (outline) color. Returns `undefined` for
 * gradient strokes — PPTX's `<a:rPr><a:ln>` doesn't carry a
 * gradient fill, so we skip rather than emit a misleading solid
 * approximation. Caller is expected to fall back to no outline in
 * that case (the user can fix the SVG with a solid color).
 */
function convertStrokeOutlineColor(stroke: Stroke): string | undefined {
  if (stroke.type === 'gradient') return undefined
  if (!stroke.color) return undefined
  return hexToPptxColor(stroke.color)
}

/**
 * Text conversion result
 */
export interface ConvertedText {
  type: 'text'
  text: string | PptxGenJS.TextProps[]
  options: PptxGenJS.TextPropsOptions
}

export type ConvertedTextLike = ConvertedText | ConvertedFormula
export interface ConvertedTextFragments {
  type: 'fragments'
  items: ConvertedTextLike[]
}
export type ConvertedTextOutput = ConvertedTextLike | ConvertedTextFragments

/**
 * Choose the right PPTX `fontFace` for a run. The SIF `fontFamily`
 * is now the resolved CSS chain (e.g.
 * `"Microsoft YaHei", "PingFang SC", ...`) so we look at the
 * bridge to extract the East-Asian face when the run contains
 * CJK characters and the Latin face otherwise. Falls back to the
 * text-element default when the run doesn't override the family.
 */
function pickRunPptxFontFace(
  runFamily: string | undefined,
  textFamily: string,
  runText: string
): string {
  const raw = runFamily || textFamily
  const bridge = resolveFontBridge(raw)
  return containsCjk(runText) ? bridge.pptx.eastAsia : bridge.pptx.latin
}

function convertTextRun(text: TextElement, run: RichTextElement['runs'][number]): PptxGenJS.TextProps {
  const options: PptxGenJS.TextPropsOptions = {
    fontFace: pickRunPptxFontFace(run.fontFamily, text.fontFamily, run.text),
    fontSize: pxToPt(run.fontSize || text.fontSize),
    bold: fontWeightToBool(run.fontWeight ?? text.fontWeight),
    italic: fontStyleToBool(run.fontStyle ?? text.fontStyle),
    color: run.fill ? convertTextFill(run.fill) : convertTextFill(text.fill)
  }

  if (run.decoration?.underline) {
    options.underline = { style: 'sng' }
  }

  if (run.decoration?.lineThrough) {
    options.strike = true
  }

  // Phase 0.2B: per-run extensions sourced from <tspan>.
  if (run.rotate !== undefined && run.rotate !== 0) {
    // pptxgenjs accepts integer rotation on TextProps; non-integer
    // rotations are clamped by PowerPoint anyway.
    ;(options as PptxGenJS.TextPropsOptions & { rotate?: number }).rotate = run.rotate
  }

  if (run.baselineShift === 'super') {
    options.superscript = true
  } else if (run.baselineShift === 'sub') {
    options.subscript = true
  } else if (typeof run.baselineShift === 'number' && run.baselineShift !== 0) {
    if (run.baselineShift > 0) options.superscript = true
    else options.subscript = true
  }

  if (run.textLength && run.textLength > 0) {
    // Translate textLength into PPTX charSpacing. Same clamp as the
    // element-level path so a single overlong run doesn't wrap.
    const runFontSize = run.fontSize || text.fontSize
    const naturalWidth = estimateRunWidth(run.text, runFontSize)
    if (naturalWidth > 0) {
      const deltaPx = (run.textLength - naturalWidth) / Math.max(run.text.length - 1, 1)
      const cap = runFontSize / 4
      const clamped = Math.max(-cap, Math.min(cap, deltaPx))
      options.charSpacing = pxToPt(clamped)
    }
  }

  // Phase 0.2B v3: `\n` inside `<a:t>` is not honoured by PowerPoint;
  // pptxgenjs exposes `breakLine: true` which emits an `<a:br/>` after
  // the run. Strip the literal newline and set the option so the
  // foreignObject's paragraph breaks survive into the rendered slide.
  let runText = run.text
  if (runText.includes('\n')) {
    // If the whole run is just whitespace + newline, emit a pure
    // line break with no text content.
    if (/^\s*\n\s*$/.test(runText)) {
      ;(options as PptxGenJS.TextPropsOptions & { breakLine?: boolean }).breakLine = true
      runText = ''
    } else {
      // Strip trailing newline (turn it into the line break) but keep
      // leading text. Pre-newline content stays in this run; the
      // breakLine flag marks the paragraph boundary after it.
      const trimmed = runText.replace(/\n+\s*$/, '')
      if (trimmed.length < runText.length) {
        ;(options as PptxGenJS.TextPropsOptions & { breakLine?: boolean }).breakLine = true
      }
      runText = trimmed
    }
  }

  return {
    text: runText,
    options
  }
}

/**
 * Phase 0.2B helper: estimate a run's natural width in pixels, matching
 * the heuristic in `src/svg/converters/text.ts:estimateTextWidth` so the
 * textLength → charSpacing calculation lands close to the SVG renderer's
 * expectation.
 */
function estimateRunWidth(text: string, fontSize: number): number {
  let width = 0
  for (const char of text) {
    if (/\s/.test(char)) width += fontSize * 0.4
    else if (/[⺀-鿿豈-﫿]/.test(char)) width += fontSize * 1.28
    else if (/[A-Z0-9]/.test(char)) width += fontSize * 0.78
    else width += fontSize * 0.7
  }
  return width
}

/**
 * Convert text element to pptxgenjs text
 */
export function convertText(text: TextElement, hyperlink?: PptxGenJS.HyperlinkProps): ConvertedText {
  let x = text.x
  let align = textAlignToPptx(text.textAlign)

  if (text.textAnchor === 'middle' && text.width > 0) {
    align = 'center'
  } else if (text.textAnchor === 'end' && text.width > 0) {
    align = 'right'
  }

  const textOptions: PptxGenJS.TextPropsOptions = {
    // Element-level font face. We pick the East-Asian face when the
    // text actually contains CJK — otherwise PowerPoint would
    // substitute the system CJK font and break visual fidelity.
    // For pure-Latin text we use the Latin face so author-specified
    // monospace / Times fall through correctly.
    fontFace: pickRunPptxFontFace(undefined, text.fontFamily, text.text ?? ''),
    fontSize: pxToPt(text.fontSize),
    bold: fontWeightToBool(text.fontWeight),
    italic: fontStyleToBool(text.fontStyle),
    // `fill.type === 'none'` (e.g. SVG `fill="none"` for outlined
    // text) — pptxgenjs always emits `<a:solidFill>` on a run when
    // `color` is set, and there's no native `noFill` switch for
    // text runs. We force 100% transparency so the outline shows
    // through cleanly while keeping the underlying run valid.
    // Any other fill (solid, gradient) still gets a concrete color.
    ...(text.fill.type === 'none'
      ? { color: '000000', transparency: 100 }
      : { color: convertTextFill(text.fill) }),
    align,
    valign: verticalAlignToPptx(text.verticalAlign),
    // Position and size - critical for proper rendering
    x: pxToInch(x),
    y: pxToInch(text.y),
    w: pxToInch(text.width),
    h: pxToInch(text.height),
    // Remove default margin (PowerPoint defaults to "Normal" [3.5, 7.0, 3.5, 7.0] points)
    margin: 0,
    // Lazy fit: emit `<a:normAutofit/>` so PowerPoint shrinks the
    // fontSize on overflow instead of clipping. Engine-measured
    // text boxes are sized to the natural width, so this is a
    // no-op for short text and only kicks in when a layout pass
    // (or textLength) constrains the box narrower than the string.
    fit: 'shrink'
  }

  if (text.marginLeft !== undefined || text.marginRight !== undefined) {
    textOptions.margin = [0, pxToPt(text.marginRight ?? 0), 0, pxToPt(text.marginLeft ?? 0)]
  }

  // Line spacing - PPTX lineSpacingMultiple is a ratio (e.g., 1.5 for 150%)
  if (text.lineHeight) {
    textOptions.lineSpacingMultiple = text.lineHeight / text.fontSize
  }

  // Letter spacing - PPTX charSpacing is in points (pt)
  // SIF letterSpacing is in pixels (px), so convert: px * 0.75 = pt
  if (text.letterSpacing) {
    textOptions.charSpacing = pxToPt(text.letterSpacing)
  }

  // Phase 0.2B: element-level `textLength` overrides letterSpacing —
  // SVG `textLength` is a hard constraint and "should" win over hint
  // attributes. v2: clamp the resulting charSpacing to ±fontSize/4 so
  // a too-large target doesn't blow the run onto a second line in
  // PowerPoint (PPTX wraps long strings even with explicit charSpacing).
  if (text.textLength && text.textLength > 0 && text.text) {
    const naturalWidth = estimateRunWidth(text.text, text.fontSize)
    if (naturalWidth > 0 && text.text.length > 1) {
      const deltaPx = (text.textLength - naturalWidth) / (text.text.length - 1)
      const cap = text.fontSize / 4
      const clamped = Math.max(-cap, Math.min(cap, deltaPx))
      textOptions.charSpacing = pxToPt(clamped)
      if (text.textLength > naturalWidth) {
        textOptions.w = pxToInch(text.textLength * 1.05)
      }
    }
  }

  // Text rotation - 90° and 270° are vertical text
  // Other rotations use the rotate property
  if (text.textRotation !== undefined) {
    if (text.textRotation === 90) {
      textOptions.vert = 'vert'
    } else if (text.textRotation === 270) {
      textOptions.vert = 'vert270'
    } else if (text.textRotation !== 0) {
      // Use rotate for other angles
      textOptions.rotate = text.textRotation
    }
  }

  // Text outline (stroke). SVG allows `stroke` on `<text>` for
  // hollow / outlined text; PPTX's equivalent is the run-property
  // `<a:ln>`, exposed by pptxgenjs as `outline: { color, size }`.
  // Width is in points (pptxgenjs's `valToPpts` divides by 100 on
  // emission, so we feed it points not EMUs).
  if (text.stroke) {
    const outlineColor = convertStrokeOutlineColor(text.stroke)
    if (outlineColor) {
      const widthPt = Math.max(0.25, (text.stroke.width || 1) * PX_TO_PT)
      textOptions.outline = { color: outlineColor, size: widthPt }
    }
  }

  // Handle decoration - underline and lineThrough
  if (text.decoration) {
    if (text.decoration.underline) {
      textOptions.underline = { style: 'sng' }
      if (text.decoration.underlineColor) {
        textOptions.underline.color = hexToPptxColor(text.decoration.underlineColor)
      }
    }
    if (text.decoration.lineThrough) {
      textOptions.strike = true
    }
    if (text.decoration.overline) {
      // PPTX doesn't support overline directly
      console.warn('Overline decoration is not supported in PPTX')
    }
  }

  // Apply opacity
  if (text.opacity !== undefined && text.opacity < 1) {
    const transparency = opacityToTransparency(text.opacity)
    if (transparency !== undefined) {
      textOptions.transparency = transparency
    }
  }

  // Handle rotation from transform
  if (text.transform?.rotate !== undefined) {
    textOptions.rotate = text.transform.rotate
  }

  if (hyperlink) {
    textOptions.hyperlink = hyperlink
  }

  // Phase 5.1: SVG text-level filter effects (e.g. feDropShadow on a
  // <text> element) carry through the SIF `effect` field. PPTX's
  // text run supports an outer shadow via TextPropsOptions.shadow,
  // so we forward the converted effect. Blur / colour-matrix
  // effects are dropped — they have no native text equivalent.
  if (text.effect) {
    const shadow = convertEffect(text.effect)
    if (shadow) {
      textOptions.shadow = shadow
    }
  }

  // Indent using indentLevel
  if (text.indent) {
    textOptions.indentLevel = Math.floor(text.indent / 20) // Approximate conversion
  }

  const richText = (text as RichTextElement).runs
  const content = Array.isArray(richText) && richText.length > 0
    ? richText.map(run => convertTextRun(text, run))
    : text.text

  return {
    type: 'text',
    text: content,
    options: textOptions
  }
}

export function convertTextOrFormula(
  text: TextElement,
  hyperlink?: PptxGenJS.HyperlinkProps
): ConvertedTextOutput {
  if (hyperlink) {
    return convertText(text, hyperlink)
  }

  // Phase 0.2B: SVG `<textPath>` — distribute characters along the path
  // and emit each one as its own text box (PPTX has no curved-text
  // primitive). Only triggers when the SVG converter resolved the
  // referenced path's `d`.
  if (text.textPath?.d) {
    const items = expandTextPathToFragments(text)
    if (items.length > 0) {
      return { type: 'fragments', items }
    }
  }

  // Phase 0.2B v3: if any run carries a per-run rotation, expand the
  // whole rich text to per-run text frames so each rotated run lives
  // in its own `<p:sp>` with its own `rot` attribute. PowerPoint has
  // no run-level rotation, so leaving it on a single text frame
  // silently drops the rotate.
  const rich = (text as RichTextElement).runs
  if (Array.isArray(rich) && rich.some(r => r.rotate !== undefined && r.rotate !== 0)) {
    const items = expandRotatedRunsToFragments(text, rich)
    if (items.length > 0) {
      return { type: 'fragments', items }
    }
  }

  const wholeFormula = convertTextToFormula(text)
  if (wholeFormula) {
    return wholeFormula
  }

  const fragments = convertMixedTextToFragments(text)
  if (fragments) {
    return { type: 'fragments', items: fragments }
  }

  return convertText(text, hyperlink)
}

/**
 * Phase 0.2B v3: explode a RichTextElement whose runs carry per-run
 * rotation into a sequence of single-run text frames laid out side by
 * side starting at the original text's anchor. Each rotated run gets
 * its own `rotate` value; non-rotated runs render straight.
 *
 * Layout is best-effort — we advance the cursor by each run's
 * estimated width, matching PowerPoint's default left-to-right text
 * flow within a paragraph. For runs with rotation, the run's frame
 * is centred on its current cursor position so the rotation pivots
 * around the run's centre (closer to SVG's "rotate around the glyph"
 * semantics than "rotate around the top-left").
 */
function expandRotatedRunsToFragments(
  text: TextElement,
  runs: RichTextElement['runs']
): ConvertedText[] {
  const items: ConvertedText[] = []
  let cursorX = text.x
  const baselineY = text.y
  for (const run of runs) {
    const runText = run.text
    if (!runText) continue
    const runFontSize = run.fontSize || text.fontSize
    // Phase 0.2B v4: drop the +0.4em padding that v3 used — it left
    // visible gaps between adjacent runs (especially noticeable in
    // panel 1 where "ROT", rotated "A", and "TE" no longer read as a
    // continuous word). Use the natural width with a tiny trailing
    // tracking fudge so we don't clip diacritics.
    const runWidth = estimateRunWidth(runText, runFontSize) + 1
    const runHeight = runFontSize * 1.2
    const baseOptions: PptxGenJS.TextPropsOptions = {
      fontFace: pickRunPptxFontFace(run.fontFamily, text.fontFamily, runText),
      fontSize: pxToPt(runFontSize),
      bold: fontWeightToBool(run.fontWeight ?? text.fontWeight),
      italic: fontStyleToBool(run.fontStyle ?? text.fontStyle),
      color: run.fill ? convertTextFill(run.fill) : convertTextFill(text.fill),
      margin: 0,
      align: 'left',
      valign: 'top',
      x: pxToInch(cursorX),
      y: pxToInch(baselineY),
      w: pxToInch(runWidth),
      h: pxToInch(runHeight),
    }
    if (run.rotate !== undefined && run.rotate !== 0) {
      ;(baseOptions as PptxGenJS.TextPropsOptions & { rotate?: number }).rotate = Math.round(run.rotate)
    }
    items.push({ type: 'text', text: runText, options: baseOptions })
    cursorX += runWidth
  }
  return items
}

/**
 * Phase 0.2B: turn `<textPath>` into a flat sequence of single-glyph
 * text boxes, each positioned and rotated to follow the referenced
 * path's tangent. Each glyph carries the same font / colour as the
 * source text element so a downstream renderer treats them as visually
 * coherent.
 *
 * Char advance is approximated as `fontSize * 0.6` (Latin) or
 * `fontSize * 1.0` (CJK). When the path is shorter than the total
 * advance, surplus glyphs land at the path's tail rather than being
 * dropped — surfacing the overflow visually beats a silent truncation.
 */
function expandTextPathToFragments(text: TextElement): ConvertedText[] {
  const { textPath, text: rawText, fontSize } = text
  if (!textPath?.d || !rawText) return []

  const chars = Array.from(rawText)
  if (chars.length === 0) return []

  // Phase 0.2B v4: revert the even-distribution behaviour from v3.
  // Even spacing was spreading short labels across the whole curve
  // (e.g. "FOLLOW" stretched across 250px when the natural width was
  // ~70px), which looks like SVG rendered the label on a much wider
  // path than the author intended. Use the natural per-char advance
  // and let the path end with whitespace; callers wanting a stretched
  // label can wrap the run with a `<text textLength="…">` on the
  // outer `<text>` element.
  const cjkCount = chars.filter(ch => /[⺀-鿿]/.test(ch)).length
  const advance = cjkCount > chars.length / 2 ? fontSize * 1.0 : fontSize * 0.6

  const samples = distributeTextAlongPath(rawText, textPath.d, textPath.startOffset || 0, advance)
  if (samples.length === 0) return []

  // Each glyph becomes its own text frame at (sample.x, sample.y) with
  // the local tangent as rotation. We size the frame to roughly one
  // character so PowerPoint doesn't auto-wrap.
  const glyphBoxPx = fontSize * 1.4
  const results: ConvertedText[] = []
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    const glyph = chars[i]
    const options: PptxGenJS.TextPropsOptions = {
      // Per-glyph face selection on a textPath. Each glyph is its
      // own text frame, so we re-evaluate the bridge for the single
      // character — CJK glyphs get the East-Asian face and Latin
      // glyphs get the Latin face, matching what PowerPoint would
      // do if it had per-character run support.
      fontFace: pickRunPptxFontFace(undefined, text.fontFamily, glyph),
      fontSize: pxToPt(fontSize),
      bold: fontWeightToBool(text.fontWeight),
      italic: fontStyleToBool(text.fontStyle),
      color: convertTextFill(text.fill),
      // Phase 1: SVG places the glyph so its baseline sits on the
      // path's sample point; PPTX's `valign: 'middle'` puts the
      // glyph box's centre on the sample, which is 0.5em below the
      // SVG intent. Anchor to the top of the box and subtract the
      // ascent so the visual baseline lands on the curve.
      x: pxToInch(sample.x - glyphBoxPx / 2),
      y: pxToInch(sample.y - fontSize * BASELINE.TEXT_ASCENT_RATIO),
      w: pxToInch(glyphBoxPx),
      h: pxToInch(glyphBoxPx),
      margin: 0,
      align: 'center',
      valign: 'top',
      rotate: Math.round(sample.angle)
    }
    if (text.opacity !== undefined && text.opacity < 1) {
      const transparency = opacityToTransparency(text.opacity)
      if (transparency !== undefined) options.transparency = transparency
    }
    results.push({ type: 'text', text: glyph, options })
  }
  return results
}

/**
 * Phase 0.2B: total path length helper exposed for callers that want to
 * pre-validate a `<textPath>` against the source string before falling
 * back to a straight-line render.
 */
export function textPathArcLength(text: TextElement): number {
  return text.textPath?.d ? pathArcLength(text.textPath.d) : 0
}

/**
 * Convert rich text element (with runs) to pptxgenjs text
 */
export function convertRichText(text: RichTextElement): ConvertedText[] {
  if (!text.runs || text.runs.length === 0) {
    return [convertText(text)]
  }

  const results: ConvertedText[] = []

  for (const run of text.runs) {
    const runOptions: PptxGenJS.TextPropsOptions = {
      fontFace: pickRunPptxFontFace(run.fontFamily, text.fontFamily, run.text),
      fontSize: pxToPt(run.fontSize || text.fontSize),
      bold: fontWeightToBool(run.fontWeight),
      italic: fontStyleToBool(run.fontStyle),
      color: run.fill ? convertTextFill(run.fill) : convertTextFill(text.fill)
    }

    if (run.decoration?.underline) {
      runOptions.underline = { style: 'sng' }
    }

    results.push({
      type: 'text',
      text: run.text,
      options: runOptions
    })
  }

  return results
}
