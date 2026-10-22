// Gradient converter - converts SVG gradients to SIF Gradient types
import type { LinearGradient, RadialGradient, GradientStop, GradientTransform, GradientSpreadMethod } from '../../sif/types/style/gradient'
import { parseColor, parseOpacity } from './color'
import { parseTransformToMatrix, applyMatrixToPoint } from './group'

/** Optional resolver for `xlink:href` / `href` references on gradients.
 *  Pass `defsMap` so the converter can chase a chain of parent gradients
 *  and inherit stops + endpoint attributes per SVG 2 §13.2. */
export interface GradientConvertOptions {
  defsMap?: Map<string, Record<string, unknown>>
}

export function convertLinearGradient(
  gradient: Record<string, unknown>,
  _id: string,
  options?: GradientConvertOptions
): LinearGradient {
  const resolved = resolveGradientChain(gradient, options?.defsMap)
  const stops = extractGradientStops(resolved)
  const rawX1 = parsePercent(getAttr(resolved, 'x1') || '0%')
  const rawY1 = parsePercent(getAttr(resolved, 'y1') || '0%')
  const rawX2 = parsePercent(getAttr(resolved, 'x2') || '100%')
  const rawY2 = parsePercent(getAttr(resolved, 'y2') || '0%')
  const transform = parseGradientTransform(getAttr(resolved, 'gradientTransform'))
  const spreadMethod = parseSpreadMethod(getAttr(resolved, 'spreadMethod'))

  // When `gradientTransform` is set, the raw (x1, y1) / (x2, y2)
  // endpoints live in the gradient's own local space. We pre-bake
  // the transform into the endpoints so the renderer can stay
  // oblivious to gradientTransform (it just reads x1/y1/x2/y2).
  const p1 = applyMatrixToPoint(rawX1, rawY1, transform ?? [1, 0, 0, 1, 0, 0])
  const p2 = applyMatrixToPoint(rawX2, rawY2, transform ?? [1, 0, 0, 1, 0, 0])

  const result: LinearGradient = {
    type: 'linear',
    stops,
    angle: calculateAngleFromCoords(p1.x, p1.y, p2.x, p2.y),
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y
  }
  if (spreadMethod) result.spreadMethod = spreadMethod
  return result
}

export function convertRadialGradient(
  gradient: Record<string, unknown>,
  _id: string,
  options?: GradientConvertOptions
): RadialGradient {
  const resolved = resolveGradientChain(gradient, options?.defsMap)
  const stops = extractGradientStops(resolved)
  const rawCx = parsePercent(getAttr(resolved, 'cx') || '50%')
  const rawCy = parsePercent(getAttr(resolved, 'cy') || '50%')
  const rawFx = parsePercent(getAttr(resolved, 'fx') || getAttr(resolved, 'cx') || '50%')
  const rawFy = parsePercent(getAttr(resolved, 'fy') || getAttr(resolved, 'cy') || '50%')
  const fr = parsePercent(getAttr(resolved, 'fr') || '0%')
  const r = parsePercent(getAttr(resolved, 'r') || '50%')
  const transform = parseGradientTransform(getAttr(resolved, 'gradientTransform'))
  const spreadMethod = parseSpreadMethod(getAttr(resolved, 'spreadMethod'))

  const center = applyMatrixToPoint(rawCx, rawCy, transform ?? [1, 0, 0, 1, 0, 0])
  const focal = applyMatrixToPoint(rawFx, rawFy, transform ?? [1, 0, 0, 1, 0, 0])

  const result: RadialGradient = {
    type: 'radial',
    stops,
    x1: focal.x,
    y1: focal.y,
    x2: center.x,
    y2: center.y,
    r1: fr,
    r2: r
  }
  if (spreadMethod) result.spreadMethod = spreadMethod
  return result
}

/**
 * Phase 0.2B: Resolve an `xlink:href` / `href` reference chain on a
 * gradient. SVG 2 §13.2: a gradient that references another gradient
 * inherits its stops *and* any geometric / spreadMethod attributes the
 * child does not set itself.
 *
 * The returned record is a *merged* view: child attributes win; parent
 * attributes (and parent's `stop` children) fill in the gaps. Cycles
 * are guarded with a visited set.
 */
function resolveGradientChain(
  gradient: Record<string, unknown>,
  defsMap?: Map<string, Record<string, unknown>>
): Record<string, unknown> {
  if (!defsMap) return gradient
  const visited = new Set<string>()
  let current: Record<string, unknown> = gradient
  let mergedAttrs: Record<string, unknown> = { ...gradient }
  // Track whether we've seen any stops in the chain — child stops win
  // entirely (no per-stop merge); only fall back to parent stops when
  // the child gradient has no `stop` of its own.
  let hasStops = hasOwnStops(gradient)

  while (true) {
    const href = getGradientHref(current)
    if (!href) break
    const cleaned = href.replace(/^#/, '')
    if (visited.has(cleaned)) break
    visited.add(cleaned)

    const parent = defsMap.get(cleaned)
    if (!parent) break
    current = parent

    // Fill in missing attributes from the parent (child wins).
    for (const key of Object.keys(parent)) {
      if (key in mergedAttrs) continue
      // Don't inherit the href itself or the id.
      if (key === '@_href' || key === '@_xlink:href' || key === '@_id') continue
      mergedAttrs[key] = parent[key]
    }

    // Inherit stops only when the child has none of its own.
    if (!hasStops && hasOwnStops(parent)) {
      mergedAttrs.stop = parent.stop
      hasStops = true
    }
  }

  return mergedAttrs
}

function hasOwnStops(gradient: Record<string, unknown>): boolean {
  const stops = gradient.stop
  if (Array.isArray(stops)) return stops.length > 0
  return Boolean(stops)
}

function getGradientHref(gradient: Record<string, unknown>): string | undefined {
  const direct = getAttr(gradient, 'href')
  if (direct) return direct
  const xlink = getAttr(gradient, 'xlink:href')
  if (xlink) return xlink
  return undefined
}

/** Parse `gradientTransform` into a 2D affine matrix. Returns
 *  `undefined` when the attribute is missing or identity so we
 *  don't pay the cost of carrying the field through the renderer. */
function parseGradientTransform(value: string | undefined): GradientTransform | undefined {
  if (!value?.trim()) return undefined
  const matrix = parseTransformToMatrix(value)
  // Identity: don't store, save downstream renderers the check.
  if (matrix[0] === 1 && matrix[1] === 0 && matrix[2] === 0 && matrix[3] === 1 && matrix[4] === 0 && matrix[5] === 0) {
    return undefined
  }
  return matrix
}

/**
 * Phase 0.2B: SVG `spreadMethod` is one of `pad` / `reflect` / `repeat`.
 * Returns `undefined` for the default `pad` so the SIF stays compact —
 * renderers treat absence as `pad`.
 */
function parseSpreadMethod(value: string | undefined): GradientSpreadMethod | undefined {
  if (value === 'reflect' || value === 'repeat') return value
  return undefined
}

export function isLinearGradientDef(gradient: Record<string, unknown>): boolean {
  return getAttr(gradient, 'x1') !== undefined ||
    getAttr(gradient, 'x2') !== undefined ||
    (!getAttr(gradient, 'cx') && !getAttr(gradient, 'r'))
}

function extractGradientStops(gradient: Record<string, unknown>): GradientStop[] {
  const stopsValue = gradient.stop
  const stops = Array.isArray(stopsValue)
    ? stopsValue
    : stopsValue
      ? [stopsValue]
      : []

  return stops
    .filter(stop => stop && typeof stop === 'object')
    .map(stop => {
      const stopRecord = stop as Record<string, unknown>
      return {
        offset: normalizeOffset(parsePercent(getAttr(stopRecord, 'offset') || '0%')),
        color: parseStopColor(stopRecord),
        opacity: parseStopOpacity(stopRecord)
      }
    })
    .sort((a, b) => a.offset - b.offset)
}

function parseStopColor(stop: Record<string, unknown>): string {
  const style = parseStyle(getAttr(stop, 'style'))
  const color = style['stop-color'] || getAttr(stop, 'stop-color')
  return parseColor(color || '#000000')
}

function parseStopOpacity(stop: Record<string, unknown>): number | undefined {
  const style = parseStyle(getAttr(stop, 'style'))
  return parseOpacity(style['stop-opacity'] || getAttr(stop, 'stop-opacity'))
}

function parsePercent(value: string): number {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    return parseFloat(trimmed.slice(0, -1)) / 100
  }
  const parsed = parseFloat(trimmed)
  return Number.isNaN(parsed) ? 0 : parsed
}

function normalizeOffset(offset: number): number {
  if (offset < 0) return 0
  if (offset > 1) return offset > 100 ? 1 : offset / 100
  return offset
}

function calculateAngleFromCoords(x1: number, y1: number, x2: number, y2: number): number {
  const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
  return angle < 0 ? angle + 360 : angle
}

function parseStyle(style: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!style) return result

  for (const part of style.split(';')) {
    const [rawKey, rawValue] = part.split(':')
    if (!rawKey || !rawValue) continue
    result[rawKey.trim()] = rawValue.trim()
  }

  return result
}

function getAttr(element: Record<string, unknown>, name: string): string | undefined {
  const attrKey = `@_${name}`
  if (attrKey in element) {
    return String(element[attrKey])
  }
  return undefined
}
