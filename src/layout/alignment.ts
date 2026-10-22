// Cross-axis alignment helpers (Phase 3.2.3).
//
// The flex and grid flows honour two layers of alignment:
//   1. Container-level `alignItems` / `alignContent`
//   2. Per-child `alignSelf` (CSS `align-self` equivalent)
//
// The child's `alignSelf` overrides the container default. The
// value `'baseline'` is special: instead of aligning the child's
// box, we align its *baseline* (Phase 1's `baseline.ascent`) with
// the line's max ascent. This is what makes text + an inline
// formula sit on the same baseline.
//
// SVG elements can also carry a `dominant-baseline` style attribute
// (e.g. `alphabetic`, `middle`, `hanging`). We translate that into
// the equivalent `alignSelf` value here so flex/grid can consume it
// uniformly.

import type { AlignItems, AlignSelf, LayoutBox } from './types'
import type { Element } from '../sif/types/elements/base'

/**
 * Resolve the effective cross-axis alignment for `childIndex` of a
 * flex/grid container. Resolution order:
 *   1. `alignSelf[childIndex]` (if set and not 'auto')
 *   2. `box.alignSelf[childIndex]` (alias of the above)
 *   3. `container alignItems` (or the per-flow default)
 *   4. The child's `dominant-baseline` style attribute
 *   5. `stretch` (the CSS default)
 */
export function resolveAlignSelf(
  box: LayoutBox,
  childIndex: number,
  containerAlign: AlignItems
): AlignSelf {
  const override = box.alignSelf?.[childIndex]
  if (override && override !== 'auto') return override
  if (containerAlign) return containerAlign as AlignSelf
  return 'stretch'
}

/**
 * Compute the cross-axis offset for a child placed at line `crossStart`
 * inside a container of inner size `crossAvail`. `align` is the
 * resolved alignment; `crossExtent` is the child's cross-axis size.
 * Returns the offset to add to `crossStart` to land the child at
 * the correct position.
 */
export function crossOffset(
  align: AlignSelf,
  crossAvail: number,
  crossExtent: number,
  stretchFallback: number = 0
): number {
  switch (align) {
    case 'center':
      return (crossAvail - crossExtent) / 2
    case 'end':
      return crossAvail - crossExtent
    case 'baseline':
      // The flex flow's line-baseline machinery is responsible for
      // pinning the child to the line's ascent. When the caller is
      // not the flex flow, fall back to flex-start (a `baseline`
      // value outside a flex container degenerates to start).
      return 0
    case 'stretch':
    case 'auto':
    default:
      return stretchFallback
  }
}

/**
 * Translate a `dominant-baseline` SVG style attribute into an
 * `AlignSelf` value. SVG's `dominant-baseline` is more granular
 * than CSS's `align-self`, so we collapse it to the four values
 * the layout engine understands.
 */
export function dominantBaselineToAlignSelf(value: string | undefined): AlignSelf | undefined {
  if (!value) return undefined
  switch (value) {
    case 'auto':
    case 'alphabetic':
    case 'ideographic':
    case 'mathematical':
    case 'text-bottom':
      return 'baseline'
    case 'middle':
    case 'central':
      return 'center'
    case 'hanging':
    case 'text-top':
      return 'flex-start'
    case 'text-before-edge':
    case 'text-after-edge':
      return 'end'
    default:
      return undefined
  }
}

/** Read `dominant-baseline` off a SIF element's style metadata. */
export function readDominantBaseline(child: Element): AlignSelf | undefined {
  // The SVG converter stores style attributes on the element's
  // `style` field. We accept either an object or a key/value map.
  const style = (child as { style?: Record<string, unknown> }).style
  if (!style) return undefined
  const raw = style.dominantBaseline ?? style['dominant-baseline']
  if (typeof raw !== 'string') return undefined
  return dominantBaselineToAlignSelf(raw)
}
