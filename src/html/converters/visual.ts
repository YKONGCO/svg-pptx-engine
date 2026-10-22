// src/html/converters/visual.ts
//
// Convert CSS computed-style strings into SIF visual primitives:
// Fill, Stroke, VisualEffect, Transform. These are reused by both
// the block and inline converters.

import type { Fill, SolidFill, GradientFill } from '../../sif/types/style/fill'
import type { Stroke } from '../../sif/types/style/stroke'
import type { VisualEffect, ShadowEffect, BlurEffect } from '../../sif/types/style/effect'
import type { LinearGradient, RadialGradient, GradientStop } from '../../sif/types/style/gradient'
import type { Transform } from '../../sif/types/common'
import type { ComputedStyle } from '../css/cascade'
import { parseColor, toPx } from '../css/units'

// =============================================================================
// Fill (color / gradient / image)
// =============================================================================

/**
 * Read `color` from the computed style and return a SolidFill.
 * Returns `{ type: 'solid', color: '#000000' }` when the colour is
 * missing or unparseable.
 */
export function readInlineFill(raw: string): Fill {
  return { type: 'solid', color: normalizeColor(raw) }
}

export function readFill(style: ComputedStyle, fallback = '#000000'): Fill {
  const color = style.get('color')
  if (color) return { type: 'solid', color: normalizeColor(color) }
  return { type: 'solid', color: fallback }
}

/**
 * Read `background` / `background-color` / `background-image` from
 * the style. Returns `undefined` when the value is "none" or missing.
 */
export function readBackground(style: ComputedStyle): Fill | undefined {
  const bg = style.get('background') || style.get('background-color')
  if (bg && bg !== 'none' && bg !== 'transparent') {
    return { type: 'solid', color: normalizeColor(bg) }
  }
  const bgImage = style.get('background-image')
  if (bgImage && bgImage !== 'none') {
    const grad = parseGradient(bgImage)
    if (grad) return { type: 'gradient', gradient: grad }
  }
  return undefined
}

function parseGradient(value: string): LinearGradient | RadialGradient | undefined {
  const v = value.trim()
  const linearMatch = /^linear-gradient\((.*)\)$/is.exec(v)
  if (linearMatch) return parseLinearGradient(linearMatch[1])
  const radialMatch = /^radial-gradient\((.*)\)$/is.exec(v)
  if (radialMatch) return parseRadialGradient(radialMatch[1])
  return undefined
}

function parseLinearGradient(args: string): LinearGradient | undefined {
  // Argument may be an angle + stops, or just stops. We split top-level
  // commas; values with parens (e.g. rgb()) keep their commas intact.
  const parts = splitTopLevelCommas(args)
  if (parts.length === 0) return undefined
  let angle: number | undefined
  const stopsStart = parts[0].trim().match(/^(-?\d*\.?\d+)(deg|rad|turn)?$/)
  if (stopsStart) {
    angle = normaliseAngle(stopsStart[1], stopsStart[2])
    parts.shift()
  } else {
    angle = 180 // default top-to-bottom in CSS
  }
  const stops = parts.map(parseStop).filter((s): s is GradientStop => !!s)
  if (stops.length < 2) return undefined
  return { type: 'linear', angle, stops }
}

function parseRadialGradient(args: string): RadialGradient | undefined {
  // v1: shape + size at center; we accept just stops for simplicity.
  const parts = splitTopLevelCommas(args).map(s => s.trim())
  const stops: GradientStop[] = []
  for (const p of parts) {
    if (p.startsWith('circle') || p.startsWith('ellipse') || p.startsWith('at ') || p.endsWith('px') || p.endsWith('%')) continue
    const stop = parseStop(p)
    if (stop) stops.push(stop)
  }
  if (stops.length < 2) return undefined
  return { type: 'radial', x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, r2: 0.5, stops }
}

function parseStop(raw: string): GradientStop | undefined {
  // "0% #fff" / "0% rgba(0,0,0,0.5)" / "#fff 0%"
  const m1 = /^(-?\d*\.?\d+)\s*%\s+(.+)$/.exec(raw.trim())
  if (m1) {
    const color = parseColor(m1[2])
    if (!color) return undefined
    return { offset: parseFloat(m1[1]) / 100, color: serializeColor(color) }
  }
  const m2 = /^(.+?)\s+(-?\d*\.?\d+)\s*%$/.exec(raw.trim())
  if (m2) {
    const color = parseColor(m2[1])
    if (!color) return undefined
    return { offset: parseFloat(m2[2]) / 100, color: serializeColor(color) }
  }
  // stop without offset — use the previous offset + 0.5 step, or 0
  const color = parseColor(raw.trim())
  if (!color) return undefined
  return { offset: 0, color: serializeColor(color) }
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur)
  return out
}

function normaliseAngle(value: string, unit: string | undefined): number {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return 180
  switch (unit) {
    case 'rad': return (n * 180) / Math.PI
    case 'turn': return n * 360
    default: return n
  }
}

// =============================================================================
// Stroke (border)
// =============================================================================

/**
 * Read a SIF Stroke from the computed style. Returns `undefined`
 * when no border is set. v1 collapses border-top/right/bottom/left
 * into a single Stroke; that's fine for the typical "rounded card"
 * template.
 */
export function readStroke(style: ComputedStyle): Stroke | undefined {
  const width = readBorderWidth(style)
  if (!width) return undefined
  // Longhand wins. Then try parsing the shorthand for both color and
  // style so "border: 1px none #000" is correctly rejected.
  let color = style.get('border-color')
  let styleStr = style.get('border-style')
  const shorthand = style.get('border')
  if (shorthand) {
    const parsed = parseBorderShorthand(shorthand)
    if (!color) color = parsed.color
    if (!styleStr) styleStr = parsed.style
  }
  if (styleStr === 'none') return undefined
  return {
    type: 'solid',
    color: normalizeColor(color || '#000000'),
    width,
    lineCap: 'butt',
    lineJoin: 'miter',
  }
}

function parseBorderShorthand(value: string): { width?: number; style?: string; color?: string } {
  const out: { width?: number; style?: string; color?: string } = {}
  const tokens = value.split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    const widthMatch = /^(-?\d*\.?\d+(?:px|em|rem|pt)?)$/i.exec(token)
    if (widthMatch && !out.width) {
      const n = toPx(token)
      if (Number.isFinite(n)) out.width = n
      continue
    }
    const styleNames = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'none', 'hidden']
    if (styleNames.includes(token.toLowerCase())) {
      out.style = token.toLowerCase()
      continue
    }
    // Anything else: assume it's a color (hex, rgb(), named).
    if (!out.color) out.color = token
  }
  return out
}

function readBorderWidth(style: ComputedStyle): number {
  // Try longhand first, then shorthand.
  for (const side of ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']) {
    const v = style.get(side)
    if (v) {
      const n = toPx(v)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  // Shorthand `border: 1px solid #ccc` — try to extract a px value
  const shorthand = style.get('border')
  if (shorthand) {
    const parsed = parseBorderShorthand(shorthand)
    if (parsed.width && parsed.width > 0) return parsed.width
    const m = /(-?\d*\.?\d+)\s*(px|em|rem|pt)/.exec(shorthand)
    if (m) {
      const n = toPx(`${m[1]}${m[2]}`)
      if (Number.isFinite(n)) return n
    }
  }
  return 0
}

/**
 * Read border-radius (px or %) and return rx/ry. Single value →
 * applies to all corners. Returns undefined when no radius.
 */
export function readBorderRadius(style: ComputedStyle): { rx: number; ry: number } | undefined {
  const r = style.get('border-radius')
  if (!r) return undefined
  // Take the first length token. 50% on a 100×100 rect → 50; we use
  // 0 as a conservative default and let the layout pass refine.
  const tokens = r.split(/\s+/)
  const v = toPx(tokens[0])
  if (!Number.isFinite(v)) return undefined
  return { rx: v, ry: v }
}

// =============================================================================
// VisualEffect (box-shadow)
// =============================================================================

export function readEffect(style: ComputedStyle): VisualEffect | undefined {
  const shadow = style.get('box-shadow') || style.get('text-shadow')
  if (!shadow || shadow === 'none') return undefined
  return parseShadow(shadow)
}

function parseShadow(value: string): ShadowEffect | undefined {
  // box-shadow: "0 4px 12px rgba(0,0,0,0.06)"
  // box-shadow: "0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)"
  // SIF only models a single shadow per element; pick the first layer
  // (best-effort).
  const layers = splitTopLevelCommas(value).map(s => s.trim())
  for (const layer of layers) {
    const parsed = parseShadowLayer(layer)
    if (parsed) return parsed
  }
  return undefined
}

function parseShadowLayer(raw: string): ShadowEffect | undefined {
  // Match: offsetX offsetY blur [spread] [color]
  // First, extract the colour (any function call or hex) from the string.
  let color: string | undefined
  let rest = raw
  const colorMatch = /(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|hsla?\([^)]+\))/.exec(raw)
  if (colorMatch) {
    color = colorMatch[1]
    rest = raw.replace(colorMatch[1], '').trim()
  }
  const parts = rest.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return undefined
  const offsetX = toPx(parts[0])
  const offsetY = toPx(parts[1])
  const blur = parts[2] ? toPx(parts[2]) : 0
  const spread = parts[3] ? toPx(parts[3]) : 0
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return undefined
  return {
    type: 'shadow',
    offsetX,
    offsetY,
    blur,
    spread,
    color: color ? normalizeColor(color) : '#000000',
    opacity: 1,
  }
}

// =============================================================================
// Transform
// =============================================================================

export function readTransform(style: ComputedStyle): Transform | undefined {
  const value = style.get('transform')
  if (!value || value === 'none') return undefined
  return parseTransform(value)
}

function parseTransform(value: string): Transform | undefined {
  const t: Transform = {}
  // Match each function call: translate(...) / rotate(...) / scale(...)
  const re = /([a-zA-Z]+)\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    const fn = m[1].toLowerCase()
    const args = m[2].split(/[,\s]+/).filter(Boolean)
    if (fn === 'translate' || fn === 'translatex' || fn === 'translatey') {
      const px = args[0] ? toPx(args[0]) : 0
      if (fn === 'translatey') t.translateY = px
      else if (fn === 'translatex') t.translateX = px
      else {
        t.translateX = px
        t.translateY = args[1] ? toPx(args[1]) : 0
      }
    } else if (fn === 'rotate') {
      t.rotate = parseFloat(args[0]) || 0
    } else if (fn === 'scale' || fn === 'scalex' || fn === 'scaley') {
      const v = parseFloat(args[0]) || 1
      if (fn === 'scaley') t.scaleY = v
      else if (fn === 'scalex') t.scaleX = v
      else {
        t.scaleX = v
        t.scaleY = args[1] ? parseFloat(args[1]) : v
      }
    }
  }
  if (Object.keys(t).length === 0) return undefined
  return t
}

// =============================================================================
// Color normalisation
// =============================================================================

export function normalizeColor(raw: string): string {
  const parsed = parseColor(raw)
  if (!parsed) return raw
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase()
  const a = parsed.a
  if (a < 1) {
    return `#${toHex(parsed.r)}${toHex(parsed.g)}${toHex(parsed.b)}${toHex(Math.round(a * 255))}`
  }
  return `#${toHex(parsed.r)}${toHex(parsed.g)}${toHex(parsed.b)}`
}

function serializeColor(c: { r: number; g: number; b: number; a: number }): string {
  return normalizeColor(`#${[c.r, c.g, c.b].map(n => n.toString(16).padStart(2, '0')).join('')}`)
}
