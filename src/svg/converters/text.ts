// Text converter - converts SVG text elements to SIF TextElement
import type { TextElement, RichTextElement, TextRun, FontWeight, FontStyle, TextAnchor, VerticalAlign } from '../../sif/types/elements/text'
import type { Fill } from '../../sif/types/style/fill'
import type { LinearGradient, RadialGradient } from '../../sif/types/style/gradient'
import { parseColor, parseOpacity } from './color'
import { getAttr, getTextContent } from '../parser'
import { applyMatrixToPoint, decomposeMatrix, identityMatrix, parseTransformToMatrix, type TransformMatrix } from './group'

export interface TextConversionOptions {
  gradientMap?: Map<string, LinearGradient | RadialGradient>
  transformMatrix?: TransformMatrix
}

const TEXT_ASCENT_RATIO = 0.8

export function convertText(element: Record<string, unknown>, id: string, options?: TextConversionOptions): TextElement | RichTextElement {
  const matrix = options?.transformMatrix || parseTransformToMatrix(getAttr(element, 'transform')) || identityMatrix()
  const basePoint = applyMatrixToPoint(
    parseFloat(getAttr(element, 'x') || '0'),
    parseFloat(getAttr(element, 'y') || '0'),
    matrix
  )
  const fontFamily = getAttr(element, 'font-family') || 'sans-serif'
  const fontSize = scaleFontSize(parseFloat(getAttr(element, 'font-size') || '16'), matrix)
  const fontWeight = parseFontWeight(getAttr(element, 'font-weight'))
  const fontStyle = parseFontStyle(getAttr(element, 'font-style'))
  const textAnchor = parseTextAnchor(getAttr(element, 'text-anchor'))
  const verticalAlign = parseVerticalAlign(getAttr(element, 'dominant-baseline'))
  const fill = extractFill(element, options?.gradientMap)
  const textContent = extractTextContent(element)
  const tspanChildren = getTspanChildren(element)
  const opacity = parseOpacity(getAttr(element, 'opacity'))
  const textRotation = normalizeRotation(decomposeMatrix(matrix).rotation)
  const lineHeight = getOptionalNumberAttr(element, 'line-height')

  if (tspanChildren.length > 0) {
    const richText = convertRichText(element, id, textContent, tspanChildren, {
      x: basePoint.x,
      y: basePoint.y,
      fontFamily,
      fontSize,
      fill,
      fontWeight,
      fontStyle,
      textAnchor,
      verticalAlign,
      lineHeight,
      gradientMap: options?.gradientMap,
      matrix
    })

    if (opacity !== undefined) richText.opacity = opacity
    applyTextMetadata(richText, element)
    return richText
  }

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

  if (opacity !== undefined) textElement.opacity = opacity
  if (textRotation !== undefined) textElement.textRotation = textRotation
  applyTextMetadata(textElement, element)
  return textElement
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
    fontWeight?: FontWeight
    fontStyle?: FontStyle
    textAnchor?: TextAnchor
    verticalAlign?: VerticalAlign
    lineHeight?: number
    gradientMap?: Map<string, LinearGradient | RadialGradient>
    matrix: TransformMatrix
  }
): RichTextElement {
  const runs: TextRun[] = []
  const lines: string[] = []
  let currentLineText = ''
  let currentLineWidth = 0
  let maxWidth = 0
  let lineCount = 1

  tspanChildren.forEach((tspan, index) => {
    const tspanText = extractTextContent(tspan)
    if (!tspanText) return
    const startsNewLine = index > 0 && startsNewTextLine(tspan)

    if (startsNewLine) {
      lines.push(currentLineText)
      maxWidth = Math.max(maxWidth, currentLineWidth)
      currentLineText = ''
      currentLineWidth = 0
      lineCount++
    }

    const runFontSize = scaleFontSize(
      parseFloat(getAttr(tspan, 'font-size') || String(baseProps.fontSize)),
      baseProps.matrix
    )

    const run: TextRun = {
      text: tspanText,
      fontFamily: getAttr(tspan, 'font-family') || baseProps.fontFamily,
      fontSize: runFontSize,
      fontWeight: parseFontWeight(getAttr(tspan, 'font-weight')) || baseProps.fontWeight,
      fontStyle: parseFontStyle(getAttr(tspan, 'font-style')) || baseProps.fontStyle,
      fill: extractFill(tspan, baseProps.gradientMap) || baseProps.fill
    }

    runs.push(run)
    currentLineText += tspanText
    currentLineWidth += estimateTextWidth(tspanText, runFontSize)
  })

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
    textAlign: mapTextAlign(baseProps.textAnchor),
    textAnchor: baseProps.textAnchor,
    verticalAlign: baseProps.verticalAlign,
    lineHeight: baseProps.lineHeight
  }
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

function extractTextContent(element: Record<string, unknown>): string {
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

  return parts.join('')
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
