// Audio element types
import { BaseElement } from './base'

export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'm4a' | 'flac'

/**
 * Audio playback mode
 */
export type AudioPlaybackMode = 'auto' | 'click' | 'hover' | 'timed'

/**
 * Audio element - for embedding audio in slides
 */
export interface AudioElement extends BaseElement {
  type: 'audio'

  // Audio source
  href: string           // URL, data URI, or file path

  // Format (optional, can be inferred from href)
  format?: AudioFormat

  // Playback settings
  autoplay?: boolean     // auto-play when slide becomes active
  loop?: boolean        // loop audio
  muted?: boolean       // start muted

  // Volume (0-1)
  volume?: number

  // Playback mode
  playbackMode?: AudioPlaybackMode

  // Start and end time (in seconds)
  startTime?: number
  endTime?: number

  // Hide audio icon (for background audio)
  hideIcon?: boolean

  // Icon size (if not hidden)
  iconSize?: number

  // For timed playback
  playOnSlideEntry?: boolean  // play when slide is shown
  stopOnSlideExit?: boolean   // stop when leaving slide

  // Audio name (for accessibility)
  title?: string
  description?: string
}
