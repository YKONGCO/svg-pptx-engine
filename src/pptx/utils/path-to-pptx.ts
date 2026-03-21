// PPTX path converter - converts PathPoint[] to pptxgenjs CUSTOM_GEOMETRY points format
import type { PathPoint, CurvePoint, ArcPoint, ArcCurve } from '../../sif/types/elements/shape'
import { pxToInch } from '../utils'

const EMU_PER_INCH = 914400

/**
 * Check if path contains any curves or arcs that require CUSTOM_GEOMETRY
 */
export function pathRequiresCustomGeometry(points: PathPoint[]): boolean {
  return points.some(p => 'curve' in p && (p as any).curve.type !== 'line')
}

/**
 * Convert PathPoint to pptxgenjs CUSTOM_GEOMETRY point format
 *
 * PPTX arcTo uses center-based parameterization:
 * - hR/wR: ellipse radii
 * - stAng/swAng: start and sweep angles in degrees
 *
 * SVG arc uses endpoint-based parameterization:
 * - rX/rY: ellipse radii
 * - xAxisRotation: rotation
 * - largeArcFlag/sweepFlag: arc selection
 * - x/y: endpoint
 */
export function convertPathPointToPptx(
  point: PathPoint,
  prevPoint: { x: number; y: number } | undefined
): PptxPathPoint {
  if ('close' in point) {
    return { close: true }
  }

  if ('curve' in point) {
    const curvePoint = point as CurvePoint | ArcPoint

    if ((curvePoint as any).curve.type === 'arc') {
      // Convert SVG arc to PPTX arcTo
      const arcPoint = point as ArcPoint
      const { hR, wR, stAng, swAng } = convertSvgArcToPptxArc(
        prevPoint!.x, prevPoint!.y,
        arcPoint.x, arcPoint.y,
        arcPoint.curve.rX, arcPoint.curve.rY,
        arcPoint.curve.rotation,
        arcPoint.curve.largeArc,
        arcPoint.curve.sweep
      )

      return {
        x: arcPoint.x,
        y: arcPoint.y,
        curve: { type: 'arc', hR, wR, stAng, swAng }
      }
    }

    if (curvePoint.curve.type === 'cubic') {
      return {
        x: curvePoint.x,
        y: curvePoint.y,
        curve: {
          type: 'cubic',
          x1: curvePoint.curve.x1,
          y1: curvePoint.curve.y1,
          x2: curvePoint.curve.x2,
          y2: curvePoint.curve.y2
        }
      }
    }

    if (curvePoint.curve.type === 'quadratic') {
      return {
        x: curvePoint.x,
        y: curvePoint.y,
        curve: {
          type: 'quadratic',
          x1: curvePoint.curve.x1,
          y1: curvePoint.curve.y1
        }
      }
    }
  }

  // Regular point (moveTo or LineTo)
  return {
    x: point.x,
    y: point.y,
    moveTo: 'moveTo' in point ? (point as any).moveTo : undefined
  }
}

/**
 * Pptxgenjs CUSTOM_GEOMETRY point type
 */
export type PptxPathPoint =
  | { x: number; y: number; moveTo?: true }
  | { x: number; y: number; curve: { type: 'arc'; hR: number; wR: number; stAng: number; swAng: number } }
  | { x: number; y: number; curve: { type: 'cubic'; x1: number; y1: number; x2: number; y2: number } }
  | { x: number; y: number; curve: { type: 'quadratic'; x1: number; y1: number } }
  | { close: true }

function pxToEmu(value: number): number {
  return Math.round(pxToInch(value) * EMU_PER_INCH)
}

/**
 * Convert PathPoint[] to pptxgenjs points format
 */
export function convertPathPointsForPptx(points: PathPoint[]): PptxPathPoint[] {
  const result: PptxPathPoint[] = []

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    const prevPoint = i > 0 ? points[i - 1] : undefined

    // For prevPoint, we need the actual coordinates, not close/moveTo
    let actualPrev: { x: number; y: number } | undefined
    if (prevPoint) {
      if ('close' in prevPoint) {
        // Find the last non-close point
        for (let j = i - 2; j >= 0; j--) {
          const p = points[j]
          if (!('close' in p) && !('moveTo' in p && (p as any).moveTo)) {
            actualPrev = { x: p.x, y: p.y }
            break
          }
        }
      } else {
        actualPrev = { x: prevPoint.x, y: prevPoint.y }
      }
    }

    const converted = convertPathPointToPptx(point, actualPrev)
    result.push(convertPptxPathPointToInches(converted))
  }

  return result
}

function convertPptxPathPointToInches(point: PptxPathPoint): PptxPathPoint {
  if ('close' in point) {
    return point
  }

  if ('curve' in point) {
    switch (point.curve.type) {
      case 'arc':
        return {
          x: pxToEmu(point.x),
          y: pxToEmu(point.y),
          curve: {
            ...point.curve,
            hR: pxToEmu(point.curve.hR),
            wR: pxToEmu(point.curve.wR)
          }
        }
      case 'cubic':
        return {
          x: pxToEmu(point.x),
          y: pxToEmu(point.y),
          curve: {
            ...point.curve,
            x1: pxToEmu(point.curve.x1),
            y1: pxToEmu(point.curve.y1),
            x2: pxToEmu(point.curve.x2),
            y2: pxToEmu(point.curve.y2)
          }
        }
      case 'quadratic':
        return {
          x: pxToEmu(point.x),
          y: pxToEmu(point.y),
          curve: {
            ...point.curve,
            x1: pxToEmu(point.curve.x1),
            y1: pxToEmu(point.curve.y1)
          }
        }
      default:
        return point
    }
  }

  return {
    ...point,
    x: pxToEmu(point.x),
    y: pxToEmu(point.y)
  }
}

/**
 * Convert SVG arc parameters to PPTX arcTo parameters.
 *
 * SVG arc is endpoint-based, PPTX arcTo is center-based.
 * This conversion computes the center, start angle, and sweep angle.
 */
function convertSvgArcToPptxArc(
  x1: number, y1: number,  // start point
  x2: number, y2: number,  // end point
  rX: number, rY: number,  // radii
  xAxisRotation: number,   // rotation in degrees
  largeArc: boolean,        // large arc flag
  sweep: boolean            // sweep flag
): { hR: number; wR: number; stAng: number; swAng: number } {
  const arc = arcEndpointToCenter(x1, y1, x2, y2, rX, rY, xAxisRotation, largeArc, sweep)
  if (!arc) {
    return { hR: Math.abs(rY), wR: Math.abs(rX), stAng: 0, swAng: 0 }
  }

  return {
    hR: arc.ry,
    wR: arc.rx,
    stAng: radiansToDegrees(arc.theta1),
    swAng: radiansToDegrees(arc.deltaTheta)
  }
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
): { rx: number; ry: number; theta1: number; deltaTheta: number } | null {
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

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }

  const sign = largeArc === sweep ? -1 : 1
  const numerator = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p)
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator)
  const cxp = coef * ((rx * y1p) / ry)
  const cyp = coef * (-(ry * x1p) / rx)

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

  return { rx, ry, theta1, deltaTheta }
}

function angleBetween(u: { x: number; y: number }, v: { x: number; y: number }): number {
  return Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y)
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI
}
