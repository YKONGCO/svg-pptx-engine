// src/html/converters/list.ts
//
// Convert <ul> / <ol> / <li> into SIF groups. Each list item gets a
// small marker TextElement (• for ul, 1./2./… for ol) followed by
// its content. <blockquote> is converted into a quoted block with an
// optional left border; <pre> falls into the standard text path
// with the monospace font default.

import type { GroupElement } from '../../sif/types/elements/group'
import type { TextElement } from '../../sif/types/elements/text'
import type { Element } from '../../sif/types/elements/base'
import type { ComputedStyle, StyleMap } from '../css/cascade'
import type { HtmlElement } from '../parser'
import { getChildren } from '../parser'
import { toPx } from '../css/units'
import { convertAny } from './dispatch'
import { convertTextElement } from './text'

const LIST_CONTAINER_TAGS = new Set(['ul', 'ol'])
const LIST_ITEM_TAG = 'li'

export function tryConvertList(
  el: HtmlElement,
  styles: StyleMap,
  options?: { defaultFontFamily?: string }
): Element | undefined {
  if (LIST_CONTAINER_TAGS.has(el.tagName)) {
    return convertListContainer(el, styles, options)
  }
  if (el.tagName === LIST_ITEM_TAG) {
    return convertListItem(el, styles, options)
  }
  return undefined
}

function convertListContainer(
  el: HtmlElement,
  styles: StyleMap,
  options?: { defaultFontFamily?: string }
): GroupElement {
  const ordered = el.tagName === 'ol'
  const items: GroupElement[] = []
  let counter = 1
  for (const c of getChildren(el)) {
    if (c.type !== 'element' || c.tagName !== 'li') continue
    items.push(convertListItem(c as HtmlElement, styles, options, ordered ? counter : undefined))
    counter += 1
  }

  const style = styles.get(el.nodeId) ?? new Map()
  const padding = readPadding(style)

  return {
    id: `el-${el.nodeId}`,
    type: 'group',
    children: items,
    layout: 'block',
    gap: 4,
    padding,
  }
}

function convertListItem(
  el: HtmlElement,
  styles: StyleMap,
  options?: { defaultFontFamily?: string },
  index?: number
): GroupElement {
  const marker = index !== undefined ? `${index}.` : '•'
  const markerEl: TextElement = {
    id: `el-${el.nodeId}-marker`,
    type: 'text',
    text: `${marker}  `,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fontFamily: 'sans-serif',
    fontSize: 14,
    fill: { type: 'solid', color: '#666666' },
    fontWeight: 'normal',
  }

  const children = getChildren(el)
    .map(c => convertAny(c, styles, options))
    .filter((c): c is Element => c !== undefined)

  // If the list item contains a single block element, use it directly
  // alongside the marker. Otherwise wrap children in a sub-group.
  let content: Element[]
  if (children.length === 1) {
    content = children
  } else if (children.length === 0) {
    content = [convertTextElement(el, styles)]
  } else {
    content = [{
      id: `el-${el.nodeId}-content`,
      type: 'group',
      children,
      layout: 'block',
    }]
  }

  return {
    id: `el-${el.nodeId}`,
    type: 'group',
    children: [markerEl, ...content],
    layout: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  }
}

function readPadding(style: ComputedStyle): GroupElement['padding'] {
  const top = style.get('padding-top')
  const right = style.get('padding-right')
  const bottom = style.get('padding-bottom')
  const left = style.get('padding-left')
  let padTop: number | undefined, padRight: number | undefined, padBottom: number | undefined, padLeft: number | undefined
  if (top) padTop = toPx(top)
  if (right) padRight = toPx(right)
  if (bottom) padBottom = toPx(bottom)
  if (left) padLeft = toPx(left)
  if (padTop === undefined && padRight === undefined && padBottom === undefined && padLeft === undefined) return undefined
  return { top: padTop, right: padRight, bottom: padBottom, left: padLeft }
}

// =============================================================================
// Blockquote — a quoted block with an optional left border.
// =============================================================================

export function tryConvertBlockquote(
  el: HtmlElement,
  styles: StyleMap
): Element | undefined {
  if (el.tagName !== 'blockquote') return undefined
  // Collect text content from any child (element or text node) so the
  // quote text isn't dropped when authors write bare text inside
  // <blockquote>.
  const text = collectText(el)
  const children: Element[] = text
    ? [convertTextElement(el, styles)]
    : []
  for (const c of getChildren(el)) {
    if (c.type === 'element') {
      const converted = convertAny(c, styles)
      if (converted) children.push(converted)
    }
  }

  return {
    id: `el-${el.nodeId}`,
    type: 'group',
    children,
    layout: 'block',
    padding: { left: 16, top: 8, bottom: 8 },
    meta: { role: 'blockquote' },
  } as GroupElement
}

function collectText(el: HtmlElement): string {
  let out = ''
  for (const c of el.children) {
    if (c.type === 'text') out += c.text || ''
    else if (c.type === 'element') out += collectText(c)
  }
  return out.trim()
}

export { LIST_CONTAINER_TAGS, LIST_ITEM_TAG }