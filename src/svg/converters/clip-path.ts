// SVG `<clipPath>` element support (Phase 0.2A).
//
// A `<clipPath>` is a region-defining shape (or set of shapes) that
// the renderer uses to mask out everything outside it. The
// converter captures the simplest case — a single `<rect>` child
// — as a `ClipPathResource` that the PPTX layer can apply as a
// bounding-box crop. More complex clipPath defs (multi-shape,
// non-rect) are skipped with a console.warn so the rest of the
// conversion still succeeds.
//
// We do *not* honour `clipPathUnits` (always `userSpaceOnUse`) —
// this matches the current PPTX landing, which only crops in
// absolute coordinates.

export interface ClipPathResource {
  id: string
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  clipPathUnits: 'userSpaceOnUse' | 'objectBoundingBox'
}

/** Heuristic: does the def look like a `<clipPath>`?
 *
 *  In the flattened defs map the `<clipPath>` wrapper is gone; the
 *  def record is keyed by the clipPath's first child (e.g. `rect`).
 *  We treat any def that has a `rect`/`circle`/`ellipse`/`path`/
 *  `polygon`/`polyline` child as a candidate, but only single-rect
 *  clipPaths actually land in the resource map. Patterns, markers
 *  and filters are explicitly excluded so their defs don't trigger
 *  a false-positive flatten attempt.
 */
export function looksLikeClipPath(def: Record<string, unknown>): boolean {
  if (!def) return false
  // Defs that look like other resource kinds take priority.
  if ('@_patternUnits' in def || '@_patternContentUnits' in def) return false
  if ('@_markerWidth' in def || '@_markerHeight' in def || '@_refX' in def) return false
  if ('feGaussianBlur' in def || 'feOffset' in def || 'feDropShadow' in def || 'feColorMatrix' in def) return false
  if ('@_clipPathUnits' in def) return true
  for (const key of ['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline']) {
    if (key in def) return true
  }
  return false
}

/**
 * Build a `ClipPathResource` from a defs-map entry. Returns
 * `undefined` for clipPath defs we don't know how to flatten
 * (multi-shape, non-rect children, etc.).
 */
export function convertClipPath(
  def: Record<string, unknown>,
  id: string
): ClipPathResource | undefined {
  const clipPathUnits = (getAttr(def, 'clipPathUnits') === 'objectBoundingBox'
    ? 'objectBoundingBox'
    : 'userSpaceOnUse') as ClipPathResource['clipPathUnits']

  const rects = collectChildren(def, 'rect')
  if (rects.length === 1) {
    const rect = rects[0]
    return {
      id,
      type: 'rect',
      x: parseNumber(getAttr(rect, 'x'), 0),
      y: parseNumber(getAttr(rect, 'y'), 0),
      width: parsePositiveNumber(getAttr(rect, 'width'), 0),
      height: parsePositiveNumber(getAttr(rect, 'height'), 0),
      clipPathUnits
    }
  }

  // Multi-shape or non-rect clipPath: not yet supported. We do
  // not throw — the rest of the document can still be rendered.
  if (rects.length > 1 || hasNonRectChildren(def)) {
    if (typeof console !== 'undefined') {
      console.warn(`[svg-pptx] clipPath "${id}" is too complex to flatten; clipping will be skipped.`)
    }
  }
  return undefined
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

function hasNonRectChildren(def: Record<string, unknown>): boolean {
  for (const key of ['circle', 'ellipse', 'path', 'polygon', 'polyline', 'text']) {
    if (key in def) return true
  }
  return false
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
