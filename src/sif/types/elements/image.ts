// Image element types
import { BaseElement } from './base'

export type ImageFormat = 'png' | 'jpeg' | 'jpg' | 'gif' | 'svg' | 'webp' | 'bmp'

/**
 * Image source types
 */
export interface ImageSrc {
  // One of these must be provided
  url?: string           // Remote URL
  dataUri?: string      // Base64 encoded data URI
  path?: string         // Local file path
}

/**
 * Image element
 */
export interface ImageElement extends BaseElement {
  type: 'image'

  // Image source
  href: string           // URL, data URI, or file path

  // Image format (optional, can be inferred)
  format?: ImageFormat

  // Sizing
  preserveAspectRatio?: boolean  // default: true

  // Crop (optional)
  crop?: {
    left?: number        // percentage 0-1
    right?: number
    top?: number
    bottom?: number
  }

  // Flip
  flipH?: boolean       // horizontal flip
  flipV?: boolean       // vertical flip

  // Image filter effect
  filter?: 'none' | 'grayscale' | 'sepia' | 'blur'

  /**
   * @deprecated Use href with data URI instead
   */
  base64?: string
}
