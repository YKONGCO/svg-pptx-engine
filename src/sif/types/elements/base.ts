// Base element types
import { Transform, ElementId, ElementMeta, Hyperlink } from '../common'
import type { VisualEffect } from '../style/effect'

// Import specific element types for union
import type { ShapeElement } from './shape'
import type { TextElement } from './text'
import type { ImageElement } from './image'
import type { LineElement } from './line'
import type { GroupElement } from './group'
import type { VideoElement } from './video'
import type { AudioElement } from './audio'

/**
 * All supported element types
 */
export type ElementType = 'shape' | 'text' | 'image' | 'line' | 'group' | 'video' | 'audio' | 'icon'

/**
 * Union of all element types
 */
export type Element = ShapeElement | TextElement | ImageElement | LineElement | GroupElement | VideoElement | AudioElement

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
}
