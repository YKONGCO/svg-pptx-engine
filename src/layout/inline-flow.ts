// Inline flow (Phase 3.1.5).
//
// The inline flow lays out children left-to-right, wrapping to a
// new line when the next child's right edge would exceed the
// container's inner width. Each line is positioned at the line
// height below the previous one.
//
// This is the "default" flow for containers marked `layout="inline"`
// (or, in Phase 3.1.5, when a bare `<g>` carries no `layout`
// attribute but has explicit `width` — we treat it as an inline
// container because SVG `<text>` siblings are usually positioned
// on a baseline).
//
// Phase 1 baseline integration: each child's `baseline.ascent` is
// honoured when stacking — children with larger ascent push the
// whole line down. This keeps mixed `<text>` + `<formula>` content
// visually aligned with Phase 1's inline fragment layout.

import type { Element } from '../sif/types/elements/base'
import type { LayoutBox, LayoutResult } from './types'
import { intrinsicSize } from './measure'
import { translateElement } from './block-flow'

const DEFAULT_LINE_HEIGHT_RATIO = 1.45

export interface InlineOptions {
  /** Available width before wrapping. Defaults to the container
   *  inner width (i.e. wrap at the container's right edge). */
  availableWidth?: number
}

/** Lay out children of an inline container. */
export function layoutInline(box: LayoutBox, options: InlineOptions = {}): LayoutResult {
  const padding = resolvePadding(box)
  const innerX = padding.left
  const innerY = padding.top
  const innerW = Math.max(0, box.width - padding.left - padding.right)
  const innerH = Math.max(0, box.height - padding.top - padding.bottom)
  const wrapWidth = options.availableWidth ?? box.inline?.availableWidth ?? innerW

  const sizes = box.children.map(c => intrinsicSize(c))

  const placed: Element[] = []
  const overflowed: Element[] = []
  let cursorX = innerX
  let lineBaseline = innerY   // top of the current line
  let lineAscent = 0           // max ascent in the current line

  for (let i = 0; i < box.children.length; i++) {
    const child = box.children[i]
    const size = sizes[i]
    const childW = size.width
    const childH = size.height
    const ascent = childBaselineAscent(child)
    const descent = childBaselineDescent(child)

    // Would this child overflow the current line? If so, wrap.
    if (cursorX > innerX && cursorX + childW > innerX + wrapWidth + 1e-3) {
      lineBaseline += Math.max(lineAscent, DEFAULT_LINE_HEIGHT_RATIO * childH)
      cursorX = innerX
      lineAscent = 0
    }

    // Honour baseline: pin the child's top so its ascent matches
    // the line's max ascent.
    const yTop = lineBaseline + Math.max(0, lineAscent - ascent)
    const exceeds = yTop + childH > innerY + innerH + 1e-3

    if (exceeds) {
      overflowed.push(child)
    } else {
      lineAscent = Math.max(lineAscent, ascent)
      placed.push(translateElement(child, cursorX - (child.x ?? 0), yTop - (child.y ?? 0)))
    }
    // The line advances by the child's effective inline extent
    // (use childH if the layout is treating this as a block, but
    // for inline we use childW + a small "space" padding so the
    // next sibling doesn't sit on top of it).
    cursorX += childW
    // Track descent in the line height too — but we use ascent to
    // set the line top; descent is folded into the line height by
    // the DEFAULT_LINE_HEIGHT_RATIO * childH fallback above.
    void descent
  }

  return {
    children: placed,
    overflowed,
    width: box.width,
    height: box.height
  }
}

/** Read a child's `baseline.ascent` if it has one (Phase 1). */
function childBaselineAscent(child: Element): number {
  const b = (child as { baseline?: { ascent?: number; descent?: number } }).baseline
  if (b && typeof b.ascent === 'number') return b.ascent
  // Default: assume the child is a "tall" element occupying the
  // full font height — half the intrinsic size.
  return (child.height ?? 0) * 0.5
}

function childBaselineDescent(child: Element): number {
  const b = (child as { baseline?: { ascent?: number; descent?: number } }).baseline
  if (b && typeof b.descent === 'number') return b.descent
  return (child.height ?? 0) * 0.5
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
