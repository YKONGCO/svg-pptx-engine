// Group element types
import { ElementId, Hyperlink, ElementMeta } from '../common'
import { Element } from './base'

/**
 * Group element - contains multiple child elements
 *
 * DESIGN PRINCIPLE: Group is purely for logical grouping, NOT for visual styling.
 *
 * - No position properties (x, y, width, height)
 * - No visual properties (transform, opacity, effect, clipContent, isolation)
 * - Child coordinates are ALWAYS absolute (relative to canvas)
 *
 * This is fundamentally different from SVG <g> which is a visual container
 * with nested coordinate system.
 *
 * SVG → SIF conversion rule:
 * When encountering <g transform="...">, merge the transform into child coordinates.
 * The resulting SIF Group should NOT carry any transform.
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
}
