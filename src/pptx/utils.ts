// PPTX Generation Utilities

import PptxGenJS from 'pptxgenjs'

// Type aliases for pptxgenjs types
export type ShapeTypeValue = 'rect' | 'ellipse' | 'line' | 'pentagon' | 'hexagon' | string
export type DashTypeValue = 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
export type ArrowTypeValue = 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
export type AlignValue = 'left' | 'center' | 'right' | 'justify'
export type VAlignValue = 'top' | 'middle' | 'bottom'

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
  transparent: '#00000000'
}

// DPI conversion (96 DPI is standard for pixel-based protocols)
export const PX_TO_INCH = 1 / 96
export const INCH_TO_PX = 96
export const PT_TO_INCH = 1 / 72
export const INCH_TO_PT = 72
export const PX_TO_PT = INCH_TO_PT * PX_TO_INCH

/**
 * Convert pixels to inches (pptxgenjs uses inches)
 */
export function pxToInch(px: number): number {
  return px * PX_TO_INCH
}

/**
 * Convert inches to pixels
 */
export function inchToPx(inch: number): number {
  return inch * INCH_TO_PX
}

/**
 * Convert pixels to points
 */
export function pxToPt(px: number): number {
  return px * PX_TO_PT
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toHexByte(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
}

function normalizeColorInput(color: string): string {
  return color.trim().toLowerCase()
}

function parseColorToHex(color: string): string {
  const normalized = normalizeColorInput(color)

  if (normalized in NAMED_COLORS) {
    return NAMED_COLORS[normalized]
  }

  const rgbMatch = normalized.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (rgbMatch) {
    const r = toHexByte(Number(rgbMatch[1]))
    const g = toHexByte(Number(rgbMatch[2]))
    const b = toHexByte(Number(rgbMatch[3]))
    const alpha = rgbMatch[4] === undefined ? '' : toHexByte(Number(rgbMatch[4]) * 255)
    return `#${r}${g}${b}${alpha}`
  }

  const rgbPercentMatch = normalized.match(/^rgba?\(\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (rgbPercentMatch) {
    const r = toHexByte((Number(rgbPercentMatch[1]) / 100) * 255)
    const g = toHexByte((Number(rgbPercentMatch[2]) / 100) * 255)
    const b = toHexByte((Number(rgbPercentMatch[3]) / 100) * 255)
    const alpha = rgbPercentMatch[4] === undefined ? '' : toHexByte(Number(rgbPercentMatch[4]) * 255)
    return `#${r}${g}${b}${alpha}`
  }

  if (normalized.startsWith('#')) {
    if (normalized.length === 4) {
      const r = normalized[1]
      const g = normalized[2]
      const b = normalized[3]
      return `#${r}${r}${g}${g}${b}${b}`
    }
    if (normalized.length === 5) {
      const r = normalized[1]
      const g = normalized[2]
      const b = normalized[3]
      const a = normalized[4]
      return `#${r}${r}${g}${g}${b}${b}${a}${a}`
    }
    return normalized
  }

  return normalized
}

/**
 * Convert points to pixels
 */
export function ptToPx(pt: number): number {
  return pt / PX_TO_PT
}

/**
 * Convert hex color to pptxgenjs format (without #)
 */
export function hexToPptxColor(hex: string): string {
  const color = parseColorToHex(hex).replace(/^#/, '')

  // Handle 3-character hex
  if (color.length === 3) {
    return color
      .split('')
      .map(c => c + c)
      .join('')
      .toUpperCase()
  }

  // Handle 8-character hex (with alpha)
  if (color.length === 8) {
    return color.slice(0, 6).toUpperCase()
  }

  return color.slice(0, 6).toUpperCase()
}

/**
 * Convert hex color to pptxgenjs color with transparency
 */
export function hexToPptxColorWithAlpha(hex: string): { color: string; transparency?: number } {
  const color = parseColorToHex(hex).replace(/^#/, '')

  if (color.length === 8) {
    // SIF uses #RRGGBBAA
    const alpha = parseInt(color.slice(6, 8), 16) / 255
    const transparency = Math.round((1 - alpha) * 100)
    return {
      color: color.slice(0, 6).toUpperCase(),
      transparency
    }
  }

  return { color: color.slice(0, 6).toUpperCase() }
}

/**
 * Convert opacity (0-1) to transparency (0-100)
 */
export function opacityToTransparency(opacity?: number): number | undefined {
  if (opacity === undefined) return undefined
  return Math.round((1 - opacity) * 100)
}

/**
 * Convert transparency (0-100) to opacity (0-1)
 */
export function transparencyToOpacity(transparency?: number): number | undefined {
  if (transparency === undefined) return undefined
  return (100 - transparency) / 100
}

/**
 * Normalize hex color (ensure 6 characters)
 */
export function normalizeHexColor(hex: string): string {
  let color = hex.replace(/^#/, '')

  // Expand 3-character hex to 6-character
  if (color.length === 3) {
    color = color
      .split('')
      .map(c => c + c)
      .join('')
  }

  return '#' + color.slice(0, 6)
}

/**
 * Check if value is a valid hex color
 */
export function isValidHexColor(hex: string): boolean {
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex)
}

/**
 * Convert dash array string to pptxgenjs dash type
 */
export function dashArrayToDashType(dashArray?: string): DashTypeValue {
  if (!dashArray) return 'solid'

  const parts = dashArray.split(',').map(p => parseFloat(p.trim()))

  if (parts.length === 2) {
    const [dash, gap] = parts
    if (dash === 0 && gap > 0) return 'sysDot'
    if (dash === gap) {
      if (dash === 5) return 'dash'
      if (dash === 10) return 'lgDash'
    }
    if (dash === 5 && gap === 2) return 'dashDot'
  }

  if (parts.length === 4) {
    const [a, b, c, d] = parts
    if (a === 10 && b === 3 && c === 3 && d === 3) return 'lgDashDot'
  }

  if (parts.length === 6) {
    const [a, b, c, d, e, f] = parts
    if (a === 10 && b === 3 && c === 3 && d === 3 && e === 3 && f === 3) return 'lgDashDotDot'
  }

  return 'solid'
}

/**
 * Convert line cap to pptxgenjs format
 */
export function lineCapToPptx(lineCap?: 'round' | 'square' | 'butt'): ArrowTypeValue | undefined {
  if (!lineCap) return undefined

  // Note: pptxgenjs doesn't have lineCap, only arrow types
  // We'll use this for arrow markers in the future
  return undefined
}

/**
 * Convert line join to pptxgenjs format
 */
export function lineJoinToPptx(lineJoin?: 'round' | 'bevel' | 'miter'): ArrowTypeValue | undefined {
  // pptxgenjs doesn't have lineJoin property
  return undefined
}

/**
 * Convert arrow head type to pptxgenjs format
 */
export function arrowTypeToPptx(type?: string): ArrowTypeValue | undefined {
  if (!type) return undefined

  switch (type) {
    case 'arrow':
      return 'arrow'
    case 'diamond':
      return 'diamond'
    case 'circle':
      return 'oval'
    case 'open':
      return 'stealth'
    case 'none':
    default:
      return 'none'
  }
}

/**
 * Map shape type from SIF to pptxgenjs
 */
export function shapeTypeToPptx(shapeType: string): ShapeTypeValue {
  const mapping: Record<string, ShapeTypeValue> = {
    rect: 'rect',
    circle: 'ellipse',
    ellipse: 'ellipse',
    // Note: pptxgenjs doesn't support arbitrary paths, polygons, or polylines directly
    // We'll need to handle these specially
    path: 'rect',
    line: 'line',
    polygon: 'pentagon',
    polyline: 'pentagon'
  }

  return mapping[shapeType] || 'rect'
}

/**
 * Convert text align to pptxgenjs format
 */
export function textAlignToPptx(align?: 'left' | 'center' | 'right' | 'justify'): AlignValue {
  return align || 'left'
}

/**
 * Convert vertical align to pptxgenjs format
 */
export function verticalAlignToPptx(align?: 'top' | 'middle' | 'bottom' | 'baseline'): VAlignValue {
  switch (align) {
    case 'top':
      return 'top'
    case 'middle':
      return 'middle'
    case 'bottom':
      return 'bottom'
    case 'baseline':
    default:
      return 'top'
  }
}

export function convertHyperlink(
  hyperlink?: { href: string; tooltip?: string },
  slideNumber?: number
): PptxGenJS.HyperlinkProps | undefined {
  if (!hyperlink) return undefined

  if (slideNumber !== undefined) {
    return {
      slide: slideNumber,
      tooltip: hyperlink.tooltip
    }
  }

  return {
    url: hyperlink.href,
    tooltip: hyperlink.tooltip
  }
}

/**
 * Convert font weight to boolean
 */
export function fontWeightToBool(weight?: string | number): boolean {
  if (typeof weight === 'number') {
    return weight >= 700
  }
  return weight === 'bold' || weight === 'bolder'
}

/**
 * Convert font style to boolean
 */
export function fontStyleToBool(style?: string): boolean {
  return style === 'italic' || style === 'oblique'
}

/**
 * Get image data from URL or path
 */
export async function getImageData(src: string): Promise<{ data?: string; path?: string }> {
  // If it's a data URI, return as data
  if (src.startsWith('data:')) {
    return { data: src }
  }

  // If it's a URL, we'll need to fetch it
  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const response = await fetch(src)
      const blob = await response.blob()
      const base64 = await blobToBase64(blob)
      return { data: base64 }
    } catch {
      // Fallback: return as path (pptxgenjs can handle URLs)
      return { path: src }
    }
  }

  // Otherwise, assume it's a local path
  return { path: src }
}

/**
 * Convert blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Convert image href to pptxgenjs format
 */
export function imageHrefToPptx(href: string): { data?: string; path?: string } {
  if (href.startsWith('data:')) {
    return { data: href }
  }

  if (href.startsWith('http://') || href.startsWith('https://')) {
    // For URLs, try to use as path first - pptxgenjs can handle http URLs
    return { path: href }
  }

  // Local path
  return { path: href }
}

/**
 * Calculate polygon points from SVG points string
 */
export function svgPointsToPolygon(points: string): string {
  // Convert "x1,y1 x2,y2 ..." to pptxgenjs polygon format
  // pptxgenjs uses a simpler format for polygons
  const pairs = points.trim().split(/\s+/)
  return pairs.join(' ')
}

/**
 * Convert image fit to pptxgenjs sizing type
 */
export function imageFitToSizing(
  fit?: 'cover' | 'contain' | 'fill' | 'none'
): { type: 'contain' | 'cover' | 'crop'; w: number; h: number } | undefined {
  if (!fit || fit === 'none') return undefined

  // pptxgenjs uses 'crop' instead of 'fill'
  const type = fit === 'fill' ? 'crop' : fit

  return {
    type,
    w: 0,  // Will be set by caller
    h: 0   // Will be set by caller
  }
}

// Re-export ShapeType from pptxgenjs for use in converters
export { PptxGenJS }
