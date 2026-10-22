// SVG `<pattern>` element support (Phase 0.2).
//
// An SVG pattern is a small tile (defined by its `width` / `height`)
// that gets repeated across the filled region's bounding box. The
// tile can contain any SVG shapes — rect, circle, path, etc. —
// and may itself reference gradients or use its own `patternTransform`.
//
// We model the pattern as a self-contained SIF group: a child
// `<g>` whose coordinates are local to the pattern's `viewBox`.
// The PPTX layer rasterises this group to a PNG and uses it as
// a repeating image fill. The pattern's `x`/`y`/`width`/`height`
// are kept on the `PatternTemplate` so the renderer can compute
// the tile's pixel size.
//
// We do *not* attempt to resolve `patternUnits` / `patternContentUnits`
// here — those are handled downstream when the PPTX layer stamps
// the tile onto the filled shape.

import type { Element } from '../../sif/types/elements/base'

export type PatternUnits = 'userSpaceOnUse' | 'objectBoundingBox'
export type PatternContentUnits = 'userSpaceOnUse' | 'objectBoundingBox'

export interface PatternTemplate {
  id: string
  /** Tile size in user units. `width` and `height` are required
   *  by the SVG spec; we default to 0 if missing (the tile won't
   *  render but the parent fill still resolves). */
  width: number
  height: number
  /** Tile origin in user units. Defaults to (0, 0). */
  x: number
  y: number
  /** Coordinate system for the tile's positioning attributes. */
  patternUnits: PatternUnits
  /** Coordinate system for the tile's child geometry. */
  patternContentUnits: PatternContentUnits
  /** Optional transform applied to the tile before tiling. Stored
   *  as a raw string for downstream parsing — we don't try to
   *  apply it during conversion because the PPTX layer rasterises
   *  the rendered tile and the transform gets baked in. */
  patternTransform?: string
  /** Children to render inside the tile. Already-converted SIF
   *  elements. */
  children: Element[]
}

/** Heuristic: does the def look like a `<pattern>`?
 *
 *  In the flattened defs map the `<pattern>` wrapper is gone; the
 *  def record is keyed by the pattern's first child element. The
 *  `patternUnits` / `patternContentUnits` attributes remain on the
 *  def record itself, and so do the pattern's `width` / `height`
 *  (the pattern's *own* dimensions, distinct from the inner
 *  shape's width/height).
 */
export function looksLikePattern(def: Record<string, unknown>): boolean {
  if (!def) return false
  if ('@_patternUnits' in def || '@_patternContentUnits' in def) return true
  if ('@_width' in def && '@_height' in def) {
    for (const key of ['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line']) {
      if (key in def) return true
    }
  }
  return false
}

/** Build a `PatternTemplate` from a defs-map entry. The
 *  `convertChild` callback receives a tag-keyed envelope
 *  (`{ circle: { ...attributes } }`) and returns the converted
 *  SIF element. This is the same shape the main converter feeds
 *  to its `convertElement` dispatch, so the callback can pass
 *  the envelope straight through. */
export function convertPattern(
  def: Record<string, unknown>,
  id: string,
  convertChild: (envelope: Record<string, unknown>) => Element | undefined
): PatternTemplate {
  const width = parsePositiveNumber(getAttr(def, 'width'), 0)
  const height = parsePositiveNumber(getAttr(def, 'height'), 0)
  const x = parseNumber(getAttr(def, 'x'), 0)
  const y = parseNumber(getAttr(def, 'y'), 0)
  const patternUnits = (getAttr(def, 'patternUnits') === 'objectBoundingBox'
    ? 'objectBoundingBox'
    : 'userSpaceOnUse') as PatternUnits
  const patternContentUnits = (getAttr(def, 'patternContentUnits') === 'objectBoundingBox'
    ? 'objectBoundingBox'
    : 'userSpaceOnUse') as PatternContentUnits
  const patternTransform = getAttr(def, 'patternTransform')

  const childEntries = collectPatternChildren(def)
  const children: Element[] = []
  for (const { tag, node } of childEntries) {
    const envelope: Record<string, unknown> = { [tag]: node }
    const converted = convertChild(envelope)
    if (converted) children.push(converted)
  }

  return {
    id,
    width,
    height,
    x,
    y,
    patternUnits,
    patternContentUnits,
    patternTransform,
    children
  }
}

function collectPatternChildren(def: Record<string, unknown>): Array<{ tag: string; node: Record<string, unknown> }> {
  // Returns a list of `{ tag, node }` pairs so the caller can wrap
  // each child in a tag-keyed envelope before handing it to the
  // element converter (the converter expects a wrapper key like
  // `circle` / `rect` to disambiguate the element type).
  const result: Array<{ tag: string; node: Record<string, unknown> }> = []
  for (const key of Object.keys(def)) {
    if (key.startsWith('@_')) continue
    if (key === ':@') continue
    const value = (def as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          result.push({ tag: key, node: item as Record<string, unknown> })
        }
      }
    } else if (value && typeof value === 'object') {
      result.push({ tag: key, node: value as Record<string, unknown> })
    }
  }
  return result
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
