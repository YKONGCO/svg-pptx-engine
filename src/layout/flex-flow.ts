// Flex flow (Phase 2.4 + Phase 3.1.1 + Phase 3.1.2).
//
// A flex container distributes its children along a main axis
// (row or column). Each child is sized to its intrinsic size by
// default, then gaps and `justify-content` are applied.
//
// Phase 3.1.1: when `wrap: 'wrap' | 'wrap-reverse'` is set, children
// that would exceed the inner main-axis size flow onto additional
// lines (rows for `row`, columns for `column`). `wrap-reverse` flips
// the order of the new lines.
//
// Phase 3.1.2: shrink-to-fit (the "all children fit in one line"
// fallback) now applies to BOTH `row` and `column` directions. For
// column the scale is applied to the Y component.

import type { Element } from '../sif/types/elements/base'
import type { LayoutBox, LayoutResult, FlexDirection, JustifyContent, AlignItems } from './types'
import { intrinsicSize } from './measure'
import { translateElement, translateElementScale } from './block-flow'

export interface FlexOptions {
  direction?: FlexDirection
  justifyContent?: JustifyContent
  alignItems?: AlignItems
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
}

interface FlexLine {
  /** Indices into the (possibly reversed) ordered children array. */
  childIndices: number[]
  /** Main-axis extent of this line (sum of child main-sizes + gaps). */
  mainExtent: number
  /** Largest cross-axis extent of any child in this line. */
  crossExtent: number
}

/** Lay out children of a flex container. */
export function layoutFlex(box: LayoutBox, options: FlexOptions = {}): LayoutResult {
  const direction: FlexDirection = options.direction ?? box.flex?.direction ?? 'row'
  const justify: JustifyContent = options.justifyContent ?? box.flex?.justifyContent ?? 'flex-start'
  const align: AlignItems = options.alignItems ?? box.flex?.alignItems ?? 'stretch'
  const wrap: 'nowrap' | 'wrap' | 'wrap-reverse' = options.wrap ?? box.flex?.wrap ?? 'nowrap'

  const padding = resolvePadding(box)
  const gap = box.gap ?? 0
  const isRow = direction === 'row' || direction === 'row-reverse'
  const reverse = direction === 'row-reverse' || direction === 'column-reverse'

  // Use local origin (0, 0) — `pass.ts`'s `flattenToAbsolute` adds
  // the flex's slide-absolute position to every leaf at the end.
  const innerX = padding.left
  const innerY = padding.top
  const innerW = Math.max(0, box.width - padding.left - padding.right)
  const innerH = Math.max(0, box.height - padding.top - padding.bottom)

  const sizes = box.children.map(c => intrinsicSize(c))
  const mainSizes = sizes.map(s => isRow ? s.width : s.height)
  const crossSizes = sizes.map(s => isRow ? s.height : s.width)

  const innerMain = isRow ? innerW : innerH

  // Decide whether to wrap. We wrap when:
  //   - explicit `wrap: wrap | wrap-reverse`, OR
  //   - the natural total exceeds `innerMain` and the user did NOT
  //     opt into `nowrap` AND we cannot reasonably shrink (only
  //     shrink if a meaningful shrink would still leave at least
  //     1px per child).
  const rawTotal = mainSizes.reduce((a, b) => a + b, 0) + Math.max(0, box.children.length - 1) * gap
  const minShrinkSize = mainSizes.length > 0 ? Math.min(...mainSizes) : 0
  const canShrink = minShrinkSize > 1
  const shouldShrink = wrap === 'nowrap' && rawTotal > innerMain && canShrink
  const shouldWrap = (wrap === 'wrap' || wrap === 'wrap-reverse') && rawTotal > innerMain

  // Effective main sizes per child (after shrink-to-fit, if any).
  let effectiveMain = mainSizes.slice()
  if (shouldShrink) {
    const totalGap = Math.max(0, box.children.length - 1) * gap
    const shrinkFactor = (innerMain - totalGap) / (rawTotal - totalGap)
    effectiveMain = mainSizes.map(s => s * shrinkFactor)
  }

  // Build the (possibly wrapped) lines. The wrap path uses the
  // *original* main sizes — when wrapping, we don't shrink, we
  // instead flow children onto the next line.
  const ordered = reverse ? [...box.children].reverse() : box.children
  const orderedSizes = reverse ? [...sizes].reverse() : sizes
  const orderedMainSizes = reverse ? [...mainSizes].reverse() : mainSizes
  const orderedEffectiveMain = reverse ? [...effectiveMain].reverse() : effectiveMain

  let lines: FlexLine[]
  if (shouldWrap) {
    lines = wrapIntoLines(orderedMainSizes, orderedSizes, isRow, innerMain, gap)
    if (wrap === 'wrap-reverse') lines.reverse()
  } else {
    // Single line: no wrap or shrink.
    const totalMain = orderedEffectiveMain.reduce((a, b) => a + b, 0)
      + Math.max(0, orderedEffectiveMain.length - 1) * gap
    const maxCross = orderedSizes.reduce((m, s) => Math.max(m, isRow ? s.height : s.width), 0)
    lines = [{
      childIndices: ordered.map((_, i) => i),
      mainExtent: totalMain,
      crossExtent: maxCross
    }]
  }

  // The shrink factor (only meaningful for the single-line / nowrap path).
  const shrinkFactor = shouldShrink
    ? (innerMain - Math.max(0, box.children.length - 1) * gap) / (rawTotal - Math.max(0, box.children.length - 1) * gap)
    : 1

  // Per-line main-axis distribution (justify-content) and per-child
  // cross-axis offset (align-items).
  const placed: Element[] = []
  const overflowed: Element[] = []
  let cursorCross = isRow ? innerY : innerX

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const lineFree = Math.max(0, innerMain - line.mainExtent)
    const { lead, between } = distributeMain(justify, lineFree, line.childIndices.length)
    let cursorMain = (isRow ? innerX : innerY) + lead

    for (let k = 0; k < line.childIndices.length; k++) {
      const i = line.childIndices[k]
      const child = ordered[i]
      const size = orderedSizes[i]
      const mainExtent = orderedEffectiveMain[i]
      const startMain = cursorMain
      const endMain = startMain + mainExtent

      // Cross-axis position relative to the current line's top.
      const crossAvail = isRow ? innerH : innerW
      const crossExtent = isRow ? size.height : size.width
      const crossOffset = align === 'center'
        ? (crossAvail - crossExtent) / 2
        : align === 'end'
          ? crossAvail - crossExtent
          : 0
      const crossStart = isRow ? innerY : innerX
      const crossAt = isRow ? crossStart + crossOffset : crossStart + crossOffset

      const x = isRow ? startMain : crossAt
      const y = isRow ? cursorCross + crossOffset : startMain

      // For the single-line / nowrap case we still need to drop
      // children that overflow even after shrink; with wrap enabled
      // we never overflow on the main axis (a child that doesn't fit
      // jumps to the next line, but might still overflow the cross
      // axis — we drop those).
      const exceedsMain = isRow
        ? endMain > innerX + innerW + 1e-3
        : endMain > innerY + innerH + 1e-3
      const exceedsCross = isRow
        ? cursorCross + crossExtent > innerY + innerH + 1e-3
        : cursorCross + crossExtent > innerX + innerW + 1e-3

      if (exceedsMain || exceedsCross) {
        overflowed.push(child)
      } else {
        const dx = x - (child.x ?? 0)
        const dy = y - (child.y ?? 0)
        // Phase 3.1.2: shrink-to-fit now applies to BOTH row and
        // column. For row the scale is X, for column it's Y.
        if (shrinkFactor < 1) {
          const sx = isRow ? shrinkFactor : 1
          const sy = isRow ? 1 : shrinkFactor
          placed.push(translateElementScale(child, dx, dy, sx, sy))
        } else {
          placed.push(translateElement(child, dx, dy))
        }
      }
      cursorMain = endMain + between + (k < line.childIndices.length - 1 ? gap : 0)
    }

    // Advance the cross-axis cursor by this line's height.
    cursorCross += line.crossExtent + (li < lines.length - 1 ? gap : 0)
  }

  // Un-reverse overflowed ordering to match source order (display).
  const orderedOverflow = reverse ? overflowed.slice().reverse() : overflowed

  return {
    children: placed,
    overflowed: orderedOverflow,
    width: box.width,
    height: box.height
  }
}

/** Bucket children into flex lines, each fitting inside `innerMain`. */
function wrapIntoLines(
  mainSizes: number[],
  sizes: { width: number; height: number }[],
  isRow: boolean,
  innerMain: number,
  gap: number
): FlexLine[] {
  const lines: FlexLine[] = []
  let current: FlexLine = { childIndices: [], mainExtent: 0, crossExtent: 0 }
  for (let i = 0; i < mainSizes.length; i++) {
    const mainSize = mainSizes[i]
    const crossSize = isRow ? sizes[i].height : sizes[i].width
    // The width of the line if we add this child (including the
    // gap that follows the new child if the line isn't empty).
    const tentative = current.childIndices.length === 0
      ? mainSize
      : current.mainExtent + gap + mainSize
    if (tentative > innerMain + 1e-3 && current.childIndices.length > 0) {
      // Wrap: this child starts a new line.
      lines.push(current)
      current = { childIndices: [i], mainExtent: mainSize, crossExtent: crossSize }
    } else {
      current.childIndices.push(i)
      current.mainExtent = tentative
      current.crossExtent = Math.max(current.crossExtent, crossSize)
    }
  }
  if (current.childIndices.length > 0) lines.push(current)
  return lines
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

function distributeMain(justify: JustifyContent, free: number, count: number): { lead: number; between: number } {
  if (count === 0) return { lead: 0, between: 0 }
  switch (justify) {
    case 'flex-start':
      return { lead: 0, between: 0 }
    case 'center':
      return { lead: free / 2, between: 0 }
    case 'end':
      return { lead: free, between: 0 }
    case 'space-between':
      return { lead: 0, between: count > 1 ? free / (count - 1) : 0 }
    case 'space-around':
      return { lead: free / (2 * count), between: free / count }
    case 'space-evenly':
      return { lead: free / (count + 1), between: free / (count + 1) }
  }
}
