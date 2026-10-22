// Base element types
import { Transform, ElementId, ElementMeta, Hyperlink, LayoutDirective } from '../common'
import type { VisualEffect } from '../style/effect'

// Import specific element types for union
import type { ShapeElement } from './shape'
import type { TextElement } from './text'
import type { ImageElement } from './image'
import type { LineElement } from './line'
import type { GroupElement } from './group'
import type { VideoElement } from './video'
import type { AudioElement } from './audio'
import type { IconElement } from './icon'

/**
 * All supported element types
 */
export type ElementType = 'shape' | 'text' | 'image' | 'line' | 'group' | 'video' | 'audio' | 'icon'

/**
 * Union of all element types
 */
export type Element =
  | ShapeElement
  | TextElement
  | ImageElement
  | LineElement
  | GroupElement
  | VideoElement
  | AudioElement
  | IconElement

/**
 * Base properties for all elements
 */
export interface BaseElement {
  id: ElementId
  type: ElementType

  // Position and size
  x: number
  y: number
  width: number
  height: number

  // Transform
  transform?: Transform

  // Visibility
  visible?: boolean

  // Opacity (0-1)
  opacity?: number

  // Z-index for layering (higher = on top)
  zIndex?: number

  // Hyperlink
  hyperlink?: Hyperlink

  // Metadata
  meta?: ElementMeta

  // Effect (shadow, blur, glow, etc.)
  effect?: VisualEffect

  // Layout directive (Phase 2+). Default when omitted is `block`.
  layout?: LayoutDirective

  // Intrinsic dimensions measured by the layout engine (read-only contract;
  // populated during layout pass, consumed by the renderer).
  intrinsicWidth?: number
  intrinsicHeight?: number

  // Phase 1+: id references into the converter's resource maps.
  clipPathId?: string
  patternFillId?: string
  maskId?: string

  /**
   * Phase 1+: resolved absolute clipPath rect, in pixels. Stamped at
   * SVG conversion time after the element's transform matrix is
   * applied to the `<clipPath>` def. When present, the PPTX layer
   * uses these coordinates directly without re-deriving the
   * intersection from the raw clipPath def (which is in the
   * element's local user space and would not match the element's
   * screen-space bounding box). For rotated clipPath rects the
   * value is the axis-aligned bounding box of the rotated shape —
   * PPTX cannot represent rotated clip regions natively, so this
   * is a conservative approximation.
   */
  clipPathRect?: { x: number; y: number; width: number; height: number }

  /**
   * Phase 1: per-element baseline metrics (in pixels). When set, the
   * PPTX layer uses these instead of guessing the ascent / descent
   * from the font size alone. `ascent` is the distance from the
   * element's top edge to its text baseline; `descent` is the
   * distance from the baseline to the bottom edge. The sum of
   * ascent + descent typically exceeds `height` (the box is
   * padded for line-leading), so callers should treat these as
   * guides rather than hard bounds.
   */
  baseline?: { ascent: number; descent: number }
}
