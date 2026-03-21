// Gradient converter - converts SVG gradients to SIF Gradient types
import type { LinearGradient, RadialGradient, GradientStop } from '../../sif/types/style/gradient'
import { parseColor, parseOpacity } from './color'

export function convertLinearGradient(
  gradient: Record<string, unknown>,
  _id: string
): LinearGradient {
  const stops = extractGradientStops(gradient)
  const x1 = parsePercent(getAttr(gradient, 'x1') || '0%')
  const y1 = parsePercent(getAttr(gradient, 'y1') || '0%')
  const x2 = parsePercent(getAttr(gradient, 'x2') || '100%')
  const y2 = parsePercent(getAttr(gradient, 'y2') || '0%')

  return {
    type: 'linear',
    stops,
    angle: calculateAngleFromCoords(x1, y1, x2, y2),
    x1,
    y1,
    x2,
    y2
  }
}

export function convertRadialGradient(
  gradient: Record<string, unknown>,
  _id: string
): RadialGradient {
  const stops = extractGradientStops(gradient)
  const cx = parsePercent(getAttr(gradient, 'cx') || '50%')
  const cy = parsePercent(getAttr(gradient, 'cy') || '50%')
  const fx = parsePercent(getAttr(gradient, 'fx') || getAttr(gradient, 'cx') || '50%')
  const fy = parsePercent(getAttr(gradient, 'fy') || getAttr(gradient, 'cy') || '50%')
  const fr = parsePercent(getAttr(gradient, 'fr') || '0%')
  const r = parsePercent(getAttr(gradient, 'r') || '50%')

  return {
    type: 'radial',
    stops,
    x1: fx,
    y1: fy,
    x2: cx,
    y2: cy,
    r1: fr,
    r2: r
  }
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
