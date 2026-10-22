// Shape converters - convert SVG shape elements to SIF ShapeElements
import type {
  RectShape,
  CircleShape,
  EllipseShape,
  PathShape,
  LineShape,
  PolygonShape,
  PolylineShape,
  ShapeElement,
  PathPoint
} from '../../sif/types/elements/shape'
import type { LineElement } from '../../sif/types/elements/line'
import type { Fill, Stroke } from '../../sif/types/style'
import type { LinearGradient, RadialGradient } from '../../sif/types/style/gradient'
import { parseColor, parseOpacity, parseDashArray, parseLineCap, parseLineJoin } from './color'
import { getAttr } from '../parser'
import {
  applyMatrixToBounds,
  applyMatrixToShapeBounds,
  applyMatrixToPoint,
  decomposeMatrix,
  identityMatrix,
  parseTransformToMatrix,
  type TransformMatrix
} from './group'
import { parsePathToPoints } from '../utils/path-parser'
import { resolveMarkerAttributeWithMap, type MarkerMap } from './marker'

export interface ShapeConversionOptions {
  gradientMap?: Map<string, LinearGradient | RadialGradient>
  transformMatrix?: TransformMatrix
  /** Marker defs (Phase 1.2). When provided, `marker-*` attributes on
   * lines and polylines are resolved to structured ArrowMarker. */
  markerMap?: MarkerMap
}

export function convertMarkedLine(
  element: Record<string, unknown>,
  id: string,
  options?: ShapeConversionOptions
): LineElement {
  const matrix = resolveMatrix(element, options)
  const start = applyMatrixToPoint(getNumberAttr(element, 'x1'), getNumberAttr(element, 'y1'), matrix)
  const end = applyMatrixToPoint(getNumberAttr(element, 'x2'), getNumberAttr(element, 'y2'), matrix)
  const minX = Math.min(start.x, end.x)
  const minY = Math.min(start.y, end.y)
  const maxX = Math.max(start.x, end.x)
  const maxY = Math.max(start.y, end.y)
  const stroke = extractStroke(element, options?.gradientMap) || { color: '#000000', width: 1 }

  const line: LineElement = {
    id,
    type: 'line',
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stroke
  }

  const markerMap = options?.markerMap
  if (markerMap) {
    const markerStart = resolveMarkerAttributeWithMap(getAttr(element, 'marker-start'), markerMap)
    const markerEnd = resolveMarkerAttributeWithMap(getAttr(element, 'marker-end'), markerMap)
    const markerMid = resolveMarkerAttributeWithMap(getAttr(element, 'marker-mid'), markerMap)
    if (markerStart) line.markerStart = markerStart
    if (markerEnd) line.markerEnd = markerEnd
    if (markerMid) line.markerMid = markerMid
  }

  const opacity = parseOpacity(getAttr(element, 'opacity'))
  if (opacity !== undefined) line.opacity = opacity

  const rotation = extractRotation(matrix)
  if (rotation !== undefined) {
    line.transform = { rotate: rotation }
  }

  const visibility = getAttr(element, 'visibility')
  if (visibility) {
    line.visible = visibility !== 'hidden' && visibility !== 'collapse'
  }

  return line
}

/**
 * Build a LineElement from a polyline that has a `marker-mid` attribute
 * (and optionally `marker-start` / `marker-end`). The LineElement's
 * endpoints collapse to the first and last point of the polyline; the
 * `markerMid` records the per-vertex marker so the renderer can place
 * a copy at every interior vertex.
 */
export function convertMarkedPolyline(
  element: Record<string, unknown>,
  id: string,
  options?: ShapeConversionOptions
): LineElement {
  const matrix = resolveMatrix(element, options)
  const points = getPolylinePoints(element)
  if (points.length < 2) {
    // Fall back to polyline-as-shape; can't form a line.
    return convertPolyline(element, id, options) as unknown as LineElement
  }

  // Transform points to absolute coordinates.
  const transformed = points.map(p => applyMatrixToPoint(p.x, p.y, matrix))
  const first = transformed[0]
  const last = transformed[transformed.length - 1]
  const xs = transformed.map(p => p.x)
  const ys = transformed.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const stroke = extractStroke(element, options?.gradientMap) || { color: '#000000', width: 1 }

  const line: LineElement = {
    id,
    type: 'line',
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    x1: first.x,
    y1: first.y,
    x2: last.x,
    y2: last.y,
    stroke
  }

  const markerMap = options?.markerMap
  if (markerMap) {
    const markerStart = resolveMarkerAttributeWithMap(getAttr(element, 'marker-start'), markerMap)
    const markerEnd = resolveMarkerAttributeWithMap(getAttr(element, 'marker-end'), markerMap)
    const markerMid = resolveMarkerAttributeWithMap(getAttr(element, 'marker-mid'), markerMap)
    if (markerStart) line.markerStart = markerStart
    if (markerEnd) line.markerEnd = markerEnd
    if (markerMid) line.markerMid = markerMid
  }

  const opacity = parseOpacity(getAttr(element, 'opacity'))
  if (opacity !== undefined) line.opacity = opacity

  const rotation = extractRotation(matrix)
  if (rotation !== undefined) {
    line.transform = { rotate: rotation }
  }

  return line
}

function getPolylinePoints(element: Record<string, unknown>): Array<{ x: number; y: number }> {
  const raw = getAttr(element, 'points') ?? ''
  return raw
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(','))
    .filter(parts => parts.length >= 2)
    .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
}

export function convertRect(element: Record<string, unknown>, id: string, options?: ShapeConversionOptions): RectShape {
  const x = getNumberAttr(element, 'x')
  const y = getNumberAttr(element, 'y')
  const width = getNumberAttr(element, 'width')
  const height = getNumberAttr(element, 'height')
  const rx = getOptionalNumberAttr(element, 'rx') ?? getOptionalNumberAttr(element, 'ry')
  const ry = getOptionalNumberAttr(element, 'ry') ?? getOptionalNumberAttr(element, 'rx')
  const matrix = resolveMatrix(element, options)
  const bounds = applyMatrixToShapeBounds(x, y, width, height, matrix)

  return withBaseProps({
    id,
    type: 'shape',
    shapeType: 'rect',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    rx,
    ry,
    fill: extractFill(element, options?.gradientMap),
    stroke: extractStroke(element, options?.gradientMap),
    rotation: extractRotation(matrix)
  }, element)
}

export function convertCircle(element: Record<string, unknown>, id: string, options?: ShapeConversionOptions): CircleShape {
  const cx = getNumberAttr(element, 'cx')
  const cy = getNumberAttr(element, 'cy')
  const r = getNumberAttr(element, 'r')
  const matrix = resolveMatrix(element, options)
  const center = applyMatrixToPoint(cx, cy, matrix)
  const radiusX = distanceBetweenPoints(
    center,
    applyMatrixToPoint(cx + r, cy, matrix)
  )
  const radiusY = distanceBetweenPoints(
    center,
    applyMatrixToPoint(cx, cy + r, matrix)
  )
  const bounds = {
    x: center.x - radiusX,
    y: center.y - radiusY,
    width: radiusX * 2,
    height: radiusY * 2
  }

  return withBaseProps({
    id,
    type: 'shape',
    shapeType: 'circle',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    cx: center.x,
    cy: center.y,
    r: (radiusX + radiusY) / 2,
    fill: extractFill(element, options?.gradientMap),
    stroke: extractStroke(element, options?.gradientMap),
    rotation: extractRotation(matrix)
  }, element)
}

export function convertEllipse(element: Record<string, unknown>, id: string, options?: ShapeConversionOptions): EllipseShape {
  const cx = getNumberAttr(element, 'cx')
  const cy = getNumberAttr(element, 'cy')
  const rx = getNumberAttr(element, 'rx')
  const ry = getNumberAttr(element, 'ry')
  const matrix = resolveMatrix(element, options)
  const center = applyMatrixToPoint(cx, cy, matrix)
  const radiusX = distanceBetweenPoints(
    center,
    applyMatrixToPoint(cx + rx, cy, matrix)
  )
  const radiusY = distanceBetweenPoints(
    center,
    applyMatrixToPoint(cx, cy + ry, matrix)
  )
  const bounds = {
    x: center.x - radiusX,
    y: center.y - radiusY,
    width: radiusX * 2,
    height: radiusY * 2
  }

  return withBaseProps({
    id,
    type: 'shape',
    shapeType: 'ellipse',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    cx: center.x,
    cy: center.y,
    rx: radiusX,
    ry: radiusY,
    fill: extractFill(element, options?.gradientMap),
    stroke: extractStroke(element, options?.gradientMap),
    rotation: extractRotation(matrix)
  }, element)
}

export function convertPath(element: Record<string, unknown>, id: string, options?: ShapeConversionOptions): PathShape {
  const sourcePath = getAttr(element, 'd') || ''
  const matrix = resolveMatrix(element, options)
  const d = transformPathData(sourcePath, matrix)
  const fillRule = (getAttr(element, 'fill-rule') || getAttr(element, 'fillRule') || 'nonzero') as 'nonzero' | 'evenodd'
  const points = parsePathToPoints(d)
  const strokeWidth = getNumberAttr(element, 'stroke-width', 0)
  const bounds = computePathBounds(points, strokeWidth)

  return withBaseProps({
    id,
    type: 'shape',
    shapeType: 'path',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    d,
    fillRule,
    points,
    fill: extractFill(element, options?.gradientMap),
    stroke: extractStroke(element, options?.gradientMap),
    rotation: extractRotation(matrix)
  }, element)
}

export function convertLine(element: Record<string, unknown>, id: string, options?: ShapeConversionOptions): LineShape {
  const matrix = resolveMatrix(element, options)
  const start = applyMatrixToPoint(getNumberAttr(element, 'x1'), getNumberAttr(element, 'y1'), matrix)
  const end = applyMatrixToPoint(getNumberAttr(element, 'x2'), getNumberAttr(element, 'y2'), matrix)
  const minX = Math.min(start.x, end.x)
  const minY = Math.min(start.y, end.y)
  const maxX = Math.max(start.x, end.x)
  const maxY = Math.max(start.y, end.y)

  return withBaseProps({
    id,
    type: 'shape',
    shapeType: 'line',
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    fill: { type: 'none' },
    stroke: extractStroke(element, options?.gradientMap) || { color: '#000000', width: 1 },
    rotation: extractRotation(matrix)
  }, element)
}

export function convertPolygon(element: Record<string, unknown>, id: string, options?: ShapeConversionOptions): PolygonShape {
  const matrix = resolveMatrix(element, options)
  const points = transformPointsString(getAttr(element, 'points') || '', matrix)
  const bounds = computePointsBounds(points)

  return withBaseProps({
    id,
    type: 'shape',
    shapeType: 'polygon',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    points,
    fill: extractFill(element, options?.gradientMap),
    stroke: extractStroke(element, options?.gradientMap),
    rotation: extractRotation(matrix)
  }, element)
}

export function convertPolyline(element: Record<string, unknown>, id: string, options?: ShapeConversionOptions): PolylineShape {
  const matrix = resolveMatrix(element, options)
  const points = transformPointsString(getAttr(element, 'points') || '', matrix)
  const bounds = computePointsBounds(points)

  return withBaseProps({
    id,
    type: 'shape',
    shapeType: 'polyline',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    points,
    fill: extractFill(element, options?.gradientMap),
    stroke: extractStroke(element, options?.gradientMap),
    rotation: extractRotation(matrix)
  }, element)
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
    return { type: 'none' }
  }

  if (fill) {
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

export function extractStroke(
  element: Record<string, unknown>,
  gradientMap?: Map<string, LinearGradient | RadialGradient>
): Stroke | undefined {
  const stroke = getAttr(element, 'stroke')
  if (!stroke || stroke === 'none') {
    return undefined
  }

  // Handle gradient stroke
  if (stroke.startsWith('url(#')) {
    const gradientId = stroke.slice(5, -1)
    const gradient = gradientMap?.get(gradientId)
    if (gradient) {
      return {
        type: 'gradient',
        gradient,
        width: getNumberAttr(element, 'stroke-width', 1),
        opacity: parseOpacity(getAttr(element, 'stroke-opacity')),
        lineCap: parseLineCap(getAttr(element, 'stroke-linecap')),
        lineJoin: parseLineJoin(getAttr(element, 'stroke-linejoin')),
        dashArray: parseDashArray(getAttr(element, 'stroke-dasharray')),
        dashOffset: getOptionalNumberAttr(element, 'stroke-dashoffset')
      }
    }
    return undefined
  }

  return {
    color: parseColor(stroke),
    width: getNumberAttr(element, 'stroke-width', 1),
    opacity: parseOpacity(getAttr(element, 'stroke-opacity')),
    lineCap: parseLineCap(getAttr(element, 'stroke-linecap')),
    lineJoin: parseLineJoin(getAttr(element, 'stroke-linejoin')),
    dashArray: parseDashArray(getAttr(element, 'stroke-dasharray')),
    dashOffset: getOptionalNumberAttr(element, 'stroke-dashoffset')
  }
}

function extractRotation(matrix: TransformMatrix): number | undefined {
  const rotation = decomposeMatrix(matrix).rotation
  return Math.abs(rotation) > 1e-6 ? rotation : undefined
}

function resolveMatrix(element: Record<string, unknown>, options?: ShapeConversionOptions): TransformMatrix {
  if (options?.transformMatrix) {
    return options.transformMatrix
  }
  const transform = getAttr(element, 'transform')
  return transform ? parseTransformToMatrix(transform) : identityMatrix()
}

function withBaseProps<T extends ShapeElement>(shape: T, element: Record<string, unknown>): T {
  const opacity = parseOpacity(getAttr(element, 'opacity'))
  const visibility = getAttr(element, 'visibility')

  if (opacity !== undefined) {
    shape.opacity = opacity
  }

  if (visibility) {
    shape.visible = visibility !== 'hidden' && visibility !== 'collapse'
  }

  return shape
}

function getNumberAttr(element: Record<string, unknown>, name: string, fallback: number = 0): number {
  const value = getAttr(element, name)
  if (value === undefined) return fallback
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

function getOptionalNumberAttr(element: Record<string, unknown>, name: string): number | undefined {
  const value = getAttr(element, name)
  if (value === undefined) return undefined
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function computePathBounds(points: PathPoint[], strokeWidth: number = 0): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  const includePoint = (x: number, y: number): void => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  let previousPoint: { x: number; y: number } | undefined

  for (const point of points) {
    if ('close' in point) continue

    includePoint(point.x, point.y)

    if ('curve' in point) {
      switch (point.curve.type) {
        case 'cubic':
          includePoint(point.curve.x1, point.curve.y1)
          includePoint(point.curve.x2, point.curve.y2)
          break
        case 'quadratic':
          includePoint(point.curve.x1, point.curve.y1)
          break
        case 'arc':
          if (previousPoint) {
            const arcBounds = computeArcSegmentBounds(previousPoint, point as Extract<PathPoint, { curve: { type: 'arc' } }>)
            includePoint(arcBounds.minX, arcBounds.minY)
            includePoint(arcBounds.maxX, arcBounds.maxY)
          }
          break
        default:
          break
      }
    }

    previousPoint = { x: point.x, y: point.y }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const padding = strokeWidth > 0 ? strokeWidth / 2 : 0
  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, strokeWidth > 0 ? strokeWidth : 1),
    height: Math.max(maxY - minY, strokeWidth > 0 ? strokeWidth : 1)
  }
}

function computeArcSegmentBounds(
  start: { x: number; y: number },
  point: Extract<PathPoint, { curve: { type: 'arc' } }>
): { minX: number; minY: number; maxX: number; maxY: number } {
  const samples = sampleSvgArc(start, point, 24)
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const sample of samples) {
    minX = Math.min(minX, sample.x)
    minY = Math.min(minY, sample.y)
    maxX = Math.max(maxX, sample.x)
    maxY = Math.max(maxY, sample.y)
  }

  return {
    minX: Number.isFinite(minX) ? minX : Math.min(start.x, point.x),
    minY: Number.isFinite(minY) ? minY : Math.min(start.y, point.y),
    maxX: Number.isFinite(maxX) ? maxX : Math.max(start.x, point.x),
    maxY: Number.isFinite(maxY) ? maxY : Math.max(start.y, point.y)
  }
}

function sampleSvgArc(
  start: { x: number; y: number },
  point: Extract<PathPoint, { curve: { type: 'arc' } }>,
  steps: number
): Array<{ x: number; y: number }> {
  const arc = arcEndpointToCenter(
    start.x,
    start.y,
    point.x,
    point.y,
    point.curve.rX,
    point.curve.rY,
    point.curve.rotation,
    point.curve.largeArc,
    point.curve.sweep
  )

  if (!arc) {
    return [start, { x: point.x, y: point.y }]
  }

  const { cx, cy, rx, ry, phi, theta1, deltaTheta } = arc
  const samples: Array<{ x: number; y: number }> = []
  const totalSteps = Math.max(2, steps)

  for (let i = 0; i <= totalSteps; i++) {
    const t = theta1 + (deltaTheta * i) / totalSteps
    const cosPhi = Math.cos(phi)
    const sinPhi = Math.sin(phi)
    const x = cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi
    const y = cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi
    samples.push({ x, y })
  }

  return samples
}

function arcEndpointToCenter(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rxInput: number,
  ryInput: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean
): { cx: number; cy: number; rx: number; ry: number; phi: number; theta1: number; deltaTheta: number } | null {
  let rx = Math.abs(rxInput)
  let ry = Math.abs(ryInput)
  if (rx === 0 || ry === 0) return null

  const phi = (rotation * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2

  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
    lambda = 1
  }

  const sign = largeArc === sweep ? -1 : 1
  const numerator = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p)
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator)
  const cxp = coef * ((rx * y1p) / ry)
  const cyp = coef * (-(ry * x1p) / rx)

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

  const theta1 = angleBetween(
    { x: 1, y: 0 },
    { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry }
  )
  let deltaTheta = angleBetween(
    { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry },
    { x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry }
  )

  if (!sweep && deltaTheta > 0) {
    deltaTheta -= 2 * Math.PI
  } else if (sweep && deltaTheta < 0) {
    deltaTheta += 2 * Math.PI
  }

  return { cx, cy, rx, ry, phi, theta1, deltaTheta }
}

function angleBetween(u: { x: number; y: number }, v: { x: number; y: number }): number {
  const dot = u.x * v.x + u.y * v.y
  const det = u.x * v.y - u.y * v.x
  return Math.atan2(det, dot)
}

export function computePointsBounds(points: string): { x: number; y: number; width: number; height: number } {
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map(value => parseFloat(value))
    .filter(value => !Number.isNaN(value))

  if (nums.length < 2) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (let i = 0; i + 1 < nums.length; i += 2) {
    minX = Math.min(minX, nums[i])
    maxX = Math.max(maxX, nums[i])
    minY = Math.min(minY, nums[i + 1])
    maxY = Math.max(maxY, nums[i + 1])
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function transformPointsString(points: string, matrix: TransformMatrix): string {
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map(value => parseFloat(value))
    .filter(value => !Number.isNaN(value))

  const transformed: string[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const point = applyMatrixToPoint(nums[i], nums[i + 1], matrix)
    transformed.push(`${round(point.x)},${round(point.y)}`)
  }

  return transformed.join(' ')
}

function distanceBetweenPoints(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function transformPathData(d: string, matrix: TransformMatrix): string {
  const tokens = d.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/g) || []
  const out: string[] = []
  let index = 0
  let command = ''
  let current = { x: 0, y: 0 }
  let subpathStart = { x: 0, y: 0 }

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) {
      command = tokens[index++]
      // Only push command for Z (closepath) - other commands are pushed by transformPathCommand
      if (command.toUpperCase() === 'Z') {
        out.push(command)
      }
      // For M/L/T/H/V/C/S/Q/A, don't push here - transformPathCommand handles it
    }

    const upper = command.toUpperCase()
    const relative = command !== upper
    const arity = getPathCommandArity(upper)
    if (arity === 0) {
      if (upper === 'Z') {
        current = { ...subpathStart }
      }
      continue
    }

    while (index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index])) {
      const args = tokens.slice(index, index + arity).map(value => parseFloat(value))
      if (args.length < arity || args.some(value => Number.isNaN(value))) {
        index = tokens.length
        break
      }
      index += arity

      const segment = transformPathCommand(upper, relative, args, current, subpathStart, matrix)
      out.push(segment.serialized)
      current = segment.current
      subpathStart = segment.subpathStart

      if (upper === 'M') {
        command = relative ? 'l' : 'L'
      }
    }
  }

  return out.join(' ').replace(/\s+/g, ' ').trim()
}

function transformPathCommand(
  command: string,
  relative: boolean,
  args: number[],
  current: { x: number; y: number },
  subpathStart: { x: number; y: number },
  matrix: TransformMatrix
): { serialized: string; current: { x: number; y: number }; subpathStart: { x: number; y: number } } {
  const absolutizePoint = (x: number, y: number) => ({
    x: relative ? current.x + x : x,
    y: relative ? current.y + y : y
  })

  switch (command) {
    case 'M':
    case 'L':
    case 'T': {
      const point = absolutizePoint(args[0], args[1])
      const transformed = applyMatrixToPoint(point.x, point.y, matrix)
      return {
        serialized: `${command} ${round(transformed.x)} ${round(transformed.y)}`,
        current: point,
        subpathStart: command === 'M' ? point : subpathStart
      }
    }
    case 'H': {
      const point = absolutizePoint(args[0], 0)
      const transformed = applyMatrixToPoint(point.x, current.y, matrix)
      return {
        serialized: `L ${round(transformed.x)} ${round(transformed.y)}`,
        current: { x: point.x, y: current.y },
        subpathStart
      }
    }
    case 'V': {
      const point = absolutizePoint(0, args[0])
      const transformed = applyMatrixToPoint(current.x, point.y, matrix)
      return {
        serialized: `L ${round(transformed.x)} ${round(transformed.y)}`,
        current: { x: current.x, y: point.y },
        subpathStart
      }
    }
    case 'C': {
      const p1 = absolutizePoint(args[0], args[1])
      const p2 = absolutizePoint(args[2], args[3])
      const p = absolutizePoint(args[4], args[5])
      const t1 = applyMatrixToPoint(p1.x, p1.y, matrix)
      const t2 = applyMatrixToPoint(p2.x, p2.y, matrix)
      const tp = applyMatrixToPoint(p.x, p.y, matrix)
      return {
        serialized: `${command} ${round(t1.x)} ${round(t1.y)} ${round(t2.x)} ${round(t2.y)} ${round(tp.x)} ${round(tp.y)}`,
        current: p,
        subpathStart
      }
    }
    case 'S':
    case 'Q': {
      const p1 = absolutizePoint(args[0], args[1])
      const p = absolutizePoint(args[2], args[3])
      const t1 = applyMatrixToPoint(p1.x, p1.y, matrix)
      const tp = applyMatrixToPoint(p.x, p.y, matrix)
      return {
        serialized: `${command} ${round(t1.x)} ${round(t1.y)} ${round(tp.x)} ${round(tp.y)}`,
        current: p,
        subpathStart
      }
    }
    case 'A': {
      const end = absolutizePoint(args[5], args[6])
      const transformedEnd = applyMatrixToPoint(end.x, end.y, matrix)
      const decomposed = decomposeMatrix(matrix)
      const rx = Math.abs(args[0] * (decomposed.scaleX || 1))
      const ry = Math.abs(args[1] * (decomposed.scaleY || 1))
      const rotation = (args[2] || 0) + decomposed.rotation
      return {
        serialized: `${command} ${round(rx)} ${round(ry)} ${round(rotation)} ${args[3]} ${args[4]} ${round(transformedEnd.x)} ${round(transformedEnd.y)}`,
        current: end,
        subpathStart
      }
    }
    default:
      return {
        serialized: '',
        current,
        subpathStart
      }
  }
}

function getPathCommandArity(command: string): number {
  switch (command) {
    case 'M':
    case 'L':
    case 'T':
      return 2
    case 'H':
    case 'V':
      return 1
    case 'S':
    case 'Q':
      return 4
    case 'C':
      return 6
    case 'A':
      return 7
    default:
      return 0
  }
}

function round(value: number): string {
  return Number(value.toFixed(6)).toString()
}

function normalizeMarkerId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.match(/^url\(#([^)]+)\)$/)
  if (match) {
    return markerIdToArrowType(match[1])
  }
  return markerIdToArrowType(value)
}

function markerIdToArrowType(id: string): string {
  const normalized = id.toLowerCase()
  if (normalized.includes('diamond')) return 'diamond'
  if (normalized.includes('circle') || normalized.includes('oval')) return 'circle'
  if (normalized.includes('open') || normalized.includes('stealth')) return 'open'
  if (normalized.includes('none')) return 'none'
  return 'arrow'
}

export function getShapeType(element: Record<string, unknown>): string | undefined {
  if ('@_r' in element && '@_cx' in element) return 'circle'
  if ('@_rx' in element || '@_ry' in element) return 'ellipse'
  if ('@_d' in element) return 'path'
  if ('@_x1' in element && '@_y1' in element) return 'line'
  if ('@_points' in element) return 'polygon'
  if ('@_width' in element && '@_height' in element) return 'rect'

  for (const key of Object.keys(element)) {
    if (['rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline'].includes(key)) {
      return key
    }
  }

  return undefined
}
