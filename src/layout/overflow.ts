// Overflow strategy enforcement (Phase 3.2.2).
//
// The layout engine itself already filters children that exceed a
// container's inner box; that's how `overflowed` shows up in the
// flow results. This module is responsible for the *post-pass*
// step: now that the elements have been promoted to absolute
// coordinates, we walk every group and, if its `overflow` is set,
// either clip the children that fall outside its box or record
// them for diagnostics.
//
// We don't actually mutate the PPTX emitter (PowerPoint has no
// native clip region that matches the CSS box model), so the
// effective behaviour is:
//   - `visible` (default): no-op, no diagnostics
//   - `hidden`: record overflow count on the group (drop in
//     future phases when a clip is implemented in PPTX)
//   - `clip`: remove overflowing children from the emitted list
//   - `scroll`: same as `clip` for v1 (no scrollbar affordance)

import type { Element } from '../sif/types/elements/base'
import type { GroupElement } from '../sif/types/elements/group'

export interface OverflowReport {
  /** Number of children clipped (overflow: clip). */
  clipped: number
  /** Number of children recorded for diagnostics (overflow: hidden). */
  recorded: number
}

interface InternalResult extends Array<Element> {
  __overflow?: OverflowReport
}

/**
 * Walk the element tree and apply each group's overflow strategy.
 * Returns a new array of elements (immutable) and stashes an
 * `__overflow` summary on the returned array for the pass to read.
 */
export function applyOverflow(elements: Element[]): InternalResult {
  const report: OverflowReport = { clipped: 0, recorded: 0 }
  const out: InternalResult = elements.map(el => walkOverflow(el, report))
  out.__overflow = report
  return out
}

function walkOverflow(element: Element, report: OverflowReport): Element {
  if (element.type !== 'group') return element
  const g = element as GroupElement
  if (!g.overflow || g.overflow === 'visible') {
    return { ...g, children: g.children.map(c => walkOverflow(c, report)) }
  }
  // Compute the container's AABB in slide coordinates. We use the
  // group's own x/y/width/height as a coarse clip rectangle; nested
  // layout containers have already promoted their leaves to absolute
  // coordinates, so this matches the children's coordinate system.
  const x0 = g.x ?? 0
  const y0 = g.y ?? 0
  const x1 = x0 + (g.width ?? 0)
  const y1 = y0 + (g.height ?? 0)

  const newChildren: Element[] = []
  for (const child of g.children) {
    if (child.type === 'group') {
      newChildren.push(walkOverflow(child, report))
      continue
    }
    const cx = child.x ?? 0
    const cy = child.y ?? 0
    const cw = child.width ?? 0
    const ch = child.height ?? 0
    const outside = cx + cw <= x0 || cx >= x1 || cy + ch <= y0 || cy >= y1
    if (outside) {
      if (g.overflow === 'clip') {
        report.clipped++
        continue
      }
      report.recorded++
    }
    newChildren.push(child)
  }
  return { ...g, children: newChildren }
}
