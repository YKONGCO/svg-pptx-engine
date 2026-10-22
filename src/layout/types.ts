// Layout engine type definitions (Phase 2).
//
// The layout pass walks a SIF element tree and re-positions children
// that are inside an explicit layout container (a `<g layout="…">`).
// Elements outside any container are left untouched.

import type { Element } from '../sif/types/elements/base'

/** Flow direction for flex containers. */
export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse'

/** Justify-content main-axis alignment. */
export type JustifyContent = 'flex-start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'

/** Align-items cross-axis alignment. */
export type AlignItems = 'flex-start' | 'center' | 'end' | 'stretch'

/** A track-size token: a fixed pixel value or a `fr` fraction. */
export type TrackSize =
  | { kind: 'px'; value: number }
  | { kind: 'fr'; value: number }
  | { kind: 'auto' }

/** Layout directives carried on a container. */
export type LayoutKind = 'block' | 'flex' | 'grid' | 'inline' | 'absolute'

/**
 * Overflow strategy applied to a layout container's content box.
 * Mirrors the CSS `overflow` property.
 *   - `visible` (default): children that extend past the container
 *     are still rendered, possibly clipped by the slide's own bounds.
 *   - `hidden`: visually clip children that extend past the
 *     container's inner box. PPTX doesn't support a native clip
 *     region, so we render as `visible` but the layout pass records
 *     the overflow for diagnostics.
 *   - `clip`: like `hidden` but also drops the overflowing children
 *     from the placed list (so they don't appear in the PPTX at all).
 *   - `scroll`: treated as `clip` in v1; we don't emit a scroll
 *     affordance yet (no native PPTX equivalent).
 */
export type Overflow = 'visible' | 'hidden' | 'clip' | 'scroll'

/**
 * Cross-axis alignment for a single flex / grid child, overriding
 * the container's `align-items`. Mirrors the CSS `align-self` property.
 * `auto` falls back to the container's `align-items`.
 */
export type AlignSelf = 'auto' | 'flex-start' | 'center' | 'end' | 'stretch' | 'baseline'

/**
 * A layout container is a SIF GroupElement that carries positional
 * and flow information. We model it as a standalone type to keep the
 * GroupElement in `sif/types/elements/group.ts` free of layout
 * concerns; the converter stamps layout attributes onto a `LayoutBox`
 * wrapper and the layout pass consumes that wrapper.
 */
export interface LayoutBox {
  /** Layout flow kind. */
  kind: LayoutKind

  /** Container origin (top-left in slide coordinates). */
  x: number
  y: number

  /** Container outer size in pixels. */
  width: number
  height: number

  /** Padding (inset) on all four sides. Defaults to 0. */
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }

  /** Gap between children in pixels. Defaults to 0. */
  gap?: number

  /**
   * Overflow strategy for children that extend past the container's
   * inner box. Defaults to `visible`. See {@link Overflow}.
   */
  overflow?: Overflow

  /** Flex container properties (when `kind === 'flex'`). */
  flex?: {
    direction?: FlexDirection
    justifyContent?: JustifyContent
    alignItems?: AlignItems
    wrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  }

  /** Grid container properties (when `kind === 'grid'`). */
  grid?: {
    columns: TrackSize[]
    rows: TrackSize[]
  }

  /** Inline container properties (when `kind === 'inline'`). */
  inline?: {
    /** Available width before wrapping. */
    availableWidth: number
  }

  /** Original child elements. */
  children: Element[]

  /**
   * Phase 3.1.5 / 3.2.3: per-child alignment overrides. Read by
   * flex/grid containers when computing cross-axis placement.
   * Indexed by the child's source position. Undefined / shorter
   * than the child count → fall back to the container's `alignItems`.
   */
  alignSelf?: AlignSelf[]
}

/** Computed bounding box of a child after layout. */
export interface PlacedChild {
  index: number
  x: number
  y: number
  width: number
  height: number
}

/** Intrinsic (preferred) size of an element. */
export interface IntrinsicSize {
  width: number
  height: number
}

/** Result of laying out a single container. */
export interface LayoutResult {
  /** Re-positioned children (immutable copies). */
  children: Element[]
  /** Children that overflow the container, in source order. */
  overflowed: Element[]
  /** Container's final used size. */
  width: number
  height: number
}
