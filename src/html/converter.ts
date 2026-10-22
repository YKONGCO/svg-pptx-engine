// src/html/converter.ts
//
// HTML → SIF converter (M1-M9).
//
// Pipeline:
//   1. Run the M0 cascade to compute CSS for every element.
//   2. Walk <body>'s children, dispatching each into the right
//      converter (text, container, list, media, svg).
//   3. Wrap multiple children in a top-level SIF GroupElement with
//      `layout: 'block'` so the layout pass stacks them vertically.
//   4. Run the layout pass (fill missing dimensions from intrinsic
//      size, then position children) so the result has absolute
//      coordinates when it reaches the PPTX renderer.
//   5. Build the SlideDocument from <body>'s width/height/background
//      and a few data-* metadata fields.

import { PROTOCOL_VERSION } from '../sif/version'
import type { SlideDocument, DocumentMeta, SlideBackground } from '../sif/types/document'
import type { Element } from '../sif/types/elements/base'
import type { GroupElement } from '../sif/types/elements/group'
import { htmlToStyleMap } from './css/pipeline'
import { parseHTML, getAttr, getChildren, type HtmlElement } from './parser'
import { toPx } from './css/units'
import { convertAny } from './converters/dispatch'
import { fillLayoutDimensions, pass as layoutPass } from '../layout'

// =============================================================================
// Public API
// =============================================================================

export interface HtmlToDocumentOptions {
  baseDir?: string
  defaultFontFamily?: string
  useLayout?: 'auto' | 'off'
}

export interface HtmlToPptxOptions extends HtmlToDocumentOptions {
  layout?: string
  title?: string
  author?: string
  subject?: string
}

export function htmlToSif(html: string, options?: HtmlToDocumentOptions): Element[] {
  const doc = parseHTML(html)
  const styles = htmlToStyleMap(html)
  const bodyStyle = styles.get(doc.body.nodeId) ?? new Map()
  const width = readSize(bodyStyle, 'width') || 960
  const height = readSize(bodyStyle, 'height') || 540
  const elements = convertBody(doc.body, styles, options, width, height)
  return runLayout(elements, width, height, options)
}

export function htmlToSlideDocument(
  html: string,
  options?: HtmlToDocumentOptions
): SlideDocument {
  const doc = parseHTML(html)
  const styles = htmlToStyleMap(html)

  const bodyStyle = styles.get(doc.body.nodeId) ?? new Map()
  const width = readSize(bodyStyle, 'width') || 960
  const height = readSize(bodyStyle, 'height') || 540
  const bg = readBodyBackground(bodyStyle)

  const elements = convertBody(doc.body, styles, options, width, height)
  const laidOut = runLayout(elements, width, height, options)

  const meta: DocumentMeta = {
    title: getAttr(doc.root, 'data-pptx-title'),
    author: getAttr(doc.root, 'data-pptx-author'),
    subject: getAttr(doc.root, 'data-pptx-subject'),
  }

  const slide: SlideDocument['slides'][number] = {
    id: 'slide1',
    elements: laidOut,
  }
  if (bg) slide.background = { fill: bg }

  return {
    version: PROTOCOL_VERSION,
    width,
    height,
    slides: [slide],
    meta: {
      ...meta,
      title: meta.title ?? inferTitle(doc.body),
    },
  }
}

// =============================================================================
// Body conversion
// =============================================================================

function convertBody(
  body: HtmlElement,
  styles: Map<string, any>,
  options: HtmlToDocumentOptions | undefined,
  slideWidth: number,
  slideHeight: number
): Element[] {
  const direct = getChildren(body)
    .map(c => convertAny(c, styles, options))
    .filter((c): c is Element => c !== undefined)
  if (direct.length === 0) return []
  // Always wrap the body in a layout container at (0,0,slideW,slideH).
  // The layout pass uses this box to position children. Even a
  // single child benefits — without the wrapper, child elements
  // sit at their own (0,0) and the slide looks empty.
  const group: GroupElement = {
    id: 'body-block',
    type: 'group',
    layout: 'block',
    x: 0,
    y: 0,
    width: slideWidth,
    height: slideHeight,
    children: direct,
  }
  return [group]
}

/**
 * Apply the layout pass so each element ends up at its absolute
 * slide coordinate. The pre-pass fills in missing x/y/width/height
 * on layout groups (HTML containers rarely declare explicit
 * dimensions; the SVG converter does, the HTML one doesn't).
 *
 * HTML carries no position info — every coordinate comes from the
 * layout engine reading CSS (display, flex, padding, …). After
 * layout, the body-block wrapper's job is done: its descendants
 * now carry absolute slide coordinates. Strip the wrapper so
 * consumers see a flat element list rather than a single group
 * containing everything.
 */
function runLayout(
  elements: Element[],
  slideWidth: number,
  slideHeight: number,
  options?: HtmlToDocumentOptions
): Element[] {
  void slideWidth
  void slideHeight
  if (options?.useLayout === 'off') return elements
  const filled = fillLayoutDimensions(elements)
  const result = layoutPass(filled, { enabled: true, warnOnOverlap: false })
  return flattenLeaves(result.elements)
}

/**
 * Recursively drop all group wrappers, returning only the leaves
 * with their absolute slide coordinates intact. After the layout
 * pass every leaf already lives at its final slide position, so
 * unwrapping is purely a structural convenience for downstream
 * consumers (PPTX renderer, tests).
 */
function flattenLeaves(elements: Element[]): Element[] {
  const out: Element[] = []
  for (const el of elements) {
    if (el.type === 'group') {
      out.push(...flattenLeaves((el as GroupElement).children || []))
    } else {
      out.push(el)
    }
  }
  return out
}

// =============================================================================
// Helpers
// =============================================================================

function readSize(style: Map<string, string>, prop: string): number {
  const v = style.get(prop)
  if (!v) return 0
  const n = toPx(v)
  return Number.isFinite(n) ? n : 0
}

function readBodyBackground(style: Map<string, string>) {
  // Body background covers the whole slide. Use the same parser as
  // the SVG layer for consistency.
  const bg = style.get('background') || style.get('background-color')
  if (bg && bg !== 'none' && bg !== 'transparent') {
    return { type: 'solid', color: normalizeColor(bg) } as const
  }
  return undefined
}

function normalizeColor(raw: string): string {
  const { parseColor } = require('./css/units')
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

function inferTitle(body: HtmlElement): string | undefined {
  const h1 = findByTagDeep(body, 'h1')
  if (h1) return getTextContentDeep(h1)
  return undefined
}

function findByTagDeep(el: HtmlElement, tagName: string): HtmlElement | undefined {
  for (const c of el.children) {
    if (c.type === 'element') {
      if (c.tagName === tagName) return c
      const found = findByTagDeep(c, tagName)
      if (found) return found
    }
  }
  return undefined
}

function getTextContentDeep(el: HtmlElement): string {
  let out = ''
  for (const c of el.children) {
    if (c.type === 'text') out += c.text || ''
    else if (c.type === 'element') out += getTextContentDeep(c)
  }
  return out
}