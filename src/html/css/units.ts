// src/html/css/units.ts
//
// CSS unit conversion. PPTX (and therefore SIF) use px as the
// universal length unit; this module converts every CSS length
// value coming out of the cascade into a px number.
//
// Supported units:
//   px, em, rem, pt
//   unitless  → treated as px (used for line-height multipliers)
//   %         → not converted here (% is layout-stage)
//
// `parseColor` understands hex / rgb() / rgba() / hsl() / hsla()
// and a small set of CSS named colors. Returned value is an
// RGB+alpha object that downstream code can serialise to whatever
// format a given SIF field needs (hex, rgba, …).

export interface ToPxOptions {
  /** Base font size for em/rem conversion. Default 16. */
  baseFontSize?: number
}

const LENGTH_RE = /^(-?\d*\.?\d+)\s*(px|em|rem|pt|cm|mm|in)?$/i

/**
 * Convert a CSS length token to a px number. Returns `NaN` for
 * percentages, keywords, colors, or anything we can't interpret.
 */
export function toPx(value: string, options: ToPxOptions = {}): number {
  if (typeof value !== 'string') return NaN
  const trimmed = value.trim()
  if (trimmed === '') return NaN
  if (trimmed === '0') return 0

  const m = LENGTH_RE.exec(trimmed)
  if (!m) return NaN

  const num = parseFloat(m[1])
  if (!Number.isFinite(num)) return NaN

  const unit = (m[2] || 'px').toLowerCase()
  const base = options.baseFontSize ?? 16

  switch (unit) {
    case 'px':
      return num
    case 'em':
    case 'rem':
      return num * base
    case 'pt':
      return num * (4 / 3) // 1pt = 1.333...px
    case 'cm':
      return num * 96 / 2.54
    case 'mm':
      return num * 96 / 25.4
    case 'in':
      return num * 96
    default:
      return NaN
  }
}

export interface ParsedLength {
  value: number
  unit: 'px' | 'em' | 'rem' | 'pt' | '%' | ''
}

/** Parse a length string into its numeric value and unit. */
export function parseLength(value: string): ParsedLength | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  // unitless number
  if (/^-?\d*\.?\d+$/.test(trimmed)) {
    return { value: parseFloat(trimmed), unit: 'px' }
  }
  const m = /^(-?\d*\.?\d+)\s*([a-z%]+)$/i.exec(trimmed)
  if (!m) return null
  const unit = m[2].toLowerCase() as ParsedLength['unit']
  return { value: parseFloat(m[1]), unit }
}

/** True if the string is a length (px / em / rem / pt / unitless). */
export function isLength(value: string): boolean {
  const parsed = parseLength(value)
  if (!parsed) return false
  return parsed.unit !== '%'
}

// =============================================================================
// Color parsing
// =============================================================================

export interface ParsedColor {
  kind: 'rgb'
  r: number
  g: number
  b: number
  /** 0..1 */
  a: number
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  fuchsia: [255, 0, 255],
  purple: [128, 0, 128],
  orange: [255, 165, 0],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
  gold: [255, 215, 0],
  indigo: [75, 0, 130],
  transparent: [0, 0, 0],
  // common CSS system colors we may encounter
  currentcolor: [0, 0, 0],
}

/**
 * Parse a CSS color string into RGB+alpha. Returns `undefined` for
 * unrecognised inputs. The output is always `{ kind: 'rgb', ... }`
 * — the SIF / PPTX layer doesn't need a separate `hsl` branch.
 */
export function parseColor(value: string): ParsedColor | undefined {
  if (typeof value !== 'string') return undefined
  const s = value.trim().toLowerCase()
  if (!s) return undefined

  // Named
  if (s in NAMED_COLORS) {
    const [r, g, b] = NAMED_COLORS[s]
    return { kind: 'rgb', r, g, b, a: s === 'transparent' ? 0 : 1 }
  }

  // Hex
  if (s.startsWith('#')) return parseHex(s.slice(1))

  // rgb / rgba
  const rgbMatch = /^rgba?\(\s*([^)]+)\)$/.exec(s)
  if (rgbMatch) return parseRgbArgs(rgbMatch[1])

  // hsl / hsla
  const hslMatch = /^hsla?\(\s*([^)]+)\)$/.exec(s)
  if (hslMatch) return parseHslArgs(hslMatch[1])

  return undefined
}

function parseHex(hex: string): ParsedColor | undefined {
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    if ([r, g, b].some(n => Number.isNaN(n))) return undefined
    return { kind: 'rgb', r, g, b, a: 1 }
  }
  if (hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    const a = parseInt(hex[3] + hex[3], 16) / 255
    if ([r, g, b].some(n => Number.isNaN(n))) return undefined
    return { kind: 'rgb', r, g, b, a }
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if ([r, g, b].some(n => Number.isNaN(n))) return undefined
    return { kind: 'rgb', r, g, b, a: 1 }
  }
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = parseInt(hex.slice(6, 8), 16) / 255
    if ([r, g, b].some(n => Number.isNaN(n))) return undefined
    return { kind: 'rgb', r, g, b, a }
  }
  return undefined
}

function parseRgbArgs(args: string): ParsedColor | undefined {
  const parts = args.split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return undefined
  const [rRaw, gRaw, bRaw, aRaw] = parts
  const r = parseColorComponent(rRaw, 255)
  const g = parseColorComponent(gRaw, 255)
  const b = parseColorComponent(bRaw, 255)
  if ([r, g, b].some(n => Number.isNaN(n))) return undefined
  const a = aRaw !== undefined ? parseAlpha(aRaw) : 1
  return { kind: 'rgb', r, g, b, a }
}

function parseHslArgs(args: string): ParsedColor | undefined {
  const parts = args.split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return undefined
  const h = parseHue(parts[0])
  const s = parsePercent(parts[1])
  const l = parsePercent(parts[2])
  if ([h, s, l].some(n => Number.isNaN(n))) return undefined
  const a = parts[3] !== undefined ? parseAlpha(parts[3]) : 1
  const { r, g, b } = hslToRgb(h, s, l)
  return { kind: 'rgb', r, g, b, a }
}

function parseColorComponent(raw: string, max: number): number {
  if (raw.endsWith('%')) {
    return (parseFloat(raw) / 100) * max
  }
  return parseFloat(raw)
}

function parsePercent(raw: string): number {
  if (!raw.endsWith('%')) return NaN
  return parseFloat(raw) / 100
}

function parseHue(raw: string): number {
  if (raw.endsWith('deg')) return parseFloat(raw)
  if (raw.endsWith('rad')) return (parseFloat(raw) * 180) / Math.PI
  if (raw.endsWith('turn')) return parseFloat(raw) * 360
  // unitless → degrees
  return parseFloat(raw)
}

function parseAlpha(raw: string): number {
  if (raw.endsWith('%')) return parseFloat(raw) / 100
  return parseFloat(raw)
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  // h ∈ [0, 360), s,l ∈ [0, 1]
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r1 = 0, g1 = 0, b1 = 0
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; b1 = 0 }
  else if (hp < 2) { r1 = x; g1 = c; b1 = 0 }
  else if (hp < 3) { r1 = 0; g1 = c; b1 = x }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = c }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = c }
  else if (hp < 6) { r1 = c; g1 = 0; b1 = x }
  const m = l - c / 2
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}
