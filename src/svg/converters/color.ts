// Color converter - converts SVG color formats to SIF Color type
import type { Color } from '../../sif/types/common'

/**
 * CSS named colors mapping to hex
 */
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#008000',
  blue: '#0000FF',
  yellow: '#FFFF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  gray: '#808080',
  grey: '#808080',
  orange: '#FFA500',
  purple: '#800080',
  pink: '#FFC0CB',
  brown: '#A52A2A',
  navy: '#000080',
  teal: '#008080',
  lime: '#00FF00',
  maroon: '#800000',
  olive: '#808000',
  silver: '#C0C0C0',
  aqua: '#00FFFF',
  transparent: 'transparent',
  none: 'none'
}

/**
 * Parse an SVG color value to a standard SIF Color string
 */
export function parseColor(value: string | undefined | null): Color {
  if (!value || value === 'none' || value === 'transparent') {
    return 'transparent'
  }

  const trimmed = value.trim().toLowerCase()

  // Check named colors
  if (NAMED_COLORS[trimmed]) {
    return NAMED_COLORS[trimmed]
  }

  // Handle rgb()/rgba() format
  const rgbMatch = trimmed.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10)
    const g = parseInt(rgbMatch[2], 10)
    const b = parseInt(rgbMatch[3], 10)
    const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1

    // Convert to hex
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`

    // Add alpha if not fully opaque
    if (a < 1) {
      const alpha = Math.round(a * 255).toString(16).padStart(2, '0')
      return `${hex}${alpha}`
    }
    return hex
  }

  // Handle percentage rgb format: rgb(100%, 0%, 0%)
  const pctMatch = trimmed.match(/^rgba?\s*\(\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (pctMatch) {
    const r = Math.round((parseFloat(pctMatch[1]) / 100) * 255)
    const g = Math.round((parseFloat(pctMatch[2]) / 100) * 255)
    const b = Math.round((parseFloat(pctMatch[3]) / 100) * 255)
    const a = pctMatch[4] ? parseFloat(pctMatch[4]) : 1

    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`

    if (a < 1) {
      const alpha = Math.round(a * 255).toString(16).padStart(2, '0')
      return `${hex}${alpha}`
    }
    return hex
  }

  // Handle hex colors
  if (trimmed.startsWith('#')) {
    // 3-char hex (#RGB)
    if (trimmed.length === 4) {
      const r = trimmed[1]
      const g = trimmed[2]
      const b = trimmed[3]
      return `#${r}${r}${g}${g}${b}${b}`
    }
    // 8-char hex with alpha (#RRGGBBAA)
    if (trimmed.length === 9) {
      return trimmed
    }
    // 6-char hex or 4-char with alpha
    return trimmed.slice(0, 7)
  }

  // Return as-is if we can't parse it (might be a valid custom color name)
  return trimmed
}

/**
 * Parse opacity from SVG format (0-1 or 0-100)
 */
export function parseOpacity(value: string | undefined | null): number | undefined {
  if (!value) return undefined

  const num = parseFloat(value)

  if (isNaN(num)) return undefined

  // SVG opacity is 0-1, but can also be specified as 0-100 in some contexts
  if (num > 1) {
    return num / 100
  }
  return num
}

/**
 * Extract opacity from a style string
 */
export function extractOpacityFromStyle(style: string | undefined): number | undefined {
  if (!style) return undefined

  const opacityMatch = style.match(/opacity\s*:\s*([\d.]+)/)
  if (opacityMatch) {
    return parseFloat(opacityMatch[1])
  }
  return undefined
}

/**
 * Parse stroke-dasharray into a dash pattern string
 */
export function parseDashArray(value: string | undefined): string | undefined {
  if (!value || value === 'none') return undefined
  return value.trim()
}

/**
 * Parse stroke-linecap to SIF format
 */
export function parseLineCap(value: string | undefined): 'round' | 'square' | 'butt' | undefined {
  if (!value) return undefined

  switch (value.toLowerCase()) {
    case 'round':
      return 'round'
    case 'square':
      return 'square'
    case 'butt':
    default:
      return 'butt'
  }
}

/**
 * Parse stroke-linejoin to SIF format
 */
export function parseLineJoin(value: string | undefined): 'round' | 'bevel' | 'miter' | undefined {
  if (!value) return undefined

  switch (value.toLowerCase()) {
    case 'round':
      return 'round'
    case 'bevel':
      return 'bevel'
    case 'miter':
    default:
      return 'miter'
  }
}
