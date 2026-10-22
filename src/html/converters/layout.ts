// src/html/converters/layout.ts
//
// Read CSS `display`, flex, and grid properties into GroupElement
// fields. The SIF layout engine (src/layout) consumes those fields.

import type { ComputedStyle } from '../css/cascade'
import { toPx } from '../css/units'
import { parseColor } from '../css/units'

export interface LayoutProps {
  layout?: 'block' | 'inline' | 'flex' | 'grid' | 'absolute'
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  justifyContent?: 'flex-start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'
  alignItems?: 'flex-start' | 'center' | 'end' | 'stretch'
  gap?: number
  padding?: { top?: number; right?: number; bottom?: number; left?: number }
  gridTemplateColumns?: string[]
  gridTemplateRows?: string[]
}

const FLEX_DIRECTIONS: Record<string, LayoutProps['flexDirection']> = {
  row: 'row',
  'row-reverse': 'row-reverse',
  column: 'column',
  'column-reverse': 'column-reverse',
}

const FLEX_WRAPS: Record<string, LayoutProps['flexWrap']> = {
  nowrap: 'nowrap',
  wrap: 'wrap',
  'wrap-reverse': 'wrap-reverse',
}

const JUSTIFY: Record<string, LayoutProps['justifyContent']> = {
  'flex-start': 'flex-start',
  'start': 'flex-start',
  'flex-end': 'end',
  'end': 'end',
  'center': 'center',
  'space-between': 'space-between',
  'space-around': 'space-around',
  'space-evenly': 'space-evenly',
}

const ALIGN: Record<string, LayoutProps['alignItems']> = {
  'flex-start': 'flex-start',
  'start': 'flex-start',
  'flex-end': 'end',
  'end': 'end',
  'center': 'center',
  'stretch': 'stretch',
  // baseline isn't in GroupElement.alignItems; we drop it upstream.
}

export function readLayoutProps(style: ComputedStyle): LayoutProps {
  const display = (style.get('display') || '').toLowerCase().trim()
  const props: LayoutProps = {}

  if (display === 'flex' || display === 'inline-flex') {
    props.layout = 'flex'
    const dir = style.get('flex-direction')
    if (dir && FLEX_DIRECTIONS[dir]) props.flexDirection = FLEX_DIRECTIONS[dir]
    const wrap = style.get('flex-wrap')
    if (wrap && FLEX_WRAPS[wrap]) props.flexWrap = FLEX_WRAPS[wrap]
    const jc = style.get('justify-content')
    if (jc && JUSTIFY[jc]) props.justifyContent = JUSTIFY[jc]
    const ai = style.get('align-items')
    // PPTX layout supports a subset; 'baseline' is dropped (no equivalent).
    if (ai && ALIGN[ai]) props.alignItems = ALIGN[ai]
  } else if (display === 'grid' || display === 'inline-grid') {
    props.layout = 'grid'
    const cols = style.get('grid-template-columns')
    if (cols) props.gridTemplateColumns = cols.split(/\s+/).filter(Boolean)
    const rows = style.get('grid-template-rows')
    if (rows) props.gridTemplateRows = rows.split(/\s+/).filter(Boolean)
  } else if (display === 'block' || display === '') {
    props.layout = 'block'
  } else if (display === 'inline' || display === 'inline-block') {
    props.layout = 'inline'
  } else if (display === 'none') {
    // Best-effort: a `display: none` element gets no layout. The
    // converter skips it entirely; nothing to record here.
  }

  const gap = style.get('gap') || style.get('grid-gap')
  if (gap) {
    const n = toPx(gap)
    if (Number.isFinite(n)) props.gap = n
  }

  const pad = readPadding(style)
  if (pad) props.padding = pad

  return props
}

function readPadding(style: ComputedStyle): LayoutProps['padding'] {
  const top = style.get('padding-top')
  const right = style.get('padding-right')
  const bottom = style.get('padding-bottom')
  const left = style.get('padding-left')
  const shorthand = style.get('padding')
  let padTop: number | undefined, padRight: number | undefined, padBottom: number | undefined, padLeft: number | undefined
  if (shorthand) {
    const parts = shorthand.split(/\s+/).map(s => toPx(s)).filter(n => Number.isFinite(n))
    if (parts.length === 1) {
      padTop = padRight = padBottom = padLeft = parts[0]
    } else if (parts.length === 2) {
      padTop = padBottom = parts[0]
      padRight = padLeft = parts[1]
    } else if (parts.length === 3) {
      padTop = parts[0]
      padRight = padLeft = parts[1]
      padBottom = parts[2]
    } else if (parts.length >= 4) {
      padTop = parts[0]; padRight = parts[1]; padBottom = parts[2]; padLeft = parts[3]
    }
  }
  if (top) padTop = toPx(top)
  if (right) padRight = toPx(right)
  if (bottom) padBottom = toPx(bottom)
  if (left) padLeft = toPx(left)
  if (padTop === undefined && padRight === undefined && padBottom === undefined && padLeft === undefined) return undefined
  return { top: padTop, right: padRight, bottom: padBottom, left: padLeft }
}

// =============================================================================
// Background colour for a container (used to draw a filled rect behind
// the group). Returns undefined when no background is requested.
// =============================================================================

import type { Fill } from '../../sif/types/style/fill'
import type { GradientFill } from '../../sif/types/style/fill'
import type { LinearGradient, RadialGradient, GradientStop } from '../../sif/types/style/gradient'

export function readContainerBackground(style: ComputedStyle): Fill | undefined {
  const bg = style.get('background') || style.get('background-color')
  if (bg && bg !== 'none' && bg !== 'transparent') {
    return { type: 'solid', color: normalizeColor(bg) }
  }
  const bgImage = style.get('background-image')
  if (bgImage && bgImage !== 'none') {
    const gradient = parseBackgroundGradient(bgImage)
    if (gradient) return { type: 'gradient', gradient }
  }
  return undefined
}

function normalizeColor(raw: string): string {
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

function parseBackgroundGradient(value: string): LinearGradient | RadialGradient | undefined {
  const v = value.trim()
  const linear = /^linear-gradient\((.*)\)$/is.exec(v)
  if (linear) return parseLinear(linear[1])
  const radial = /^radial-gradient\((.*)\)$/is.exec(v)
  if (radial) return parseRadial(radial[1])
  return undefined
}

function parseLinear(args: string): LinearGradient | undefined {
  const parts = splitTopLevelCommas(args)
  if (parts.length === 0) return undefined
  let angle = 180
  const stopsStart = parts[0].trim().match(/^(-?\d*\.?\d+)(deg|rad|turn)?$/)
  if (stopsStart) {
    const n = parseFloat(stopsStart[1])
    if (Number.isFinite(n)) {
      angle = stopsStart[2] === 'rad' ? (n * 180) / Math.PI : stopsStart[2] === 'turn' ? n * 360 : n
    }
    parts.shift()
  }
  const stops: GradientStop[] = []
  for (const p of parts) {
    const stop = parseStop(p)
    if (stop) stops.push(stop)
  }
  if (stops.length < 2) return undefined
  return { type: 'linear', angle, stops }
}

function parseRadial(args: string): RadialGradient | undefined {
  const parts = splitTopLevelCommas(args)
  const stops: GradientStop[] = []
  for (const p of parts) {
    const trimmed = p.trim()
    if (/^(circle|ellipse|at\s)/.test(trimmed)) continue
    if (/^\d+(\.\d+)?(px|%)$/.test(trimmed)) continue
    const stop = parseStop(trimmed)
    if (stop) stops.push(stop)
  }
  if (stops.length < 2) return undefined
  return { type: 'radial', x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, r2: 0.5, stops }
}

function parseStop(raw: string): GradientStop | undefined {
  const m1 = /^(-?\d*\.?\d+)\s*%\s+(.+)$/.exec(raw.trim())
  if (m1) {
    const c = parseColor(m1[2])
    if (!c) return undefined
    return { offset: parseFloat(m1[1]) / 100, color: stopColor(c) }
  }
  const m2 = /^(.+?)\s+(-?\d*\.?\d+)\s*%$/.exec(raw.trim())
  if (m2) {
    const c = parseColor(m2[1])
    if (!c) return undefined
    return { offset: parseFloat(m2[2]) / 100, color: stopColor(c) }
  }
  const c = parseColor(raw.trim())
  if (!c) return undefined
  return { offset: 0, color: stopColor(c) }
}

function stopColor(c: { r: number; g: number; b: number; a: number }): string {
  return normalizeColor(`#${[c.r, c.g, c.b].map(n => n.toString(16).padStart(2, '0')).join('')}`)
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur)
  return out
}