// SVG `<mask>` element support (Phase 0.2A).
//
// A `<mask>` defines an alpha channel applied to the element it
// references via `mask="url(#id)"`. The simplest and most common
// case is a single `<rect>` whose `fill` is the mask colour
// (white = visible, black = hidden) and `fill-opacity` carries
// the per-region alpha.
//
// We capture this case as a `MaskResource` for the PPTX layer.
// More complex masks (gradient, multiple children) are skipped
// with a console.warn.
//
// Gradient masks (the common "fade-out" pattern — `<rect fill=
// "url(#fade)"/>` with a linearGradient white→black) are also
// captured: the gradient stops are resolved and the PPTX layer
// turns the host shape's solid fill into a gradient whose alpha
// follows each stop's BT.601 luminance. This is a 1-D
// approximation (works along the gradient axis) but covers the
// most common fade-in / fade-out vignettes.

import type { LinearGradient, RadialGradient } from '../../sif/types/style/gradient'

export interface MaskResource {
  id: string
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  maskUnits: 'userSpaceOnUse' | 'objectBoundingBox'
  opacity: number
  color: string
  gradient?: {
    type: 'linear' | 'radial'
    angle: number
    stops: Array<{ offset: number; color: string; opacity: number }>
  }
}

/** Heuristic: does the def look like a `<mask>`?
 *
 *  As with clipPath, the `<mask>` wrapper is gone in the flattened
 *  defs map; the def is keyed by the mask's first child. Patterns,
 *  markers and filters are explicitly excluded so their defs don't
 *  trigger a false-positive flatten attempt.
 */
export function looksLikeMask(def: Record<string, unknown>): boolean {
  if (!def) return false
  if ('@_patternUnits' in def || '@_patternContentUnits' in def) return false
  if ('@_markerWidth' in def || '@_markerHeight' in def || '@_refX' in def) return false
  if ('feGaussianBlur' in def || 'feOffset' in def || 'feDropShadow' in def || 'feColorMatrix' in def) return false
  if ('@_maskUnits' in def || '@_maskContentUnits' in def) return true
  for (const key of ['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline']) {
    if (key in def) return true
  }
  return false
}

export function convertMask(
  def: Record<string, unknown>,
  id: string,
  gradientMap?: Map<string, LinearGradient | RadialGradient>
): MaskResource | undefined {
  const maskUnits = (getAttr(def, 'maskUnits') === 'objectBoundingBox'
    ? 'objectBoundingBox'
    : 'userSpaceOnUse') as MaskResource['maskUnits']

  const rects = collectChildren(def, 'rect')
  if (rects.length === 1) {
    const rect = rects[0]
    const color = getAttr(rect, 'fill') || '#ffffff'
    return {
      id,
      type: 'rect',
      x: parseNumber(getAttr(rect, 'x'), 0),
      y: parseNumber(getAttr(rect, 'y'), 0),
      width: parsePositiveNumber(getAttr(rect, 'width'), 0),
      height: parsePositiveNumber(getAttr(rect, 'height'), 0),
      maskUnits,
      opacity: parseNumber(getAttr(rect, 'fill-opacity'), 1),
      color,
      gradient: resolveMaskGradient(color, gradientMap)
    }
  }

  if (typeof console !== 'undefined') {
    console.warn(`[svg-pptx] mask "${id}" is too complex to flatten; masking will be skipped.`)
  }
  return undefined
}

/**
 * When the mask's inner rect references a gradient via `url(#id)`,
 * look it up in the gradient map and return its stops + direction
 * so the PPTX layer can apply per-stop alpha modulation. Returns
 * `undefined` for solid colours or unresolved gradient refs.
 *
 * Direction is converted to a 0..360° angle: 0 = up (north), 90
 * = right (east). For a `<linearGradient>` with `x1=0% y1=0%
 * x2=100% y2=0%` (left→right) that's 90°.
 */
function resolveMaskGradient(
  fill: string,
  gradientMap?: Map<string, LinearGradient | RadialGradient>
): MaskResource['gradient'] {
  if (!fill.startsWith('url(#') || !gradientMap) return undefined
  const id = fill.slice(5, -1)
  const grad = gradientMap.get(id)
  if (!grad) return undefined

  const stops = grad.stops.map(stop => ({
    offset: stop.offset,
    color: stop.color,
    opacity: stop.opacity ?? 1
  }))

  if (grad.type === 'linear') {
    return {
      type: 'linear',
      angle: linearGradientAngle(grad),
      stops
    }
  }
  return {
    type: 'radial',
    angle: 0,
    stops
  }
}

function linearGradientAngle(grad: LinearGradient): number {
  // Match the PowerPoint angle convention used in
  // `convertFill`/`resolveLinearGradientAngle` (0 = horizontal
  // left→right, increasing clockwise). For the SVG default
  // `x1=0% y1=0% x2=100% y2=0%` this returns 0° — PowerPoint
  // renders `ang=0` as a left→right gradient. Missing endpoints
  // default to a horizontal left→right vector.
  const x1 = grad.x1 ?? 0
  const y1 = grad.y1 ?? 0
  const x2 = grad.x2 ?? 1
  const y2 = grad.y2 ?? 0
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return 0
  return Math.atan2(dy, dx) * (180 / Math.PI)
}

function collectChildren(def: Record<string, unknown>, name: string): Record<string, unknown>[] {
  const value = def[name]
  if (Array.isArray(value)) {
    return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
  }
  if (value && typeof value === 'object') {
    return [value as Record<string, unknown>]
  }
  return []
}

function getAttr(element: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!element) return undefined
  const attrKey = `@_${name}`
  if (attrKey in element) {
    return String(element[attrKey])
  }
  return undefined
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = parseNumber(value, fallback)
  return parsed > 0 ? parsed : fallback
}
