// Group element types
import { ElementId, Hyperlink, ElementMeta, LayoutDirective, Transform } from '../common'
import { Element } from './base'
import type { VisualEffect } from '../style/effect'

/**
 * Group element - contains multiple child elements
 *
 * DESIGN PRINCIPLE: Group is purely for logical grouping, NOT for visual styling.
 *
 * - No transform / opacity / effect on the group itself
 * - Child coordinates are ALWAYS absolute (relative to canvas)
 *
 * This is fundamentally different from SVG <g> which is a visual container
 * with nested coordinate system.
 *
 * SVG → SIF conversion rule:
 * When encountering <g transform="...">, merge the transform into child coordinates.
 * The resulting SIF Group should NOT carry any transform.
 *
 * Phase 2 (layout engine): an *optional* set of container fields is
 * added so a `<g layout="…">` in SVG can be promoted to a layout
 * container. The fields are only consulted when `layout` is set; a
 * bare `<g>` (no `layout` attribute) keeps the original "logical
 * group" semantics.
 *
 * Deviation: a layout group MAY carry a `transform` field when the
 * SVG converter decides not to bake the parent transform into the
 * layout group's children. This avoids the layout flow undoing
 * the parent translate when it repositions children (Phase 3.x).
 * Only set by the converter; downstream code that doesn't know
 * about this can ignore the field.
 */
export interface GroupElement {
  // Identity
  id: ElementId
  type: 'group'

  // Child elements (coordinates are absolute, relative to canvas)
  children: Element[]

  // Visibility
  visible?: boolean

  // Z-index for layering (higher = on top)
  zIndex?: number

  // Hyperlink
  hyperlink?: Hyperlink

  // Metadata
  meta?: ElementMeta

  // Phase 2: layout container (only consulted when `layout` is set).
  // The container's bounding box and the layout flow its children
  // participate in. When unset, the group stays a pure logical group.
  layout?: LayoutDirective
  x?: number
  y?: number
  width?: number
  height?: number
  gap?: number
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }

  // Phase 2: flex container fields (consulted when layout === 'flex')
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  justifyContent?: 'flex-start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'
  alignItems?: 'flex-start' | 'center' | 'end' | 'stretch'
  // Phase 3.1.1: flex-wrap strategy
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse'

  // Phase 2: grid container fields (consulted when layout === 'grid').
  // Each track is a string token: `<n>px`, `<n>fr`, or `auto`.
  gridTemplateColumns?: string[]
  gridTemplateRows?: string[]

  // Phase 3.2: overflow strategy and per-child align-self overrides.
  overflow?: 'visible' | 'hidden' | 'clip' | 'scroll'
  alignSelf?: ('auto' | 'flex-start' | 'center' | 'end' | 'stretch' | 'baseline')[]

  // Phase 3.3.4: group-level effect (e.g. a card with a drop shadow
  // applied to the whole `<g>`). Sourced from `data-effect` JSON on
  // the `<g>` element. PPTX emits this as a group-level effectLst.
  effect?: VisualEffect

  /**
   * Reserved for layout groups whose children cannot have the
   * parent transform baked in without breaking the layout flow.
   * The SVG converter stamps the parent translate here so the
   * layout pass can re-apply it during flatten. Only set when
   * `layout` is non-empty.
   */
  transform?: Transform
}
