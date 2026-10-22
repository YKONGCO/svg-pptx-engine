// Document level types - SlideDocument, Slide, etc.
import { Element } from './elements/base'
import { Fill } from './style/fill'

/**
 * Slide background
 */
export interface SlideBackground {
  fill: Fill

  // Optional: background image
  image?: {
    href: string
    fit?: 'cover' | 'contain' | 'fill' | 'tile'
    position?: { x: number; y: number }
  }
}

/**
 * Slide transition
 */
export interface SlideTransition {
  type: 'none' | 'fade' | 'push' | 'wipe' | 'split' | 'zoom' | 'reveal'
  direction?: 'left' | 'right' | 'up' | 'down'
  duration?: number   // milliseconds
}

/**
 * Geometry of a `<clipPath>` def that contains a single `<rect>`.
 * PPTX can apply this as a simple bounding-box crop. For clipPath
 * defs with non-rect children, the renderer falls back to no
 * clipping with a console.warn.
 */
export interface ClipPathResource {
  id: string
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  /** `userSpaceOnUse` (default) or `objectBoundingBox` (not yet honoured). */
  clipPathUnits: 'userSpaceOnUse' | 'objectBoundingBox'
}

/**
 * A `<mask>` def. The renderer applies the mask's alpha to the
 * target element as a transparency overlay. For the Phase 0.2A
 * landing we only support mask defs with a single `<rect>` child
 * (the typical "rectangular hole" or "vignette" use case).
 *
 * When the inner rect's `fill` references a `<linearGradient>` /
 * `<radialGradient>`, the renderer captures the gradient stops
 * and the PPTX layer replaces the host shape's solid fill with a
 * matching gradient whose alpha follows each stop's luminance
 * (BT.601). This is the common "fade-out" mask pattern.
 */
export interface MaskResource {
  id: string
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  maskUnits: 'userSpaceOnUse' | 'objectBoundingBox'
  /** Mask alpha (0 = fully hidden, 1 = fully visible). 1 by default. */
  opacity: number
  /**
   * Mask background colour (`fill` of the inner rect). For
   * gradient fills this carries the original `url(#id)` string
   * and `gradient` (if resolved) holds the resolved stops.
   */
  color: string
  /**
   * Optional resolved gradient: when the inner rect's `fill` is
   * `url(#gradId)` we look up the gradient def and copy its
   * stops + direction into this field. The PPTX layer uses it
   * to apply a per-stop alpha modulation to the host fill.
   */
  gradient?: {
    type: 'linear' | 'radial'
    /**
     * Direction in degrees (0 = up, 90 = right). Matches the
     * PPTX `linear` gradient `angle` convention used elsewhere
     * in the converter.
     */
    angle: number
    stops: Array<{
      /** Position 0..1 along the gradient axis. */
      offset: number
      /** Stop colour (any CSS colour). */
      color: string
      /** Per-stop opacity (0..1). */
      opacity: number
    }>
  }
}

/**
 * Resources attached to a slide (Phase 0.2A). Currently used for
 * clipPath / mask / pattern defs that the PPTX layer consumes
 * alongside the elements. Patterns are passed as a `PatternTemplate`
 * record (id → tile geometry + child SIF Elements) so the PPTX
 * layer can stamp the tile without needing a PNG rasteriser.
 */
export interface PatternTemplateRecord {
  id: string
  width: number
  height: number
  /** Local coords of the tile's origin in the user space. */
  x: number
  y: number
  patternUnits: 'userSpaceOnUse' | 'objectBoundingBox'
  patternContentUnits: 'userSpaceOnUse' | 'objectBoundingBox'
  patternTransform?: string
  children: Array<Record<string, unknown>>
}

export interface SlideResources {
  clipPaths?: Record<string, ClipPathResource>
  masks?: Record<string, MaskResource>
  patterns?: Record<string, PatternTemplateRecord>
}

/**
 * Slide properties
 */
export interface Slide {
  id: string

  // Elements on the slide
  elements: Element[]

  // Background
  background?: SlideBackground

  // Transition
  transition?: SlideTransition

  // Slide name (optional)
  name?: string

  // Notes
  notes?: string

  // Custom properties
  metadata?: Record<string, unknown>

  /**
   * SVG defs resolved during conversion. The PPTX layer reads
   * `clipPaths[element.clipPathId]` etc. to apply visual effects
   * that aren't otherwise representable on a pptxgenjs shape.
   */
  resources?: SlideResources
}

/**
 * Document metadata
 */
export interface DocumentMeta {
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
  created?: string
  modified?: string
  description?: string
}

/**
 * SlideDocument - the root document type
 */
export interface SlideDocument {
  // Protocol version
  version: string

  // Document size (in pixels, assuming 96 DPI)
  width: number
  height: number

  // Slides
  slides: Slide[]

  // Metadata
  meta?: DocumentMeta

  // Slide master (optional)
  master?: {
    id: string
    background?: SlideBackground
    elements: Element[]
  }

  // Color scheme
  colorScheme?: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
}
