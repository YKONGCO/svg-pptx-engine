// Video element types
import { BaseElement } from './base'

export type VideoFormat = 'mp4' | 'webm' | 'ogg' | 'mov' | 'avi' | 'mkv'

export type VideoFit = 'cover' | 'contain' | 'fill' | 'none'

/**
 * Video element
 */
export interface VideoElement extends BaseElement {
  type: 'video'

  // Video source
  href: string           // URL or Data URI

  // Format (optional, can be inferred from href)
  format?: VideoFormat

  // Playback control
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  controls?: boolean

  // Poster image (preview/thumbnail)
  poster?: string        // URL or Data URI

  // Sizing
  fit?: VideoFit
  preserveAspectRatio?: boolean  // default: true

  // Start and end time (in seconds)
  startTime?: number
  endTime?: number

  // Volume (0-1)
  volume?: number

  // Playback rate
  playbackRate?: number   // e.g., 1.0, 1.5, 2.0
}
