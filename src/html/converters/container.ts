// src/html/converters/container.ts
//
// Convert block-level container elements (<div>, <section>,
// <article>, <main>, <header>, <footer>, <aside>, <nav>) into SIF
// GroupElement. The container's CSS `display` decides the layout
// directive, and its visual props (background, border, border-radius,
// shadow, transform) decorate the group.

import type { GroupElement } from '../../sif/types/elements/group'
import type { ShapeElement } from '../../sif/types/elements/shape'
import type { Element } from '../../sif/types/elements/base'
import type { ComputedStyle, StyleMap } from '../css/cascade'
import type { HtmlElement } from '../parser'
import { getChildren, getAttr } from '../parser'
import { toPx } from '../css/units'
import { readLayoutProps, readContainerBackground, type LayoutProps } from './layout'
import { readStroke, readBorderRadius, readEffect, readTransform, readBackground } from './visual'
import { convertAny } from './dispatch'

const CONTAINER_TAGS = new Set([
  'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav',
])

/**
 * Try to convert an element as a container. Returns undefined if the
 * tag is not a container type, so the dispatcher can try other
 * converters.
 */
export function tryConvertContainer(
  el: HtmlElement,
  styles: StyleMap,
  options?: { defaultFontFamily?: string }
): Element | undefined {
  if (!CONTAINER_TAGS.has(el.tagName)) return undefined

  const style = styles.get(el.nodeId) ?? new Map()

  // `display: none` → emit nothing (best-effort skip).
  if ((style.get('display') || '').toLowerCase() === 'none') {
    return makeHiddenGroup(el)
  }

  const layout = readLayoutProps(style)
  const children = getChildren(el)
    .map(c => convertAny(c, styles, options))
    .filter((c): c is Element => c !== undefined)

  // Build the group from layout + visual fields.
  const group: GroupElement = {
    id: `el-${el.nodeId}`,
    type: 'group',
    children,
    layout: layout.layout,
    gap: layout.gap,
    padding: layout.padding,
    flexDirection: layout.flexDirection,
    flexWrap: layout.flexWrap,
    justifyContent: layout.justifyContent,
    alignItems: layout.alignItems,
    gridTemplateColumns: layout.gridTemplateColumns,
    gridTemplateRows: layout.gridTemplateRows,
    visible: true,
  }

  // Visual props on the group itself (best-effort; the renderer may
  // not honour every field, but we record the source values).
  const fill = readContainerBackground(style)
  const stroke = readStroke(style)
  const radius = readBorderRadius(style)
  const effect = readEffect(style)
  const transform = readTransform(style)
  if (fill) (group as any).fill = fill
  if (stroke) (group as any).stroke = stroke
  if (effect) group.effect = effect
  if (transform) group.transform = transform

  // Box dimensions — the layout pass uses these for grid/flex sizing
  // when the container is the slide root.
  const width = readLength(style, 'width')
  const height = readLength(style, 'height')
  if (Number.isFinite(width)) group.width = width
  if (Number.isFinite(height)) group.height = height

  // A container with a fill / stroke / radius becomes a backing rect
  // in front of which the children lay out. We achieve this by
  // pushing a ShapeElement as the first child (the layout engine
  // treats groups as flat collections of children; the backing rect
  // needs to be at z=0 so children paint on top).
  if (fill || stroke || radius) {
    const backing: ShapeElement = {
      id: `el-${el.nodeId}-bg`,
      type: 'shape',
      shapeType: 'rect',
      x: 0,
      y: 0,
      width: group.width || 0,
      height: group.height || 0,
      fill: fill || { type: 'solid', color: '#FFFFFF' },
      stroke,
      rx: radius?.rx,
      ry: radius?.ry,
      zIndex: -1,
    }
    group.children = [backing, ...group.children]
  }

  // Honour `id` attribute on the source element so downstream tools
  // can match it back to a DOM node.
  const srcId = getAttr(el, 'id')
  if (srcId) group.meta = { ...(group.meta || {}), description: `id=${srcId}` }

  return group
}

function readLength(style: ComputedStyle, prop: string): number | undefined {
  const v = style.get(prop)
  if (!v) return undefined
  if (v.endsWith('%')) return undefined // percentage handled by layout pass
  const n = toPx(v)
  return Number.isFinite(n) ? n : undefined
}

function makeHiddenGroup(el: HtmlElement): GroupElement {
  return {
    id: `el-${el.nodeId}`,
    type: 'group',
    children: [],
    layout: 'block',
    visible: false,
  }
}

export { CONTAINER_TAGS }
export type { LayoutProps }