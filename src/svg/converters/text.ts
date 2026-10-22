// Text converter - converts SVG text elements to SIF TextElement
import type { TextElement, RichTextElement, TextRun, FontWeight, FontStyle, TextAnchor, VerticalAlign } from '../../sif/types/elements/text'
import type { Fill } from '../../sif/types/style/fill'
import type { Stroke } from '../../sif/types/style/stroke'
import type { LinearGradient, RadialGradient } from '../../sif/types/style/gradient'
import { parseColor, parseOpacity } from './color'
import { getAttr, getTextContent, getOrderedMixedChildren } from '../parser'
import { applyMatrixToPoint, decomposeMatrix, identityMatrix, parseTransformToMatrix, type TransformMatrix } from './group'
import { extractStroke, transformPathData } from './shape'
import { resolveWebFontFamily } from '../../utils/font'

export interface TextConversionOptions {
  gradientMap?: Map<string, LinearGradient | RadialGradient>
  transformMatrix?: TransformMatrix
  /** Phase 1.5: defs map used to resolve <textPath href="#id">. */
  defsMap?: Map<string, Record<string, unknown>>
}

const TEXT_ASCENT_RATIO = 0.8

export function convertText(element: Record<string, unknown>, id: string, options?: TextConversionOptions): TextElement | RichTextElement {
  const matrix = options?.transformMatrix || parseTransformToMatrix(getAttr(element, 'transform')) || identityMatrix()
  const basePoint = applyMatrixToPoint(
    parseFloat(getAttr(element, 'x') || '0'),
    parseFloat(getAttr(element, 'y') || '0'),
    matrix
  )
  // Normalise the font name to a CJK-first CSS fallback chain at the
  // parse boundary. The raw authoring name (e.g. `"PingFang SC"`)
  // is replaced with a full chain so the SIF carries the richest
  // possible info — the PPTX layer then picks the East-Asian face
  // per run, and any web / SVG preview just uses the chain verbatim.
  const fontFamily = resolveWebFontFamily(getAttr(element, 'font-family'))
  const fontSize = scaleFontSize(parseFloat(getAttr(element, 'font-size') || '16'), matrix)
  const fontWeight = parseFontWeight(getAttr(element, 'font-weight'))
  const fontStyle = parseFontStyle(getAttr(element, 'font-style'))
  const textAnchor = parseTextAnchor(getAttr(element, 'text-anchor'))
  const verticalAlign = parseVerticalAlign(getAttr(element, 'dominant-baseline'))
  const fill = extractFill(element, options?.gradientMap)
  const stroke = extractStroke(element, options?.gradientMap)
  const preserveWhitespace = parsePreserveWhitespace(getAttr(element, 'xml:space')) ?? false
  const textContent = extractTextContent(element, preserveWhitespace)
  const tspanChildren = getTspanChildren(element)
  const opacity = parseOpacity(getAttr(element, 'opacity'))
  const textRotation = normalizeRotation(decomposeMatrix(matrix).rotation)
  const lineHeight = getOptionalNumberAttr(element, 'line-height')
  const textLengthValue = getOptionalNumberAttr(element, 'textLength')
  const lengthAdjust = parseLengthAdjust(getAttr(element, 'lengthAdjust'))

  if (tspanChildren.length > 0) {
    const richText = convertRichText(element, id, textContent, tspanChildren, {
      x: basePoint.x,
      y: basePoint.y,
      fontFamily,
      fontSize,
      fill,
      stroke,
      fontWeight,
      fontStyle,
      textAnchor,
      verticalAlign,
      lineHeight,
      gradientMap: options?.gradientMap,
      matrix,
      preserveWhitespace
    })

    if (opacity !== undefined) richText.opacity = opacity
    if (preserveWhitespace) richText.preserveWhitespace = true
    if (textLengthValue !== undefined && textLengthValue > 0) {
      richText.textLength = textLengthValue
      if (lengthAdjust) richText.lengthAdjust = lengthAdjust
    }
    applyTextMetadata(richText, element)
    return richText
  }

  // Phase 0.2B v2: even with no <tspan>, a `<text>` may carry pure
  // text. The path below (TextElement, single block) handles that.

  const textElement: TextElement = {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    text: textContent,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    fill,
    stroke,
    textAlign: mapTextAlign(textAnchor),
    textAnchor,
    verticalAlign,
    lineHeight,
    letterSpacing: getOptionalNumberAttr(element, 'letter-spacing')
  }

  const metrics = resolveTextBoxMetrics(basePoint.x, basePoint.y, estimateTextWidth(textContent, fontSize), estimateTextHeight(fontSize), fontSize, textAnchor, verticalAlign)
  textElement.x = metrics.x
  textElement.y = metrics.y
  textElement.width = metrics.width
  textElement.height = metrics.height

  // Phase 1.5: <textPath> support. If the <text> element wraps a
  // <textPath href="#id"> child, look up the path's `d` from the
  // defs map and stamp it on the text element. Phase 0.2B v2: bake
  // the ambient transformMatrix into the path data so downstream
  // text-on-path sampling lands the glyphs in absolute coordinates
  // (otherwise group translates push the text into the wrong panel).
  const textPathInfo = resolveTextPath(element, options?.defsMap, matrix)
  if (textPathInfo) {
    textElement.textPath = textPathInfo
  }

  if (opacity !== undefined) textElement.opacity = opacity
  if (textRotation !== undefined) textElement.textRotation = textRotation
  if (preserveWhitespace) textElement.preserveWhitespace = true
  if (textLengthValue !== undefined && textLengthValue > 0) {
    textElement.textLength = textLengthValue
    if (lengthAdjust) textElement.lengthAdjust = lengthAdjust
  }
  applyTextMetadata(textElement, element)
  return textElement
}

/**
 * Resolve a `<textPath href="#id">` child of a `<text>` element. The
 * referenced path's `d` attribute is read from the defs map and
 * returned alongside the href and start offset. Returns `undefined`
 * if no textPath child is present or the href cannot be resolved.
 */
function resolveTextPath(
  element: Record<string, unknown>,
  defsMap?: Map<string, Record<string, unknown>>,
  matrix?: TransformMatrix
): TextElement['textPath'] {
  if (!defsMap) return undefined
  const child = element.textPath
  if (!child || typeof child !== 'object') return undefined
  const childObj = child as Record<string, unknown>
  const hrefRaw = getAttr(childObj, 'href') ?? getAttr(childObj, 'xlink:href')
  if (!hrefRaw) return undefined
  const href = hrefRaw.replace(/^#/, '')
  const target = defsMap.get(href)
  if (!target) return undefined
  const rawD = getAttr(target, 'd')
  if (!rawD) return undefined
  // Phase 0.2B v2: pre-bake the ambient transform so the sampler can
  // treat the path's coordinates as absolute SVG user units. Without
  // this, a `<g transform="translate(20,420)">` parent leaves the
  // textPath glyphs at the un-translated origin.
  const d = matrix ? transformPathData(rawD, matrix) : rawD
  const startOffset = parseFloat(getAttr(childObj, 'startOffset') ?? '0') || 0
  return { href, d, startOffset }
}

function convertRichText(
  element: Record<string, unknown>,
  id: string,
  baseText: string,
  tspanChildren: Record<string, unknown>[],
  baseProps: {
    x: number
    y: number
    fontFamily: string
    fontSize: number
    fill: Fill
    stroke?: Stroke
    fontWeight?: FontWeight
    fontStyle?: FontStyle
    textAnchor?: TextAnchor
    verticalAlign?: VerticalAlign
    lineHeight?: number
    gradientMap?: Map<string, LinearGradient | RadialGradient>
    matrix: TransformMatrix
    preserveWhitespace?: boolean
  }
): RichTextElement {
  const runs: TextRun[] = []
  const lines: string[] = []
  let currentLineText = ''
  let currentLineWidth = 0
  let maxWidth = 0
  let lineCount = 1

  // Phase 0.2B v2: prefer the ordered (mixed-content) child list so a
  // `<text>H<tspan>2</tspan>SO</text>` keeps "H", "2", "SO" in
  // document order. Falls back to the legacy tspan-only walk for old
  // call sites where the parser didn't capture ordered children.
  const ordered = getOrderedMixedChildren(element)
  const useOrdered = ordered && ordered.some(c => c.tag === 'tspan' || c.tag === 'textPath' || c.tag === '#text')

  if (useOrdered) {
    ordered!.forEach((entry, index) => {
      if (entry.tag === '#text') {
        let raw = entry.text ?? ''
        // Phase 0.2B v3: SVG default whitespace rule — collapse
        // consecutive whitespace (incl. source-code indentation
        // around tspans) to a single space when xml:space != preserve.
        if (!baseProps.preserveWhitespace) {
          raw = raw.replace(/\s+/g, ' ')
          // Drop pure-whitespace runs that resulted from indentation;
          // keep a single leading/trailing space so word boundaries
          // survive (`H<tspan>2</tspan>SO` should keep "H", "SO").
          if (/^\s+$/.test(raw)) raw = ' '
        }
        if (!raw) return
        runs.push({
          text: raw,
          fontFamily: baseProps.fontFamily,
          fontSize: baseProps.fontSize,
          fontWeight: baseProps.fontWeight,
          fontStyle: baseProps.fontStyle,
          fill: baseProps.fill
        })
        currentLineText += raw
        currentLineWidth += estimateTextWidth(raw, baseProps.fontSize)
        return
      }

      if (entry.tag !== 'tspan') return

      const tspan = entry.node
      const tspanPreserve = parsePreserveWhitespace(getAttr(tspan, 'xml:space')) ?? baseProps.preserveWhitespace
      const rawText = extractTextContent(tspan, tspanPreserve)
      if (!rawText) return
      const startsNewLine = index > 0 && startsNewTextLine(tspan)
      if (startsNewLine) {
        lines.push(currentLineText)
        maxWidth = Math.max(maxWidth, currentLineWidth)
        currentLineText = ''
        currentLineWidth = 0
        lineCount++
      }

      const run = buildTspanRun(tspan, rawText, tspanPreserve, baseProps)
      runs.push(run)
      currentLineText += rawText
      currentLineWidth += estimateTextWidth(rawText, run.fontSize ?? baseProps.fontSize)
    })
  } else {
    tspanChildren.forEach((tspan, index) => {
      const tspanPreserve = parsePreserveWhitespace(getAttr(tspan, 'xml:space')) ?? baseProps.preserveWhitespace
      const rawText = extractTextContent(tspan, tspanPreserve)
      if (!rawText) return
      const startsNewLine = index > 0 && startsNewTextLine(tspan)

      if (startsNewLine) {
        lines.push(currentLineText)
        maxWidth = Math.max(maxWidth, currentLineWidth)
        currentLineText = ''
        currentLineWidth = 0
        lineCount++
      }

      const run = buildTspanRun(tspan, rawText, tspanPreserve, baseProps)
      runs.push(run)
      currentLineText += rawText
      currentLineWidth += estimateTextWidth(rawText, run.fontSize ?? baseProps.fontSize)
    })
  }

  lines.push(currentLineText)
  maxWidth = Math.max(maxWidth, currentLineWidth)

  const effectiveLineHeight = baseProps.lineHeight ?? estimateTextHeight(baseProps.fontSize)
  const height = effectiveLineHeight * lineCount
  const metrics = resolveTextBoxMetrics(
    baseProps.x,
    baseProps.y,
    maxWidth,
    height,
    baseProps.fontSize,
    baseProps.textAnchor,
    baseProps.verticalAlign
  )

  return {
    id,
    type: 'text',
    x: metrics.x,
    y: metrics.y,
    width: metrics.width,
    height: metrics.height,
    text: lines.join('\n') || baseText,
    runs,
    fontFamily: baseProps.fontFamily,
    fontSize: baseProps.fontSize,
    fill: baseProps.fill,
    stroke: baseProps.stroke,
    textAlign: mapTextAlign(baseProps.textAnchor),
    textAnchor: baseProps.textAnchor,
    verticalAlign: baseProps.verticalAlign,
    lineHeight: baseProps.lineHeight
  }
}

/**
 * Extract a `TextRun` from a `<tspan>` node, applying all per-run
 * extensions (rotate / baseline-shift / textLength / xml:space).
 * Pulled out so the ordered-mixed-content path and the legacy
 * tspan-only path share the per-run logic.
 */
function buildTspanRun(
  tspan: Record<string, unknown>,
  text: string,
  preserveWhitespace: boolean | undefined,
  baseProps: {
    fontFamily: string
    fontSize: number
    fill: Fill
    fontWeight?: FontWeight
    fontStyle?: FontStyle
    gradientMap?: Map<string, LinearGradient | RadialGradient>
    matrix: TransformMatrix
  }
): TextRun {
  const runFontSize = scaleFontSize(
    parseFloat(getAttr(tspan, 'font-size') || String(baseProps.fontSize)),
    baseProps.matrix
  )
  const runFontFamily = getAttr(tspan, 'font-family')
  const run: TextRun = {
    text,
    fontFamily: runFontFamily ? resolveWebFontFamily(runFontFamily) : baseProps.fontFamily,
    fontSize: runFontSize,
    fontWeight: parseFontWeight(getAttr(tspan, 'font-weight')) || baseProps.fontWeight,
    fontStyle: parseFontStyle(getAttr(tspan, 'font-style')) || baseProps.fontStyle,
    fill: extractFill(tspan, baseProps.gradientMap) || baseProps.fill
  }
  const runRotate = parseFirstRotate(getAttr(tspan, 'rotate'))
  if (runRotate !== undefined) run.rotate = runRotate
  const baselineShift = parseBaselineShift(getAttr(tspan, 'baseline-shift'))
  if (baselineShift !== undefined) run.baselineShift = baselineShift
  const runLength = getOptionalNumberAttr(tspan, 'textLength')
  if (runLength !== undefined && runLength > 0) {
    run.textLength = runLength
    const runAdjust = parseLengthAdjust(getAttr(tspan, 'lengthAdjust'))
    if (runAdjust) run.lengthAdjust = runAdjust
  }
  if (preserveWhitespace) run.preserveWhitespace = true
  return run
}

function resolveTextBoxMetrics(
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
  fontSize: number,
  textAnchor?: TextAnchor,
  verticalAlign?: VerticalAlign
): { x: number; y: number; width: number; height: number } {
  return {
    x: resolveTextBoxX(anchorX, width, textAnchor),
    y: resolveTextBoxY(anchorY, height, fontSize, verticalAlign),
    width,
    height
  }
}

function resolveTextBoxX(anchorX: number, width: number, textAnchor?: TextAnchor): number {
  switch (textAnchor) {
    case 'middle':
      return anchorX - width / 2
    case 'end':
      return anchorX - width
    default:
      return anchorX
  }
}

function resolveTextBoxY(anchorY: number, height: number, fontSize: number, verticalAlign?: VerticalAlign): number {
  switch (verticalAlign) {
    case 'top':
      return anchorY
    case 'middle':
      return anchorY - height / 2
    case 'bottom':
      return anchorY - height
    case 'baseline':
    default:
      return anchorY - fontSize * TEXT_ASCENT_RATIO
  }
}

function extractFill(
  element: Record<string, unknown>,
  gradientMap?: Map<string, LinearGradient | RadialGradient>
): Fill {
  const fill = getAttr(element, 'fill')
  if (fill === 'none') {
    return { type: 'none' }
  }

  if (fill?.startsWith('url(#')) {
    const gradientId = fill.slice(5, -1)
    const gradient = gradientMap?.get(gradientId)
    if (gradient) {
      return {
        type: 'gradient',
        gradient,
        opacity: parseOpacity(getAttr(element, 'fill-opacity'))
      }
    }
  }

  if (fill && fill !== 'inherit') {
    return {
      type: 'solid',
      color: parseColor(fill),
      opacity: parseOpacity(getAttr(element, 'fill-opacity'))
    }
  }

  return {
    type: 'solid',
    color: '#000000'
  }
}

function getTspanChildren(element: Record<string, unknown>): Record<string, unknown>[] {
  const value = element.tspan
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return { '#text': item }
        if (typeof item === 'number' || typeof item === 'boolean') return { '#text': String(item) }
        if (item && typeof item === 'object') return item as Record<string, unknown>
        return undefined
      })
      .filter(Boolean) as Record<string, unknown>[]
  }
  if (typeof value === 'object') {
    return [value as Record<string, unknown>]
  }
  if (typeof value === 'string') {
    return [{ '#text': value }]
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [{ '#text': String(value) }]
  }
  return []
}

function extractTextContent(element: Record<string, unknown>, preserveWhitespace = false): string {
  const parts: string[] = []
  const direct = getTextContent(element)
  if (direct) parts.push(direct)

  const tspans = getTspanChildren(element)
  for (const tspan of tspans) {
    const tspanText = getTextContent(tspan)
    if (tspanText) {
      parts.push(tspanText)
    }
  }

  // Phase 0.2B: `<textPath>` inside `<text>` is the SVG idiom for
  // text-on-path. Its text content is the visible string and needs to
  // appear in the SIF `text` field so the PPTX layer can distribute
  // glyphs along the path. Mirrors how tspan children are pulled in
  // above; textPath may itself contain tspans which we also harvest.
  const textPathChild = element.textPath
  if (textPathChild && typeof textPathChild === 'object') {
    const tp = textPathChild as Record<string, unknown>
    const tpDirect = getTextContent(tp)
    if (tpDirect) parts.push(tpDirect)
    for (const tspan of getTspanChildren(tp)) {
      const tspanText = getTextContent(tspan)
      if (tspanText) parts.push(tspanText)
    }
  }

  const joined = parts.join('')
  return preserveWhitespace ? joined : joined
}

function parseFontWeight(weight: string | undefined): FontWeight | undefined {
  if (!weight) return undefined
  if (['normal', 'bold', 'lighter', 'bolder'].includes(weight)) {
    return weight as FontWeight
  }
  const numeric = parseInt(weight, 10)
  return Number.isNaN(numeric) ? undefined : numeric
}

function parseFontStyle(style: string | undefined): FontStyle | undefined {
  if (!style) return undefined
  if (['normal', 'italic', 'oblique'].includes(style)) {
    return style as FontStyle
  }
  return undefined
}

function parseTextAnchor(anchor: string | undefined): TextAnchor | undefined {
  if (!anchor) return undefined
  if (['start', 'middle', 'end'].includes(anchor)) {
    return anchor as TextAnchor
  }
  return undefined
}

function parseVerticalAlign(value: string | undefined): VerticalAlign | undefined {
  if (!value) return undefined
  switch (value) {
    case 'middle':
    case 'central':
      return 'middle'
    case 'text-before-edge':
    case 'hanging':
      return 'top'
    case 'text-after-edge':
      return 'bottom'
    case 'baseline':
      return 'baseline'
    default:
      return undefined
  }
}

function mapTextAlign(anchor: TextAnchor | undefined): 'left' | 'center' | 'right' {
  switch (anchor) {
    case 'middle':
      return 'center'
    case 'end':
      return 'right'
    default:
      return 'left'
  }
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0
  for (const char of text) {
    if (/\s/.test(char)) {
      width += fontSize * 0.4
    } else if (/[\u2E80-\u9FFF\uF900-\uFAFF]/.test(char)) {
      width += fontSize * 1.28
    } else if (/[A-Z0-9]/.test(char)) {
      width += fontSize * 0.78
    } else {
      width += fontSize * 0.7
    }
  }
  return Math.max(width + fontSize * 0.9, fontSize * 1.8)
}

function estimateTextHeight(fontSize: number): number {
  return fontSize * 1.45
}

function startsNewTextLine(tspan: Record<string, unknown>): boolean {
  return getAttr(tspan, 'x') !== undefined ||
    getAttr(tspan, 'y') !== undefined ||
    getAttr(tspan, 'dx') === '0' && getAttr(tspan, 'dy') !== undefined ||
    getAttr(tspan, 'dy') !== undefined
}

function scaleFontSize(fontSize: number, matrix: TransformMatrix): number {
  const { scaleX, scaleY } = decomposeMatrix(matrix)
  const scale = ((Math.abs(scaleX) || 1) + (Math.abs(scaleY) || 1)) / 2
  return fontSize * scale
}

function normalizeRotation(rotation: number): number | undefined {
  return Math.abs(rotation) > 1e-6 ? rotation : undefined
}

function getOptionalNumberAttr(element: Record<string, unknown>, name: string): number | undefined {
  const value = getAttr(element, name)
  if (value === undefined) return undefined
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

function applyTextMetadata(element: TextElement | RichTextElement, source: Record<string, unknown>): void {
  const visibility = getAttr(source, 'visibility')
  if (visibility) {
    element.visible = visibility !== 'hidden' && visibility !== 'collapse'
  }
}

/**
 * Phase 0.2B: SVG `<tspan rotate>` accepts a per-character list (e.g.
 * `rotate="0 45 90"`). PPTX has no per-character rotation, so we collapse
 * to the first finite value — good enough for the common case of "rotate
 * this whole run". Returns `undefined` if no usable value.
 */
function parseFirstRotate(value: string | undefined): number | undefined {
  if (!value) return undefined
  for (const token of value.trim().split(/[\s,]+/)) {
    const parsed = parseFloat(token)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Phase 0.2B: SVG `baseline-shift` accepts `super` / `sub` / `baseline`
 * keywords or a length / percentage. We keep the keyword form intact
 * (the PPTX layer maps it to `superscript` / `subscript`), and a numeric
 * value is converted to a percentage of the em (positive = up).
 *   - "super" → 'super'
 *   - "sub" → 'sub'
 *   - "30%" → 30
 *   - "-15%" → -15
 *   - "5"  (length in user units) → 5 (interpreted as percent by renderer)
 */
function parseBaselineShift(value: string | undefined): 'super' | 'sub' | number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (trimmed === 'super') return 'super'
  if (trimmed === 'sub') return 'sub'
  if (trimmed === 'baseline' || trimmed === '0' || trimmed === '0%') return undefined
  if (trimmed.endsWith('%')) {
    const parsed = parseFloat(trimmed.slice(0, -1))
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const parsed = parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Phase 0.2B: SVG `lengthAdjust` is one of `spacing` (default) or
 * `spacingAndGlyphs`. Anything else is dropped.
 */
function parseLengthAdjust(value: string | undefined): 'spacing' | 'spacingAndGlyphs' | undefined {
  if (value === 'spacing' || value === 'spacingAndGlyphs') return value
  return undefined
}

/**
 * Phase 0.2B: SVG `xml:space` is one of `default` / `preserve`. Only
 * `preserve` produces a positive return; `default` and unset both
 * return `undefined` (so callers can fall back to an inherited setting).
 */
function parsePreserveWhitespace(value: string | undefined): boolean | undefined {
  if (value === 'preserve') return true
  if (value === 'default') return false
  return undefined
}
