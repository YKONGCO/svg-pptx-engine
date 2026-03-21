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
