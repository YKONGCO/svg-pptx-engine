// Shape Converter - Converts SIF shapes to pptxgenjs shapes
//
// SIF to PPTX Conversion Notes:
// - SIF uses pixels (px), PPTX uses inches (96 DPI)
// - SIF uses opacity (0-1), PPTX uses transparency (0-100)
//   Formula: transparency = (1 - opacity) * 100
// - SIF shape coordinates are in the bounding box (x, y, width, height)
// - PPTX shape coordinates are in inches

import PptxGenJS from 'pptxgenjs'
import type {
  ShapeElement,
  ShapeType,
  CircleShape,
  EllipseShape,
  RectShape,
  LineShape,
  PathShape,
  PolygonShape,
  PolylineShape,
  PathPoint
} from '../../sif/types/elements/shape'
import type { Fill, SolidFill, GradientFill } from '../../sif/types/style/fill'
import type { Gradient, LinearGradient } from '../../sif/types/style/gradient'
import type { Stroke } from '../../sif/types/style/stroke'
import type { VisualEffect } from '../../sif/types/style/effect'
import type { Transform } from '../../sif/types/common'
import { hexToPptxColorWithAlpha, opacityToTransparency, dashArrayToDashType, pxToInch, pxToPt } from '../utils'
import { convertPathPointsForPptx } from '../utils/path-to-pptx'
import { parsePathToPoints } from '../../svg/utils/path-parser'

/**
 * Shape conversion result - contains shape name and options
 */
export interface ConvertedShape {
  shapeName: PptxGenJS.SHAPE_NAME
  options: PptxGenJS.ShapeProps
}

function combineTransparency(baseTransparency?: number, extraOpacity?: number): number | undefined {
  if (baseTransparency === undefined && extraOpacity === undefined) return undefined

  const base = (baseTransparency ?? 0) / 100
  const extra = extraOpacity === undefined ? 0 : (1 - extraOpacity)
  return Math.min(100, Math.round((1 - (1 - base) * (1 - extra)) * 100))
}

function normalizeGradientStopPosition(offset?: number): number {
  if (offset === undefined) return 0
  return offset > 1 ? offset : offset * 100
}

function resolveLinearGradientAngle(gradient: LinearGradient): number | undefined {
  if (
    gradient.x1 !== undefined &&
    gradient.y1 !== undefined &&
    gradient.x2 !== undefined &&
    gradient.y2 !== undefined
  ) {
    const dx = gradient.x2 - gradient.x1
    const dy = gradient.y2 - gradient.y1
    const degrees = Math.atan2(dy, dx) * (180 / Math.PI)
    return (degrees + 360) % 360
  }

  return gradient.angle
}

function parsePointString(points: string): Array<{ x: number; y: number }> {
  return points
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(','))
    .filter(parts => parts.length >= 2)
    .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
}

function pointsStringToPathPoints(shape: PolygonShape | PolylineShape): PathPoint[] {
  const parsed = parsePointString(shape.points)
  if (parsed.length === 0) return []

  const pathPoints: PathPoint[] = parsed.map((point, index) => ({
    x: point.x,
    y: point.y,
    type: index === 0 ? 'M' : 'L',
    ...(index === 0 ? { moveTo: true } : {})
  })) as PathPoint[]

  if (shape.shapeType === 'polygon') {
    pathPoints.push({ close: true, type: 'Z' })
  }

  return pathPoints
}

function normalizePathPointsToLocal(points: PathPoint[], offsetX: number, offsetY: number): PathPoint[] {
  return points.map(point => {
    if ('close' in point) {
      return point
    }

    if ('curve' in point) {
      if (point.curve.type === 'cubic') {
        return {
          ...point,
          x: point.x - offsetX,
          y: point.y - offsetY,
          curve: {
            ...point.curve,
            x1: point.curve.x1 - offsetX,
            y1: point.curve.y1 - offsetY,
            x2: point.curve.x2 - offsetX,
            y2: point.curve.y2 - offsetY
          }
        }
      }

      if (point.curve.type === 'quadratic') {
        return {
          ...point,
          x: point.x - offsetX,
          y: point.y - offsetY,
          curve: {
            ...point.curve,
            x1: point.curve.x1 - offsetX,
            y1: point.curve.y1 - offsetY
          }
        }
      }

      return {
        ...point,
        x: point.x - offsetX,
        y: point.y - offsetY
      }
    }

    return {
      ...point,
      x: point.x - offsetX,
      y: point.y - offsetY
    }
  }) as PathPoint[]
}

function getCustomGeometryPoints(shape: ShapeElement): PathPoint[] {
  if (shape.shapeType === 'path') {
    const pathShape = shape as PathShape
    if (pathShape.points && pathShape.points.length > 0) {
      return pathShape.points
    }
    if (pathShape.d) {
      return parsePathToPoints(pathShape.d)
    }
    return []
  }

  if (shape.shapeType === 'polygon' || shape.shapeType === 'polyline') {
    return pointsStringToPathPoints(shape as PolygonShape | PolylineShape)
  }

  return []
}

/**
 * Convert fill to pptxgenjs format
 */
export function convertFill(fill: Fill): PptxGenJS.ShapeFillProps {
  if (fill.type === 'none') {
    return { type: 'none' }
  }

  if (fill.type === 'solid') {
    const solid = fill as SolidFill
    const { color, transparency } = hexToPptxColorWithAlpha(solid.color)
    return {
      type: 'solid',
      color,
      transparency: transparency ?? opacityToTransparency(solid.opacity) ?? 0
    }
  }

  if (fill.type === 'gradient') {
    const gradientFill = fill as GradientFill
    const gradient = gradientFill.gradient as Gradient

    const stops = gradient.stops.map(stop => {
      const { color, transparency } = hexToPptxColorWithAlpha(stop.color)
      return {
        position: normalizeGradientStopPosition(stop.offset),
        color,
        transparency: combineTransparency(transparency, stop.opacity)
      }
    })

    if (gradient.type === 'radial') {
      const fallbackStop = gradient.stops[gradient.stops.length - 1] ?? gradient.stops[0]
      const { color, transparency } = hexToPptxColorWithAlpha(fallbackStop.color)
      return {
        type: 'solid',
        color,
        transparency: combineTransparency(
          combineTransparency(transparency, fallbackStop.opacity),
          gradientFill.opacity
        ) ?? 0
      }
    }

    const angle = resolveLinearGradientAngle(gradient as LinearGradient)

    return {
      type: 'linearGradient',
      stops,
      angle,
      scaled: false,
      rotWithShape: true
    }
  }

  return { type: 'none' }
}

/**
 * Convert stroke to pptxgenjs format
 */
export function convertStrokeDef(stroke?: Stroke, extraOpacity?: number): PptxGenJS.ShapeLineProps | undefined {
  if (!stroke) return undefined

  if (stroke.type === 'gradient' && stroke.gradient) {
    if (stroke.gradient.type === 'linear') {
      return {
        type: 'linearGradient',
        width: pxToPt(stroke.width),
        dashType: dashArrayToDashType(stroke.dashArray),
        angle: resolveLinearGradientAngle(stroke.gradient),
        scaled: false,
        rotWithShape: true,
        stops: stroke.gradient.stops.map(stop => {
          const { color, transparency } = hexToPptxColorWithAlpha(stop.color)
          return {
            position: normalizeGradientStopPosition(stop.offset),
            color,
            transparency: combineTransparency(
              combineTransparency(
                combineTransparency(transparency, stop.opacity),
                stroke.opacity
              ),
              extraOpacity
            )
          }
        })
      }
    }

    const fallbackStop = stroke.gradient.stops[stroke.gradient.stops.length - 1] ?? stroke.gradient.stops[0]
    if (fallbackStop) {
      const { color, transparency } = hexToPptxColorWithAlpha(fallbackStop.color)
      return {
        type: 'solid',
        color,
        width: pxToPt(stroke.width),
        transparency: combineTransparency(
          combineTransparency(
            combineTransparency(transparency, fallbackStop.opacity),
            stroke.opacity
          ),
          extraOpacity
        ),
        dashType: dashArrayToDashType(stroke.dashArray)
      }
    }
    return undefined
  }

  // Solid stroke
  const { color, transparency } = hexToPptxColorWithAlpha(stroke.color || '#000000')

  return {
    type: 'solid',
    color,
    width: pxToPt(stroke.width),
    transparency: combineTransparency(
      combineTransparency(transparency, stroke.opacity),
      extraOpacity
    ),
    dashType: dashArrayToDashType(stroke.dashArray)
  }
}

/**
 * Convert effect to pptxgenjs shadow format
 */
export function convertEffect(effect?: VisualEffect): PptxGenJS.ShadowProps | undefined {
  if (!effect) return undefined

  if (effect.type === 'shadow') {
    const shadow = effect
    const { color } = hexToPptxColorWithAlpha(shadow.color)
    return {
      type: 'outer',
      color,
      blur: pxToPt(shadow.blur),
      offset: pxToPt(Math.sqrt(shadow.offsetX ** 2 + shadow.offsetY ** 2)),
      angle: Math.atan2(shadow.offsetY, shadow.offsetX) * (180 / Math.PI) + 90,
      opacity: shadow.opacity ?? 0.5
    }
  }

  if (effect.type === 'dropShadow') {
    const presets: Record<'subtle' | 'moderate' | 'intense', { blur: number; offset: number; opacity: number }> = {
      subtle: { blur: 4, offset: 2, opacity: 0.3 },
      moderate: { blur: 8, offset: 4, opacity: 0.4 },
      intense: { blur: 16, offset: 8, opacity: 0.5 }
    }
    const preset = presets[effect.preset]
    return {
      type: 'outer',
      color: '000000',
      blur: preset.blur,
      offset: preset.offset,
      opacity: preset.opacity
    }
  }

  return undefined
}

/**
 * Convert transform to pptxgenjs rotation
 */
export function convertTransform(transform?: Transform): number | undefined {
  if (!transform) return undefined
  return transform.rotate ?? transform.rotateZ
}

/**
 * Map SIF shape type to pptxgenjs shape name
 */
function getShapeName(shapeType: string): PptxGenJS.SHAPE_NAME {
  // Use string literals directly as pptxgenjs ShapeType values
  const mapping: Record<string, string> = {
    rect: 'rect',
    circle: 'ellipse',
    ellipse: 'ellipse',
    path: 'custGeom',
    line: 'line',
    polygon: 'custGeom',
    polyline: 'custGeom'
  }
  return (mapping[shapeType] || 'rect') as PptxGenJS.SHAPE_NAME
}

/**
 * Convert shape element to pptxgenjs shape
 */
export function convertShape(shape: ShapeElement, hyperlink?: PptxGenJS.HyperlinkProps): ConvertedShape {
  const shapeType = shape.shapeType as string
  const translateX = shape.transform?.translateX ?? 0
  const translateY = shape.transform?.translateY ?? 0
  const scaleX = shape.transform?.scaleX ?? 1
  const scaleY = shape.transform?.scaleY ?? 1

  const options: PptxGenJS.ShapeProps = {
    x: pxToInch(shape.x + translateX),
    y: pxToInch(shape.y + translateY),
    w: pxToInch(shape.width * scaleX),
    h: pxToInch(shape.height * scaleY),
    fill: convertFill(shape.fill),
    line: convertStrokeDef(shape.stroke, shape.opacity)
  }

  // Handle rotation
  const rotation = convertTransform(shape.transform) ?? shape.rotation
  if (rotation !== undefined) {
    options.rotate = rotation
  }

  // Handle opacity - SIF opacity (0-1) affects the entire element's transparency
  // PPTX uses transparency (0-100) where 100 = fully transparent
  // Since we can't directly set element-level transparency in pptxgenjs shapes,
  // we apply it to fill and line with proper combination
  // Note: We create new objects instead of mutating (immutability principle)
  if (shape.opacity !== undefined && shape.opacity < 1) {
    const elementTransparency = opacityToTransparency(shape.opacity)
    if (elementTransparency !== undefined && elementTransparency > 0) {
      // Apply transparency to fill (create new object instead of mutating)
      if (options.fill && options.fill.type === 'solid') {
        const fill = options.fill as PptxGenJS.SolidShapeFillProps
        const fillTransparency = fill.transparency ?? 0
        const combinedTransparency = 1 - (1 - elementTransparency / 100) * (1 - fillTransparency / 100)
        options.fill = {
          ...fill,
          transparency: Math.min(100, Math.round(combinedTransparency * 100))
        }
      }
    }
  }

  // Add shadow if present
  if (shape.effect) {
    options.shadow = convertEffect(shape.effect)
  }

  if (hyperlink) {
    options.hyperlink = hyperlink
  }

  // Get shape name and handle special cases
  let shapeName = getShapeName(shapeType)
  switch (shapeType) {
    case 'rect': {
      const rect = shape as any
      if (rect.rx || rect.ry) {
        // rectRadius in pptxgenjs is the absolute corner radius in inches
        // rx/ry in SVG are in pixels, so convert using pxToInch
        options.rectRadius = pxToInch(rect.rx || rect.ry)
        // Must use 'roundRect' shape when rx/ry is present for rectRadius to work
        shapeName = 'roundRect'
      }
      break
    }
    case 'line': {
      const line = shape as any
      const x1 = (line.x1 + translateX) * scaleX
      const y1 = (line.y1 + translateY) * scaleY
      const x2 = (line.x2 + translateX) * scaleX
      const y2 = (line.y2 + translateY) * scaleY

      const minX = Math.min(x1, x2)
      const minY = Math.min(y1, y2)
      options.x = pxToInch(minX)
      options.y = pxToInch(minY)
      options.w = pxToInch(Math.abs(x2 - x1) || 1)
      options.h = pxToInch(Math.abs(y2 - y1) || 1)
      options.fill = { type: 'none' }
      options.points = convertPathPointsForPptx([
        { x: x1 - minX, y: y1 - minY, type: 'M', moveTo: true } as any,
        { x: x2 - minX, y: y2 - minY, type: 'L' } as any
      ]) as any
      shapeName = 'custGeom' as any
      break
    }
    case 'path': {
      const localPoints = normalizePathPointsToLocal(getCustomGeometryPoints(shape), shape.x, shape.y)
      if (localPoints.length > 0) {
        shapeName = 'custGeom' as any
        options.points = convertPathPointsForPptx(localPoints) as any
      }
      break
    }
    case 'polygon':
    case 'polyline': {
      const localPoints = normalizePathPointsToLocal(getCustomGeometryPoints(shape), shape.x, shape.y)
      if (localPoints.length > 0) {
        shapeName = 'custGeom' as any
        options.points = convertPathPointsForPptx(localPoints) as any
      }
      break
    }
  }

  return {
    shapeName,
    options
  }
}

/**
 * Check if a shape type is supported
 */
export function isShapeSupported(shapeType: ShapeType): boolean {
  const supported = ['rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline']
  return supported.includes(shapeType)
}

/**
 * Get unsupported shape types
 */
export function getUnsupportedShapeTypes(shapes: ShapeElement[]): ShapeType[] {
  return shapes
    .map(s => s.shapeType)
    .filter((type): type is ShapeType => !isShapeSupported(type))
}
