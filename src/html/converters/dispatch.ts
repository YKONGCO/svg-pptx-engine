// src/html/converters/dispatch.ts
//
// Central dispatch for HTML element → SIF element. Tries each
// converter in turn and returns the first non-undefined result.
// Falls back to a generic text conversion so unknown tags still
// surface their content.

import type { Element } from '../../sif/types/elements/base'
import type { StyleMap } from '../css/cascade'
import type { HtmlElement } from '../parser'
import { tryConvertContainer } from './container'
import { tryConvertList, tryConvertBlockquote } from './list'
import { convertTextElement } from './text'
import { convertImg, convertHr } from './media'

export function convertAny(
  el: HtmlElement,
  styles: StyleMap,
  options?: { defaultFontFamily?: string; baseDir?: string }
): Element | undefined {
  // `display: none` → drop entirely.
  const style = styles.get(el.nodeId)
  if (style?.get('display') === 'none') return undefined

  switch (el.tagName) {
    case 'img':
      return convertImg(el, styles, options)
    case 'hr':
      return convertHr(el, styles)
  }

  return (
    tryConvertContainer(el, styles, options) ||
    tryConvertList(el, styles, options) ||
    tryConvertBlockquote(el, styles) ||
    tryConvertInlineSvg(el, styles, options) ||
    convertTextElement(el, styles)
  )
}

// =============================================================================
// Inline SVG: emit a SIF element via the SVG converter so anything
// the SVG pipeline supports is honoured. The SVG is rendered as a
// nested group under the parent so transforms on the surrounding
// flex/grid container still apply.
// =============================================================================

function tryConvertInlineSvg(
  el: HtmlElement,
  styles: StyleMap,
  options?: { defaultFontFamily?: string; baseDir?: string }
): Element | undefined {
  if (el.tagName !== 'svg') return undefined
  // Lazy import to avoid pulling the SVG pipeline into test bundles
  // that don't need it.
  const { svgToSifWithDefs } = require('../../svg/converter')
  const serializer = new (require('../parser').Serializer || class {})()
  const html = serializer ? serializer.serialize(el) : serializeSvgFallback(el)
  try {
    const { elements } = svgToSifWithDefs(`<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`, options as any)
    if (elements.length === 1) return elements[0]
    return {
      id: `el-${el.nodeId}`,
      type: 'group',
      children: elements,
      layout: 'block',
    }
  } catch {
    return undefined
  }
}

function serializeSvgFallback(el: HtmlElement): string {
  // Simple inner-HTML reconstruction: walk children, emit their
  // outerHTML. Sufficient for inline SVG that doesn't rely on
  // complex serialisation.
  return el.children.map(c => serializeNode(c)).join('')
}

function serializeNode(c: any): string {
  if (c.type === 'text') return escapeHtml(c.text || '')
  if (c.type !== 'element') return ''
  const attrs = Object.entries(c.attrs || {}).map(([k, v]) => ` ${k}="${escapeHtml(String(v))}"`).join('')
  const inner = c.children?.map(serializeNode).join('') || ''
  return `<${c.tagName}${attrs}>${inner}</${c.tagName}>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}