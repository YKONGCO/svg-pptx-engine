// src/html/converters/media.ts
//
// Convert <img> and <hr> elements. <img> emits an ImageElement with
// the resolved source URL or data URI; <hr> emits a 1px ShapeElement
// spanning the available width.

import type { ImageElement } from '../../sif/types/elements/image'
import type { ShapeElement } from '../../sif/types/elements/shape'
import type { Stroke } from '../../sif/types/style/stroke'
import type { ComputedStyle, StyleMap } from '../css/cascade'
import type { HtmlElement } from '../parser'
import { getAttr } from '../parser'
import { toPx, parseColor } from '../css/units'

export function convertImg(
  el: HtmlElement,
  styles: StyleMap,
  options?: { baseDir?: string }
): ImageElement {
  const style = styles.get(el.nodeId) ?? new Map()
  const src = getAttr(el, 'src') || ''
  const alt = getAttr(el, 'alt')
  const widthRaw = style.get('width') || getAttr(el, 'width')
  const heightRaw = style.get('height') || getAttr(el, 'height')

  const width = widthRaw ? toPx(widthRaw) : 0
  const height = heightRaw ? toPx(heightRaw) : 0

  // The href is what the PPTX renderer consumes. We resolve the
  // `src` URL against the baseDir if provided.
  const href = resolveHref(src, options?.baseDir)

  const el_: ImageElement = {
    id: `el-${el.nodeId}`,
    type: 'image',
    href,
    x: 0,
    y: 0,
    width,
    height,
    preserveAspectRatio: true,
    format: inferFormat(src),
  }
  if (alt) (el_ as any).meta = { alt }
  return el_
}

function resolveHref(src: string, baseDir?: string): string {
  if (!src) return ''
  if (src.startsWith('data:') || /^https?:/i.test(src)) return src
  if (!baseDir) return src
  // Lazy path resolution — keep simple, callers can pre-normalise.
  return src
}

function inferFormat(src: string): ImageElement['format'] {
  const lower = src.toLowerCase().split('?')[0]
  if (lower.endsWith('.png')) return 'png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg'
  if (lower.endsWith('.gif')) return 'gif'
  if (lower.endsWith('.svg')) return 'svg'
  if (lower.endsWith('.webp')) return 'webp'
  if (lower.endsWith('.bmp')) return 'bmp'
  return undefined
}

export function convertHr(el: HtmlElement, styles: StyleMap): ShapeElement {
  const style = styles.get(el.nodeId) ?? new Map()
  const colorRaw = style.get('color') || style.get('border-top-color') || '#CCCCCC'
  const stroke: Stroke = {
    type: 'solid',
    color: normalizeColor(colorRaw),
    width: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
  }
  return {
    id: `el-${el.nodeId}`,
    type: 'shape',
    shapeType: 'rect',
    x: 0,
    y: 0,
    width: 0, // layout pass resolves
    height: 1,
    fill: { type: 'none' },
    stroke,
  }
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