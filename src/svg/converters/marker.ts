// SVG `<marker>` element support (Phase 1.2).
//
// Builds a map of marker-id → ArrowMarker from the defs and resolves
// `marker-start` / `marker-end` / `marker-mid` attributes on lines and
// polylines into structured ArrowMarker values. The PPTX layer then
// reads `.type` (and optionally color/size) from these structures to
// drive `beginArrowType` / `endArrowType`.
//
// Two resolution strategies are tried in order:
//   1. Exact id match in the marker map (preferred — captures the
//      <marker> definition's refX/refY/orient/etc.)
//   2. Name-based heuristic (backward compat with existing fixtures
//      that reference an id but omit the <marker> definition)
import type { ArrowHeadType, ArrowMarker, MarkerOrient } from '../../sif/types/elements/line'
import { getAttr, getAttrs } from '../parser'

/** id → ArrowMarker map built from <defs>. */
export type MarkerMap = Map<string, ArrowMarker>

/**
 * Build a marker map from a flat defs map. <marker> entries are
 * recognized by attribute fingerprint (id + viewBox or refX/refY).
 * Non-marker defs are ignored.
 */
export function buildMarkerMap(defs: Map<string, Record<string, unknown>>): MarkerMap {
  const map: MarkerMap = new Map()
  for (const [id, def] of defs) {
    const marker = parseMarkerDef(id, def)
    if (marker) {
      map.set(id, marker)
    }
  }
  return map
}

/**
 * Resolve `marker-start` / `marker-end` / `marker-mid` attribute values
 * to ArrowMarker structures. Returns the parsed markers or
 * `undefined` if the attribute is absent.
 */
export function resolveMarkerAttribute(
  raw: string | undefined,
  markerMap: MarkerMap
): ArrowMarker | undefined {
  if (!raw) return undefined
  const id = stripUrlWrapper(raw)
  if (!id) return undefined

  const known = markerMap.get(id)
  if (known) return known

  // Fallback: synthetic marker inferred from the id (legacy heuristic
  // preserved so existing fixtures continue to render arrows).
  return syntheticMarkerFromId(id)
}

/** Strip `url(#...)` from a `marker-*` attribute value, if present. */
export function stripUrlWrapper(value: string): string | undefined {
  const match = value.match(/^url\(#([^)]+)\)$/)
  if (match) return match[1]
  return value.startsWith('#') ? value.slice(1) : value
}

function parseMarkerDef(id: string, def: Record<string, unknown>): ArrowMarker | undefined {
  // Heuristic: must have either a viewBox or refX/refY to be a <marker>.
  // (A symbol with the same id would also have viewBox; that's why we
  // also require a child element OR a refX — markers always have an
  // anchor, symbols always have content. Both pass either check, so we
  // additionally inspect the type field — if it explicitly says
  // 'symbol', we skip it. The defs map is flat so this is best-effort.)
  const tag = getMarkerTag(def)
  if (tag && tag !== 'marker') return undefined

  const refX = readNumber(def, '@_refX')
  const refY = readNumber(def, '@_refY')
  const width = readNumber(def, '@_markerWidth')
  const height = readNumber(def, '@_markerHeight')
  const orient = readOrient(def)
  const type = inferMarkerTypeFromDef(def, id)
  const color = readMarkerColor(def)

  // We accept the def as a marker if any of these markers-specific
  // signals is present, or if a child element is present.
  if (refX === undefined && refY === undefined && width === undefined && height === undefined && !hasChildElement(def)) {
    return undefined
  }

  return {
    id,
    type,
    refX,
    refY,
    width,
    height,
    orient,
    color
  }
}

function readNumber(def: Record<string, unknown>, key: string): number | undefined {
  const value = getAttr(def, key.slice(2)) // strip leading @_
  if (value === undefined) return undefined
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

function readOrient(def: Record<string, unknown>): MarkerOrient | undefined {
  const value = getAttr(def, 'orient')
  if (!value) return undefined
  if (value === 'auto' || value === 'auto-start-reverse') return value
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

function readMarkerColor(def: Record<string, unknown>): string | undefined {
  // <marker> children may carry a `fill` attribute that overrides the
  // inherited line stroke color.
  for (const key of Object.keys(def)) {
    if (key.startsWith('@_')) continue
    const value = def[key]
    if (value && typeof value === 'object') {
      const child = value as Record<string, unknown>
      const fill = getAttr(child, 'fill')
      if (fill && fill !== 'none' && fill !== 'currentColor') return fill
      const stroke = getAttr(child, 'stroke')
      if (stroke && stroke !== 'none' && stroke !== 'currentColor') return stroke
    }
  }
  return undefined
}

function hasChildElement(def: Record<string, unknown>): boolean {
  for (const key of Object.keys(def)) {
    if (key.startsWith('@_')) continue
    if (['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'g'].includes(key)) {
      return true
    }
  }
  return false
}

/**
 * When a <marker> def is missing or unindexed, infer a coarse arrow
 * type from the id name. This is the legacy heuristic preserved for
 * backward compatibility with existing fixtures.
 */
export function inferMarkerTypeFromId(id: string): ArrowHeadType {
  const normalized = id.toLowerCase()
  if (normalized.includes('diamond')) return 'diamond'
  if (normalized.includes('circle') || normalized.includes('oval')) return 'circle'
  if (normalized.includes('open') || normalized.includes('stealth')) return 'open'
  if (normalized.includes('none')) return 'none'
  return 'arrow'
}

function inferMarkerTypeFromDef(def: Record<string, unknown>, id: string): ArrowHeadType {
  // If the marker contains a single <path>, look at its `d` for
  // recognizable shape outlines.
  for (const key of Object.keys(def)) {
    if (key === 'path' || key === 'polygon' || key === 'polyline') {
      const value = def[key]
      if (value && typeof value === 'object') {
        const d = getAttr(value as Record<string, unknown>, 'd') ?? ''
        if (d.includes('a') || d.includes('A')) return 'arrow'
        if (d.includes('z') && d.includes('M') && d.toUpperCase().includes('L')) {
          return inferMarkerTypeFromId(id)
        }
      }
    }
  }
  return inferMarkerTypeFromId(id)
}

function syntheticMarkerFromId(id: string): ArrowMarker {
  return { id, type: inferMarkerTypeFromId(id) }
}

/**
 * Best-effort detection of the source element tag in a defs map. The
 * map values are flat attribute bags, so we use a fingerprint.
 */
function getMarkerTag(def: Record<string, unknown>): string | undefined {
  // No attribute says "I'm a marker" — but if a `<symbol>` or `<svg>`
  // leaked in, we look at the presence of a child element to
  // distinguish.
  // (The current getDefs flattens everything, so the original tag is
  // generally unrecoverable. We default to accepting anything with a
  // viewBox or refX as a marker candidate; downstream
  // resolveMarkerAttribute re-validates against the explicit id.)
  return undefined
}

/** Resolve a `marker-*` value to an ArrowMarker, with marker-map awareness. */
export function resolveMarkerAttributeWithMap(
  raw: string | undefined,
  markerMap: MarkerMap
): ArrowMarker | undefined {
  if (!raw) return undefined
  const id = stripUrlWrapper(raw)
  if (!id) return undefined
  return markerMap.get(id) ?? syntheticMarkerFromId(id)
}

// Suppress unused warning for getAttrs which is exported in case the
// shape module wants to enumerate all marker attributes.
void getAttrs
