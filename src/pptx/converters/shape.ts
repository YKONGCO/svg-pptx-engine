// Shape Converter - Converts SIF shapes to pptxgenjs shapes
//
// SIF to PPTX Conversion Notes:
// - SIF uses pixels (px), PPTX uses inches (96 DPI)
// - SIF uses opacity (0-1), PPTX uses transparency (0-100)
//   Formula: transparency = (1 - opacity) * 100
// - SIF shape coordinates are in the bounding box (x, y, width, height)
// - PPTX shape coordinates are in inches

import PptxGenJS from 'pptxgenjs'
import type { ShapeElement, ShapeType, CircleShape, EllipseShape, RectShape, LineShape, PathShape } from '../../sif/types/elements/shape'
import type { Fill, SolidFill, GradientFill } from '../../sif/types/style/fill'
import type { Gradient, LinearGradient } from '../../sif/types/style/gradient'
import type { Stroke } from '../../sif/types/style/stroke'
import type { VisualEffect } from '../../sif/types/style/effect'
import type { Transform } from '../../sif/types/common'
import { hexToPptxColorWithAlpha, opacityToTransparency, dashArrayToDashType, pxToInch, pxToPt } from '../utils'
import { pathRequiresCustomGeometry, convertPathPointsForPptx, type PptxPathPoint } from '../utils/path-to-pptx'

/**
 * Shape conversion result - contains shape name and options
 */
export interface ConvertedShape {
  shapeName: PptxGenJS.SHAPE_NAME
  options: PptxGenJS.ShapeProps
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
      const offsetValue = stop.offset ?? (stop as any).position
      const position = offsetValue !== undefined
        ? (offsetValue > 1 ? offsetValue : offsetValue * 100)
        : 0
      return {
        position,
        color,
        transparency: transparency ?? opacityToTransparency(stop.opacity)
      }
    })

    if (gradient.type === 'radial') {
      const fallbackStop = gradient.stops[gradient.stops.length - 1] ?? gradient.stops[0]
      const { color, transparency } = hexToPptxColorWithAlpha(fallbackStop.color)
      return {
        type: 'solid',
        color,
        transparency: transparency ?? opacityToTransparency(fallbackStop.opacity) ?? opacityToTransparency(gradientFill.opacity) ?? 0
      }
    }

    const angle = (gradient as LinearGradient).angle

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
export function convertStrokeDef(stroke?: Stroke): PptxGenJS.ShapeLineProps | undefined {
  if (!stroke) return undefined

  // Handle gradient stroke - fallback to first color
  if (stroke.type === 'gradient' && stroke.gradient) {
    const firstStop = stroke.gradient.stops[0]
    if (firstStop) {
      const { color, transparency } = hexToPptxColorWithAlpha(firstStop.color)
      return {
        color,
        width: pxToPt(stroke.width),
        transparency: transparency ?? opacityToTransparency(stroke.opacity),
        dashType: dashArrayToDashType(stroke.dashArray)
      }
    }
    return undefined
  }

  // Solid stroke
  const { color, transparency } = hexToPptxColorWithAlpha(stroke.color || '#000000')

  return {
    color,
    width: pxToPt(stroke.width),
    transparency: transparency ?? opacityToTransparency(stroke.opacity),
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
    path: 'rect',
    line: 'line',
    polygon: 'pentagon',
    polyline: 'pentagon'
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
    line: convertStrokeDef(shape.stroke)
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
      // Apply transparency to line (create new object instead of mutating)
      if (options.line) {
        const line = options.line as PptxGenJS.ShapeLineProps
        const lineTransparency = line.transparency ?? 0
        const combinedTransparency = 1 - (1 - elementTransparency / 100) * (1 - lineTransparency / 100)
        options.line = {
          ...line,
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
      options.x = pxToInch(Math.min(line.x1, line.x2) + translateX)
      options.y = pxToInch(Math.min(line.y1, line.y2) + translateY)
      options.w = pxToInch((Math.abs(line.x2 - line.x1) || 1) * scaleX)
      options.h = pxToInch((Math.abs(line.y2 - line.y1) || 1) * scaleY)
      break
    }
    case 'path': {
      const pathShape = shape as PathShape
      if (pathShape.points && pathRequiresCustomGeometry(pathShape.points)) {
        // Use CUSTOM_GEOMETRY for paths with curves/arcs
        shapeName = 'custGeom' as any
        const pptxPoints = convertPathPointsForPptx(pathShape.points)
        options.points = pptxPoints as any
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
