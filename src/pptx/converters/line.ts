// Line Converter - Converts SIF line elements to pptxgenjs lines
//
// SIF to PPTX Conversion Notes:
// - SIF opacity (0-1) must be combined with stroke transparency, not override
// - SIF markerStart/markerEnd map to pptxgenjs beginArrowType/endArrowType
// - SIF line coordinates (x1, y1, x2, y2) define the line endpoints
// - PPTX line shape uses bounding box (x, y, w, h) with line connector

import PptxGenJS from 'pptxgenjs'
import type { LineElement, ArrowMarker } from '../../sif/types/elements/line'
import type { Stroke } from '../../sif/types/style/stroke'
import { hexToPptxColorWithAlpha, opacityToTransparency, dashArrayToDashType, pxToInch, pxToPt, arrowTypeToPptx } from '../utils'
import { convertPathPointsForPptx } from '../utils/path-to-pptx'

/**
 * Convert line element to pptxgenjs shape (line)
 *
 * SIF LineElement has:
 * - x1, y1, x2, y2: line endpoints
 * - stroke: stroke properties (color, width, opacity, dashArray)
 * - markerStart, markerEnd: optional arrow marker IDs
 *
 * PPTX line uses bounding box with line connector properties
 */
export function convertLine(
  line: LineElement,
  hyperlink?: PptxGenJS.HyperlinkProps
): { shapeName: PptxGenJS.SHAPE_NAME; options: PptxGenJS.ShapeProps } {
  const translateX = line.transform?.translateX ?? 0
  const translateY = line.transform?.translateY ?? 0
  const scaleX = line.transform?.scaleX ?? 1
  const scaleY = line.transform?.scaleY ?? 1

  const x1 = (line.x1 + translateX) * scaleX
  const y1 = (line.y1 + translateY) * scaleY
  const x2 = (line.x2 + translateX) * scaleX
  const y2 = (line.y2 + translateY) * scaleY

  // Calculate bounding box
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  const width = Math.abs(x2 - x1) || 1
  const height = Math.abs(y2 - y1) || 1

  // Calculate line transparency from stroke
  // Handle gradient stroke - use first gradient color as fallback
  let strokeColor = line.stroke.color || '#000000'
  if (line.stroke.type === 'gradient' && line.stroke.gradient) {
    const firstStop = line.stroke.gradient.stops[0]
    if (firstStop) {
      strokeColor = firstStop.color
    }
  }
  const { color, transparency: strokeColorTransparency } = hexToPptxColorWithAlpha(strokeColor)
  const strokeTransparency = strokeColorTransparency ?? opacityToTransparency(line.stroke.opacity) ?? 0

  // Combine line element opacity with stroke transparency
  // Formula: combined = 1 - (1 - stroke_transparency) * (1 - element_opacity)
  let combinedTransparency = strokeTransparency
  if (line.opacity !== undefined && line.opacity < 1) {
    const elementTransparency = opacityToTransparency(line.opacity) ?? 0
    combinedTransparency = 1 - (1 - strokeTransparency / 100) * (1 - elementTransparency / 100)
    combinedTransparency = Math.round(combinedTransparency * 100)
  }

  const lineOptions: PptxGenJS.ShapeLineProps = {
    color,
    width: pxToPt(line.stroke.width),
    transparency: combinedTransparency,
    dashType: dashArrayToDashType(line.stroke.dashArray)
  }

  // Handle arrow markers if present
  // Note: pptxgenjs supports beginArrowType and endArrowType for line shapes
  // pptxgenjs uses 'lg', 'sm', 'med' for arrow sizes
  if (line.markerEnd) {
    // markerEnd maps to endArrowType
    lineOptions.endArrowType = arrowTypeToPptx(line.markerEnd) ?? 'arrow'
  }

  if (line.markerStart) {
    // markerStart maps to beginArrowType
    lineOptions.beginArrowType = arrowTypeToPptx(line.markerStart) ?? 'arrow'
  }

  const localX1 = x1 - minX
  const localY1 = y1 - minY
  const localX2 = x2 - minX
  const localY2 = y2 - minY

  const options: PptxGenJS.ShapeProps = {
    x: pxToInch(minX),
    y: pxToInch(minY),
    w: pxToInch(width),
    h: pxToInch(height),
    fill: { type: 'none' },
    line: lineOptions,
    points: convertPathPointsForPptx([
      { x: localX1, y: localY1, type: 'M', moveTo: true } as any,
      { x: localX2, y: localY2, type: 'L' } as any
    ]) as any
  }

  if (hyperlink) {
    options.hyperlink = hyperlink
  }

  // Handle rotation if needed - use transform.rotate (not .rotation which is only on BaseShape)
  const rotation = line.transform?.rotate
  if (rotation !== undefined) {
    options.rotate = rotation
  }

  return {
    shapeName: 'custGeom' as PptxGenJS.SHAPE_NAME,
    options
  }
}

/**
 * Convert stroke to pptxgenjs line props
 * Note: This function is kept for potential reuse but convertLine handles stroke conversion directly
 */
export function convertStroke(stroke: Stroke): PptxGenJS.ShapeLineProps {
  // Handle gradient stroke - use first gradient color as fallback
  let strokeColor = stroke.color || '#000000'
  if (stroke.type === 'gradient' && stroke.gradient) {
    const firstStop = stroke.gradient.stops[0]
    if (firstStop) {
      strokeColor = firstStop.color
    }
  }
  const { color, transparency } = hexToPptxColorWithAlpha(strokeColor)

  return {
    color,
    width: pxToPt(stroke.width),
    transparency: transparency ?? opacityToTransparency(stroke.opacity),
    dashType: dashArrayToDashType(stroke.dashArray)
  }
}

/**
 * Convert arrow marker definition to pptxgenjs arrow type
 */
export function convertArrowMarker(marker: ArrowMarker): PptxGenJS.ShapeLineProps['endArrowType'] {
  return arrowTypeToPptx(marker.type)
}
