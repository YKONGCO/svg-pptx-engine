// Grid flow (Phase 2.5 + Phase 3.1.3).
//
// A grid container places children into a 2D matrix defined by
// `grid-template-columns` and `grid-template-rows`. Tracks can be
// fixed pixels, fr (fractional), or `auto` (intrinsic size of the
// largest child in that track).
//
// Phase 3.1.3: `auto` tracks now consult the children's intrinsic
// size. The first pass reserves the fixed+fr footprint; the second
// pass looks at the children that fall into each `auto` track and
// picks the largest extent. Any leftover space (after fixed + auto)
// is split across `fr` tracks as before; if `auto` consumes more
// than the leftover, we just give the `fr` tracks 0 — they only
// claim what's left, never more.

import type { Element } from '../sif/types/elements/base'
import type { LayoutBox, LayoutResult, TrackSize } from './types'
import { intrinsicSize } from './measure'
import { translateElement } from './block-flow'

export interface GridOptions {
  columns: TrackSize[]
  rows: TrackSize[]
  gap?: number
  columnGap?: number
  rowGap?: number
}

/** Lay out children of a grid container. */
export function layoutGrid(box: LayoutBox, options: GridOptions): LayoutResult {
  const gap = options.gap ?? box.gap ?? 0
  const colGap = options.columnGap ?? gap
  const rowGap = options.rowGap ?? gap

  const padding = resolvePadding(box)
  // Use local origin (0, 0) — `pass.ts`'s `flattenToAbsolute` adds
  // the grid's slide-absolute position to every leaf at the end.
  const innerX = padding.left
  const innerY = padding.top
  const innerW = Math.max(0, box.width - padding.left - padding.right)
  const innerH = Math.max(0, box.height - padding.top - padding.bottom)

  const sizes = box.children.map(c => intrinsicSize(c))
  const colWidths = resolveTracks(options.columns, innerW, colGap, sizes, box.children.length, true)
  const rowHeights = resolveTracks(options.rows, innerH, rowGap, sizes, box.children.length, false)

  const placed: Element[] = []
  const overflowed: Element[] = []
  const total = (colWidths.length) * (rowHeights.length)

  for (let i = 0; i < box.children.length; i++) {
    const child = box.children[i]
    if (i >= total) {
      overflowed.push(child)
      continue
    }
    const col = i % colWidths.length
    const row = Math.floor(i / colWidths.length)
    const cellX = innerX + colWidths.slice(0, col).reduce((a, w) => a + w, 0) + col * colGap
    const cellY = innerY + rowHeights.slice(0, row).reduce((a, h) => a + h, 0) + row * rowGap
    const cellW = colWidths[col]
    const cellH = rowHeights[row]
    const childSize = sizes[i]
    const x = cellX + (cellW - childSize.width) / 2
    const y = cellY + (cellH - childSize.height) / 2
    placed.push(translateElement(child, x - (child.x ?? 0), y - (child.y ?? 0)))
  }

  return {
    children: placed,
    overflowed,
    width: box.width,
    height: box.height
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

/**
 * Resolve a list of track sizes to concrete pixel widths/heights.
 * `auto` tracks consult `sizes` to find the largest child that
 * falls into that track. `isColumn=true` queries width, false
 * queries height. `childCount` is the number of children in the
 * grid (used to know which children belong to which track).
 */
export function resolveTracks(
  tracks: TrackSize[],
  available: number,
  gap: number,
  sizes: { width: number; height: number }[] = [],
  childCount: number = 0,
  isColumn: boolean = true
): number[] {
  if (tracks.length === 0) return []
  const totalGap = Math.max(0, tracks.length - 1) * gap
  const usable = Math.max(0, available - totalGap)

  // Pass 1: sum the fixed-pixel tracks and the auto tracks' largest
  // child extent, and accumulate the fr sum.
  let fixedSum = 0
  let autoMax: number[] = tracks.map(() => 0)
  let frSum = 0
  for (let t = 0; t < tracks.length; t++) {
    const track = tracks[t]
    if (track.kind === 'px') {
      fixedSum += track.value
    } else if (track.kind === 'fr') {
      frSum += track.value
    } else {
      // 'auto' — find the largest child in this track.
      autoMax[t] = autoTrackExtent(t, sizes, childCount, isColumn, tracks.length)
    }
  }
  // Auto tracks are bounded by the leftover space; if their natural
  // content would push us past `usable`, shrink the auto extent so
  // we can still give the fr tracks at least 0.
  const autoSum = autoMax.reduce((a, b) => a + b, 0)
  const used = fixedSum + autoSum
  if (used > usable && autoSum > 0) {
    const scale = Math.max(0, (usable - fixedSum)) / autoSum
    autoMax = autoMax.map(v => v * scale)
  }
  const finalAutoSum = autoMax.reduce((a, b) => a + b, 0)
  const free = Math.max(0, usable - fixedSum - finalAutoSum)
  const frUnit = frSum > 0 ? free / frSum : 0

  return tracks.map((t, i) => {
    if (t.kind === 'px') return t.value
    if (t.kind === 'fr') return t.value * frUnit
    return autoMax[i]
  })
}

/** Maximum intrinsic extent of any child that falls into `trackIndex`. */
function autoTrackExtent(
  trackIndex: number,
  sizes: { width: number; height: number }[],
  childCount: number,
  isColumn: boolean,
  trackCount: number
): number {
  let max = 0
  for (let i = trackIndex; i < childCount; i += trackCount) {
    const extent = isColumn ? sizes[i].width : sizes[i].height
    if (extent > max) max = extent
  }
  return max
}
