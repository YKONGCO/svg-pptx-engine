// Layout pass entry point (Phase 2.6 + Phase 3 P1 + Phase 3.2.4).
//
// Walks a SIF element tree and re-positions children inside any
// `<g layout="…">` container it finds. Elements outside a layout
// container are left untouched (preserving existing v1.0 behavior).
//
// The pass is depth-first: a parent container lays out its direct
// children, and any nested layout container inside those children
// is then laid out recursively with the freshly-computed positions.
//
// Phase 3.1.1–5: new flows (flex-wrap, column shrink, grid auto,
// CJK measure, inline default) live in their own modules. This
// file is the dispatch + finalisation point.
//
// Phase 3.2:
//   - 3.2.1: post-pass overlap detection (warns via console.warn)
//   - 3.2.2: per-container `overflow` strategy (clip / hidden / …)
//   - 3.2.4: write `intrinsicWidth` / `intrinsicHeight` onto every
//     leaf element so the renderer can read them without a
//     second walk.

import type { Element } from '../sif/types/elements/base'
import type { GroupElement } from '../sif/types/elements/group'
import type { LayoutBox } from './types'
import { layoutBlock } from './block-flow'
import { layoutFlex } from './flex-flow'
import { layoutGrid } from './grid-flow'
import { layoutInline } from './inline-flow'
import { intrinsicSize, parseTrackSize } from './measure'
import { translateElement } from './block-flow'
import { detectOverlaps, summariseOverlaps } from './overlap'
import { applyOverflow, type OverflowReport } from './overflow'

export interface PassOptions {
  /** When false, the pass is a no-op. */
  enabled?: boolean
  /** When true (default), `console.warn` is invoked for any
   *  overlap detected after the pass. Set to false in tests where
   *  the warn would be noise. */
  warnOnOverlap?: boolean
}

/** Outcome of a layout pass — useful for the visual regression runner. */
export interface PassResult {
  elements: Element[]
  overlaps: number
  /** Phase 3.2.2: container-level clip / hidden bookkeeping. */
  overflow: OverflowReport
  /** Phase 3.3.6: total children that were dropped by the layout
   *  flows because they didn't fit. A non-zero value is *expected*
   *  (slides are not infinitely tall) so we surface it as a warn
   *  rather than a hard error. */
  flowOverflowed: number
}

/** Apply the layout pass to a flat SIF element list. */
export function pass(elements: Element[], options: PassOptions = {}): PassResult {
  if (options.enabled === false) {
    return { elements, overlaps: 0, overflow: { clipped: 0, recorded: 0 }, flowOverflowed: 0 }
  }
  let flowOverflowed = 0
  // 1. Layout flows re-position elements inside layout containers.
  const laidOut = elements.map(child => layoutElement(child, counter => { flowOverflowed += counter }))
  // 2. Phase 3.3.1: sort children of every group by z-index so the
  //    PPTX flattener emits back-to-front in the right order.
  const sorted = laidOut.map(sortByZIndex)
  // 3. Promote every leaf's position to absolute slide coordinates.
  const flattened = flattenToAbsolute(sorted, 0, 0)
  // 4. Phase 3.2.4: stamp intrinsic size onto every leaf.
  const stamped = flattened.map(stampIntrinsic)
  // 5. Phase 3.2.2: apply each container's overflow strategy. This
  //    is a no-op when no container sets `overflow`.
  const overflowed = applyOverflow(stamped)
  // 6. Phase 3.2.1: detect and (optionally) warn about overlaps.
  const overlaps = detectOverlaps(overflowed)
  if (overlaps.length > 0 && options.warnOnOverlap !== false) {
    const summary = summariseOverlaps(overlaps)
    if (summary) console.warn(`[svg-pptx-engine: layout] ${summary}`)
  }
  // 7. Phase 3.3.6: warn (rather than silently drop) for any flow-
  //    level overflow. The flow is best-effort; an unexpected number
  //    usually means the container is undersized.
  if (flowOverflowed > 0 && options.warnOnOverlap !== false) {
    console.warn(`[svg-pptx-engine: layout] ${flowOverflowed} child(ren) overflowed their layout container`)
  }
  return {
    elements: overflowed,
    overlaps: overlaps.length,
    overflow: overflowed.__overflow ?? { clipped: 0, recorded: 0 },
    flowOverflowed
  }
}

/**
 * Phase 3.3.1: z-index layer ordering. Children of every group are
 * sorted in ascending z-index. Children with no z-index keep their
 * source order and float to the back. Stable sort, so call order
 * is preserved within a single z-index tier.
 */
function sortByZIndex(element: Element): Element {
  if (element.type !== 'group') return element
  const g = element as GroupElement
  return { ...g, children: sortChildrenByZIndex(g.children) }
}

/** Same ordering rule, applied to a flat children array. */
function sortChildrenByZIndex(children: Element[]): Element[] {
  const indexed = children.map((child, i) => ({ child, i }))
  indexed.sort((a, b) => {
    const az = (a.child as { zIndex?: number }).zIndex
    const bz = (b.child as { zIndex?: number }).zIndex
    const av = typeof az === 'number' ? az : -Infinity
    const bv = typeof bz === 'number' ? bz : -Infinity
    if (av === bv) return a.i - b.i
    return av - bv
  })
  return indexed.map(x => x.child)
}

/** Back-compat: return just the elements (Phase 2.6 signature). */
export function passElements(elements: Element[], options: PassOptions = {}): Element[] {
  return pass(elements, options).elements
}

/**
 * Recursively apply the layout pass to a single element. Returns a
 * new element whose own x/y has been updated to reflect the layout,
 * and whose descendants are positioned RELATIVE to the element's
 * coordinate system (NOT absolute slide coords). The `flattenToAbsolute`
 * helper at the bottom of the file does the final promotion.
 */
export function layoutElement(
  element: Element,
  onOverflow: (count: number) => void = () => {}
): Element {
  if (element.type !== 'group') return element
  const group = element as GroupElement

  // Recurse into children first (post-order), so nested layout
  // containers get their final positions before the outer one runs.
  const laidOutChildren = group.children.map(child => layoutElement(child, onOverflow))
  const sortedChildren = sortChildrenByZIndex(laidOutChildren)

  if (!group.layout) {
    return { ...group, children: sortedChildren }
  }

  const box = buildLayoutBox(group, sortedChildren)
  if (!box) {
    return { ...group, children: sortedChildren }
  }

  let result
  switch (group.layout) {
    case 'block':
      result = layoutBlock(box)
      break
    case 'flex':
      result = layoutFlex(box, {
        direction: group.flexDirection,
        justifyContent: group.justifyContent,
        alignItems: group.alignItems,
        wrap: group.flexWrap
      })
      break
    case 'grid': {
      const columns = (group.gridTemplateColumns ?? []).map(parseTrackSize)
      const rows = (group.gridTemplateRows ?? []).map(parseTrackSize)
      result = layoutGrid(box, { columns, rows, gap: group.gap })
      break
    }
    case 'inline':
      result = layoutInline(box)
      break
    default:
      // Phase 3.1.5: previously this branch silently returned the
      // group unchanged. We now route any unknown layout kind (or
      // bare `<g>` with width/height but no `layout` attribute) into
      // the inline flow so text baselines line up.
      result = layoutInline(box)
      break
  }

  onOverflow(result.overflowed.length)
  return { ...group, children: result.children }
}

/**
 * Walk a (possibly nested) SIF element tree and rewrite every leaf
 * element's x/y so they are absolute slide coordinates. Group nodes
 * keep their own x/y metadata; only the leaves get the cumulative
 * ancestor offset baked in. The PPTX flattener then renders each
 * leaf at its (now absolute) position without further translation.
 */
function flattenToAbsolute(elements: Element[], offsetX: number, offsetY: number): Element[] {
  return elements.map(el => {
    if (el.type !== 'group') {
      return translateElement(el, offsetX, offsetY)
    }
    const g = el as GroupElement
    // Phase 3.x: a layout group may carry a `transform` (the parent
    // translate we deliberately did NOT bake into its children).
    // Fold that into the child offset so the final leaf positions
    // still end up at their absolute slide coords.
    const gTransform = (g as GroupElement & { transform?: { translateX?: number; translateY?: number } }).transform
    const parentTx = gTransform?.translateX ?? 0
    const parentTy = gTransform?.translateY ?? 0
    const childOffsetX = offsetX + parentTx + (g.x ?? 0)
    const childOffsetY = offsetY + parentTy + (g.y ?? 0)
    // Drop the group's own x/y on the returned node — leaves use
    // absolute coords directly, so the group's local offset is no
    // longer meaningful.
    const {
      x: _gx,
      y: _gy,
      layout: _gl,
      width: _gw,
      height: _gh,
      gap: _gg,
      padding: _gp,
      flexDirection: _gfd,
      justifyContent: _gjc,
      alignItems: _gai,
      gridTemplateColumns: _gtc,
      gridTemplateRows: _gtr,
      flexWrap: _gfw,
      overflow: _gov,
      alignSelf: _gas,
      transform: _gt,
      ...rest
    } = g
    return {
      ...rest,
      x: undefined,
      y: undefined,
      children: flattenToAbsolute(g.children, childOffsetX, childOffsetY)
    }
  })
}

/**
 * Phase 3.2.4: stamp the element's intrinsic size onto its own
 * `intrinsicWidth` / `intrinsicHeight` fields. The renderer can
 * then read these directly without re-measuring the tree.
 */
function stampIntrinsic(el: Element): Element {
  if (el.type === 'group') return el
  const size = intrinsicSize(el)
  return { ...el, intrinsicWidth: size.width, intrinsicHeight: size.height }
}

/**
 * Build a `LayoutBox` from a group's layout metadata. Returns
 * `undefined` if the group is missing the positional fields needed
 * to act as a layout container.
 */
function buildLayoutBox(group: GroupElement, children: Element[]): LayoutBox | undefined {
  if (
    group.x === undefined ||
    group.y === undefined ||
    group.width === undefined ||
    group.height === undefined
  ) {
    return undefined
  }
  return {
    kind: group.layout as LayoutBox['kind'],
    x: group.x,
    y: group.y,
    width: group.width,
    height: group.height,
    gap: group.gap,
    padding: group.padding,
    overflow: group.overflow,
    alignSelf: group.alignSelf,
    flex: group.layout === 'flex' ? {
      direction: group.flexDirection,
      justifyContent: group.justifyContent,
      alignItems: group.alignItems,
      wrap: (group as GroupElement & { flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse' }).flexWrap
    } : undefined,
    grid: group.layout === 'grid' ? {
      columns: (group.gridTemplateColumns ?? []).map(parseTrackSize),
      rows: (group.gridTemplateRows ?? []).map(parseTrackSize)
    } : undefined,
    children
  }
}

/**
 * Phase 4 (HTML converter support): recursively fill in
 * `x` / `y` / `width` / `height` for any layout group that doesn't
 * have explicit dimensions yet, using intrinsic sizing. The SVG
 * converter sets these on `<g layout="…">` from the SVG attributes;
 * the HTML converter doesn't have a coordinate system at that layer,
 * so we derive each container's box from the bounding box of its
 * shape children.
 *
 *   - `x` / `y` of inner containers start at (0, 0) relative to the
 *     enclosing container; the layout pass promotes them to absolute
 *     slide coords via `flattenToAbsolute`.
 *   - `width` / `height` come from the bounding box of the group's
 *     shape children (text and other decorative elements are
 *     excluded, mirroring `intrinsicSize`).
 *
 * This is invoked from `htmlToSif` / `htmlToSlideDocument` before
 * the layout pass runs, so the pass sees a fully-sized tree.
 */
export function fillLayoutDimensions(elements: Element[]): Element[] {
  // Treat the root as having the slide's available area when no
  // outer wrapper declares dimensions. The HTML converter wraps the
  // body in a body-block at (0,0,slideW,slideH); for any other
  // tree shape (e.g. SVG with an explicit root <svg> viewBox) the
  // inner content determines the dimensions instead.
  const fallback = fallbackBox(elements)
  return elements.map(el => fillOne(el, fallback))
}

interface ParentBox {
  width: number
  height: number
  padding: { top: number; right: number; bottom: number; left: number }
}

function fallbackBox(elements: Element[]): ParentBox {
  // Use the largest explicit bbox among the roots as the fallback
  // parent's inner box. If everything is undefined, default to a
  // 1280x720 canvas (standard slide size).
  let maxW = 0
  let maxH = 0
  for (const el of elements) {
    if (el.type !== 'group') continue
    const g = el as GroupElement
    if (typeof g.width === 'number') maxW = Math.max(maxW, g.width)
    if (typeof g.height === 'number') maxH = Math.max(maxH, g.height)
  }
  return {
    width: maxW || 1280,
    height: maxH || 720,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  }
}

function innerBox(parent: ParentBox): { width: number; height: number } {
  return {
    width: Math.max(0, parent.width - parent.padding.left - parent.padding.right),
    height: Math.max(0, parent.height - parent.padding.top - parent.padding.bottom),
  }
}

function fillOne(el: Element, parent: ParentBox): Element {
  if (el.type !== 'group') return el
  const g = el as GroupElement

  const padTop = g.padding?.top ?? 0
  const padRight = g.padding?.right ?? 0
  const padBottom = g.padding?.bottom ?? 0
  const padLeft = g.padding?.left ?? 0

  // Layout containers that don't declare dimensions inherit the
  // parent's inner content box (full-width / full-height by default).
  // This is what CSS does for block-level containers without an
  // explicit size: they expand to fill the available area.
  let width = g.width
  let height = g.height
  if (g.layout && g.layout !== 'grid') {
    const inner = innerBox(parent)
    if (width === undefined) width = inner.width
    if (height === undefined) height = inner.height
  }

  const x = g.x ?? 0
  const y = g.y ?? 0

  const myBox: ParentBox = {
    width: width ?? parent.width,
    height: height ?? parent.height,
    padding: { top: padTop, right: padRight, bottom: padBottom, left: padLeft },
  }

  const children = g.children.map(c => fillOne(c, myBox))

  // Grid leaves explicit dims alone; for everything else, fall back
  // to bounding box of children when the inheritance path didn't
  // produce a size (e.g. a layout group nested inside a non-layout
  // ancestor that has no explicit dims).
  if (g.layout && g.layout !== 'grid' && (width === undefined || height === undefined)) {
    let maxRight = 0
    let maxBottom = 0
    for (const c of children) {
      if (c.type === 'text') {
        const fs = (c as any).fontSize || 16
        if (c.width) maxRight = Math.max(maxRight, c.width)
        maxBottom = Math.max(maxBottom, fs * 1.4)
        continue
      }
      const right = (c.x ?? 0) + (c.width ?? 0)
      const bottom = (c.y ?? 0) + (c.height ?? 0)
      if (right > maxRight) maxRight = right
      if (bottom > maxBottom) maxBottom = bottom
    }
    if (width === undefined) width = maxRight
    if (height === undefined) height = maxBottom
  }

  const result: Element = { ...g, x, y, children }
  if (width !== undefined) (result as GroupElement).width = width
  if (height !== undefined) (result as GroupElement).height = height
  return result
}

// re-exports
export { layoutBlock } from './block-flow'
export { layoutFlex } from './flex-flow'
export { layoutGrid } from './grid-flow'
export { layoutInline } from './inline-flow'
export { intrinsicSize, estimateWrappedTextHeight, parseTrackSize, glyphWeightedWidth, isCjk } from './measure'
export { detectOverlaps, summariseOverlaps } from './overlap'
export { applyOverflow } from './overflow'
export { resolveAlignSelf, crossOffset, dominantBaselineToAlignSelf, readDominantBaseline } from './alignment'
export type { LayoutBox, TrackSize, LayoutResult, PlacedChild, IntrinsicSize } from './types'
