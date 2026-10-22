// Overlap detection (Phase 3.2.1).
//
// Given a flat list of positioned elements, report any pair whose
// bounding boxes overlap. The detector is invoked AFTER the layout
// pass has promoted every leaf to absolute slide coordinates, so
// we can compare rectangles directly.
//
// Implementation: sweep-line by x, then a y-active-set per column.
// For the volumes we deal with (a few hundred shapes per slide at
// most) the O(n log n) sweep is plenty. The interface returns a
// list of overlapping pairs and a `summarise()` helper that prints
// the worst offenders for the developer console.

import type { Element } from '../sif/types/elements/base'

export interface OverlapPair {
  /** Source indices into the elements array. */
  a: number
  b: number
  /** Overlap area in square pixels. */
  area: number
  /** Overlap rectangle in slide coordinates. */
  rect: { x: number; y: number; width: number; height: number }
}

interface Rect {
  i: number
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Return every overlapping pair in `elements` whose bounding boxes
 * intersect. The detector uses a single-axis sweep on the x axis
 * followed by a per-bucket linear scan, which is fast enough for
 * n ≈ a few thousand shapes and avoids the bookkeeping of a
 * full interval tree.
 */
export function detectOverlaps(elements: Element[]): OverlapPair[] {
  // Materialise every element as a 2D AABB. Skip elements that
  // explicitly opt out of overlap checks (rare, but supported via
  // meta.allowOverlap — leaves set this when they are intentionally
  // stacked, e.g. a text shadow under a text body).
  const rects: Rect[] = []
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (el.type === 'group') continue  // groups don't have an AABB
    if (allowsOverlap(el)) continue
    const x = el.x ?? 0
    const y = el.y ?? 0
    const w = el.width ?? 0
    const h = el.height ?? 0
    if (w <= 0 || h <= 0) continue
    rects.push({ i, x0: x, y0: y, x1: x + w, y1: y + h })
  }

  // Sort by x0 ascending; ties broken by x1 descending so larger
  // rects come first within a column.
  rects.sort((p, q) => p.x0 - q.x0 || q.x1 - p.x1)

  // Active set: rects whose x1 is still to the right of the sweep
  // cursor. When the sweep advances past a rect, it leaves the
  // active set.
  const active: Rect[] = []
  const pairs: OverlapPair[] = []
  const seen = new Set<string>()

  for (let s = 0; s < rects.length; s++) {
    const cur = rects[s]
    // Expire.
    for (let k = active.length - 1; k >= 0; k--) {
      if (active[k].x1 <= cur.x0 + 1e-3) active.splice(k, 1)
    }
    // Compare against every still-active rect.
    for (let k = 0; k < active.length; k++) {
      const other = active[k]
      const xOverlap = Math.min(cur.x1, other.x1) - Math.max(cur.x0, other.x0)
      const yOverlap = Math.min(cur.y1, other.y1) - Math.max(cur.y0, other.y0)
      if (xOverlap > 1e-3 && yOverlap > 1e-3) {
        const key = other.i < cur.i ? `${other.i}|${cur.i}` : `${cur.i}|${other.i}`
        if (seen.has(key)) continue
        seen.add(key)
        pairs.push({
          a: Math.min(other.i, cur.i),
          b: Math.max(other.i, cur.i),
          area: xOverlap * yOverlap,
          rect: {
            x: Math.max(cur.x0, other.x0),
            y: Math.max(cur.y0, other.y0),
            width: xOverlap,
            height: yOverlap
          }
        })
      }
    }
    active.push(cur)
  }

  return pairs
}

/** Best-effort opt-out for elements that are intentionally stacked. */
function allowsOverlap(el: Element): boolean {
  const meta = (el as { meta?: { allowOverlap?: boolean } }).meta
  return !!(meta && meta.allowOverlap)
}

/**
 * Print a one-line summary suitable for `console.warn`. Lists up
 * to `maxPairs` of the largest overlaps.
 */
export function summariseOverlaps(pairs: OverlapPair[], maxPairs: number = 3): string {
  if (pairs.length === 0) return ''
  const sorted = pairs.slice().sort((a, b) => b.area - a.area).slice(0, maxPairs)
  const head = sorted.map(p =>
    `[${p.a}↔${p.b} area=${p.area.toFixed(0)} at (${p.rect.x.toFixed(0)},${p.rect.y.toFixed(0)})]`
  ).join(' ')
  return `${pairs.length} overlap(s); top: ${head}`
}
