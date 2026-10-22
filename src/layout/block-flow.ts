// Block flow (Phase 2.3).
//
// Stacks children vertically (column direction) with an optional gap,
// honouring the container's `padding` and `align` defaults:
//   - `align`  : cross-axis alignment of each child within the row
//                (defaults to 'stretch' for block)
//   - `justify`: how to distribute extra vertical space along the main
//                axis (defaults to 'flex-start' for block)
//
// Block flow is the simplest of the three flows. The output is a new
// array of children with rewritten `x` / `y`; the input array is not
// mutated.

import type { Element } from '../sif/types/elements/base'
import type { GroupElement } from '../sif/types/elements/group'
import type { ShapeElement } from '../sif/types/elements/shape'
import type { LineElement } from '../sif/types/elements/line'
import type { LayoutBox, LayoutResult, AlignItems, JustifyContent } from './types'
import { intrinsicSize } from './measure'

export interface BlockOptions {
  align?: AlignItems       // cross-axis (x) alignment, default 'stretch'
  justify?: JustifyContent // main-axis (y) distribution, default 'flex-start'
}

/** Lay out children of a block container (vertical stack). */
export function layoutBlock(box: LayoutBox, options: BlockOptions = {}): LayoutResult {
  const align: AlignItems = options.align ?? 'stretch'
  const justify: JustifyContent = options.justify ?? 'flex-start'

  const padding = resolvePadding(box)
  const gap = box.gap ?? 0
  // Use local origin (0, 0) — `pass.ts`'s `flattenToAbsolute` adds
  // the block's slide-absolute position to every leaf at the end.
  const innerX = padding.left
  const innerY = padding.top
  const innerW = Math.max(0, box.width - padding.left - padding.right)

  const sizes = box.children.map(child => intrinsicSize(child))
  const totalIntrinsic = sizes.reduce((sum, s) => sum + s.height, 0)
  const totalGap = Math.max(0, box.children.length - 1) * gap
  const free = Math.max(0, box.height - padding.top - padding.bottom - totalIntrinsic - totalGap)

  const { lead, between, tail } = distributeJustify(justify, free, box.children.length)

  const placed: Element[] = []
  const overflowed: Element[] = []
  let cursorY = innerY + lead

  for (let i = 0; i < box.children.length; i++) {
    const child = box.children[i]
    const size = sizes[i]
    const exceeds = cursorY + size.height > box.y + box.height - padding.bottom + 1e-3
    if (exceeds) {
      overflowed.push(child)
      continue
    }

    const childX = align === 'center'
      ? innerX + (innerW - size.width) / 2
      : align === 'end'
        ? innerX + innerW - size.width
        : innerX

    placed.push(translateElement(child, childX - (child.x ?? 0), cursorY - (child.y ?? 0)))
    cursorY += size.height + (i < box.children.length - 1 ? gap + between : between)
  }

  const usedHeight = cursorY - innerY - between + tail
  return {
    children: placed,
    overflowed,
    width: box.width,
    height: Math.max(usedHeight + padding.top + padding.bottom, padding.top + padding.bottom)
  }
}

function resolvePadding(box: LayoutBox): { top: number; right: number; bottom: number; left: number } {
  const p = box.padding ?? {}
  return {
    top: p.top ?? 0,
    right: p.right ?? 0,
    bottom: p.bottom ?? 0,
    left: p.left ?? 0
  }
}

function distributeJustify(justify: JustifyContent, free: number, count: number): { lead: number; between: number; tail: number } {
  if (count === 0) return { lead: 0, between: 0, tail: 0 }
  switch (justify) {
    case 'flex-start':
      return { lead: 0, between: 0, tail: 0 }
    case 'center':
      return { lead: free / 2, between: 0, tail: 0 }
    case 'end':
      return { lead: free, between: 0, tail: 0 }
    case 'space-between':
      return { lead: 0, between: free / Math.max(1, count - 1), tail: 0 }
    case 'space-around':
      return { lead: free / (2 * count), between: free / count, tail: free / (2 * count) }
    case 'space-evenly':
      return { lead: free / (count + 1), between: free / (count + 1), tail: 0 }
  }
}

/**
 * Return a new element with `dx` / `dy` applied to every coordinate
 * that influences its bounding box (x, y, transform.translateX/Y,
 * vertex points, etc.). For shapes that have vertex arrays we shift
 * the first vertex (x, y) and leave the rest relative to it via
 * translateX/Y so the shape's intrinsic size is preserved.
 */
export function translateElement(element: Element, dx: number, dy: number): Element {
  if (dx === 0 && dy === 0) return element
  const curX = element.x ?? 0
  const curY = element.y ?? 0
  const newX = curX + dx
  const newY = curY + dy
  switch (element.type) {
    case 'shape': {
      const shape = element as import('../sif/types/elements/shape').ShapeElement
      return translateShape(shape, newX, newY, dx, dy)
    }
    case 'text':
      return { ...element, x: newX, y: newY } as Element
    case 'image':
      return { ...element, x: newX, y: newY } as Element
    case 'video':
      return { ...element, x: newX, y: newY } as Element
    case 'audio':
      return { ...element, x: newX, y: newY } as Element
    case 'line':
      return translateLine(element as import('../sif/types/elements/line').LineElement, newX, newY, dx, dy)
    case 'group':
      // Only translate the group itself. The children's positions
      // are still relative to the group; `pass.ts`'s `flattenToAbsolute`
      // does the final promotion after all layout flows have run.
      return { ...element, x: newX, y: newY } as Element
    case 'icon':
      return { ...element, x: newX, y: newY } as Element
  }
}

function translateShape(shape: ShapeElement, newX: number, newY: number, dx: number, dy: number): Element {
  // Keep the existing transform (for scale/rotate) untouched. The
  // translation is fully accounted for by the new x/y — the PPTX
  // renderer computes `x: shape.x + transform.translateX`, so
  // setting both would double the offset.
  return {
    ...shape,
    x: newX,
    y: newY
  } as Element
}

function translateLine(line: LineElement, newX: number, newY: number, dx: number, dy: number): Element {
  return {
    ...line,
    x: newX,
    y: newY,
    x1: line.x1 + dx,
    y1: line.y1 + dy,
    x2: line.x2 + dx,
    y2: line.y2 + dy
  } as Element
}

/**
 * Like `translateElement` but additionally scales the element along
 * the X / Y axes around its top-left corner. Used by the flex flow
 * to shrink overflowing children to fit the container.
 */
export function translateElementScale(element: Element, dx: number, dy: number, scaleX: number, scaleY: number): Element {
  if (scaleX === 1 && scaleY === 1) return translateElement(element, dx, dy)
  // First translate, then apply a transform that scales relative to
  // the element's new origin.
  const moved = translateElement(element, dx, dy)
  const baseX = moved.x ?? 0
  const baseY = moved.y ?? 0
  const existing = (moved as { transform?: { translateX?: number; translateY?: number; scaleX?: number; scaleY?: number } }).transform
  const transform = existing
    ? { ...existing, translateX: (existing.translateX ?? 0) + baseX * (1 - scaleX), translateY: (existing.translateY ?? 0) + baseY * (1 - scaleY), scaleX: (existing.scaleX ?? 1) * scaleX, scaleY: (existing.scaleY ?? 1) * scaleY }
    : { translateX: baseX * (1 - scaleX), translateY: baseY * (1 - scaleY), scaleX, scaleY }
  return { ...moved, transform } as Element
}
