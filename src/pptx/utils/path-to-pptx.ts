// PPTX path converter - converts PathPoint[] to pptxgenjs CUSTOM_GEOMETRY points format
import type { PathPoint, CurvePoint, ArcPoint, ArcCurve } from '../../sif/types/elements/shape'

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

    result.push(convertPathPointToPptx(point, actualPrev))
  }

  return result
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
  // Handle degenerate case where start and end are the same
  if (Math.abs(x2 - x1) < 0.001 && Math.abs(y2 - y1) < 0.001) {
    return { hR: rY, wR: rX, stAng: 0, swAng: 0 }
  }

  // Convert rotation to radians
  const phi = (xAxisRotation * Math.PI) / 180

  // Step 1: Compute center point of ellipse
  // Using the midpoint and angle approach
  const dx = x2 - x1
  const dy = y2 - y1

  // Distance between points
  const d = Math.sqrt(dx * dx + dy * dy)

  // Handle edge case where distance is 0
  if (d < 0.001) {
    return { hR: rY, wR: rX, stAng: 0, swAng: 0 }
  }

  // Normalize radii
  const rXa = Math.abs(rX)
  const rYa = Math.abs(rY)

  // Ensure radii are large enough
  const lambda = (rXa * rXa - rYa * rYa) / (rXa * rXa + rYa * rYa)
  const scaleFactor = Math.min(1, Math.sqrt(1 + lambda * lambda))
  const rXc = rXa / scaleFactor
  const rYc = rYa / scaleFactor

  // Compute angles
  // The angle from center to start/end points depends on the ellipse orientation
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  // Angle of midpoint to center (in ellipse coordinates)
  // Simplified calculation for the arc center
  const minR = Math.min(rXa, rYa)
  const maxR = Math.max(rXa, rYa)

  // The center is along the perpendicular bisector of the segment
  // Distance from midpoint to center
  let distToCenter: number
  if (rXa === 0 || rYa === 0) {
    distToCenter = 0
  } else {
    const term1 = Math.pow(d / 2, 2) / Math.pow(rXa, 2)
    const term2 = Math.pow(d / 2, 2) / Math.pow(rYa, 2)
    distToCenter = Math.sqrt(Math.max(0, Math.pow(d / 2, 2) * (1 - term1 - term2) / (term1 + term2 - 1)))
  }

  // For a non-rotated ellipse, the center would be at midpoint
  // The actual center depends on largeArc and sweep flags
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2

  // Compute start angle (angle from center to start point)
  // Adjusted for ellipse rotation
  let startAngle = Math.atan2(y1 - midY, x1 - midX) - phi

  // Compute end angle (angle from center to end point)
  let endAngle = Math.atan2(y2 - midY, x2 - midX) - phi

  // Compute sweep angle
  let sweepAngle = endAngle - startAngle

  // Normalize sweep angle based on largeArc flag
  if (largeArc) {
    if (sweepAngle > 0) {
      sweepAngle -= 2 * Math.PI
    } else {
      sweepAngle += 2 * Math.PI
    }
  }

  // Adjust sweep direction based on sweep flag
  if (!sweep) {
    sweepAngle = -sweepAngle
    startAngle = endAngle
  }

  // Convert angles to degrees for PPTX
  const stAng = (startAngle * 180) / Math.PI
  const swAng = (sweepAngle * 180) / Math.PI

  return {
    hR: rYc,
    wR: rXc,
    stAng,
    swAng
  }
}
