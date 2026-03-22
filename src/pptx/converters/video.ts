// Video Converter - Converts SIF video elements to pptxgenjs media
//
// SIF to PPTX Conversion Notes:
// - PPTX video has limited playback control (no autoplay, loop, muted, etc.)
// - PPTX uses 'path' for video source (local file or URL), 'link' for hyperlinks
// - PPTX doesn't support opacity/transparency on video directly
// - PPTX doesn't support flipH/flipV on video

import PptxGenJS from 'pptxgenjs'
import type { VideoElement } from '../../sif/types/elements/video'
import { pxToInch } from '../utils'

export function isYouTubeVideo(video: Pick<VideoElement, 'href'>): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(video.href)
}

export function convertYouTubeUrl(url: string): string {
  const embedMatch = url.match(/youtube\.com\/embed\/([^?&/]+)/i)
  if (embedMatch) {
    return `https://www.youtube.com/embed/${embedMatch[1]}`
  }

  const watchMatch = url.match(/[?&]v=([^?&/]+)/i)
  if (watchMatch) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`
  }

  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/i)
  if (shortMatch) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`
  }

  return url
}

/**
 * Convert video element to pptxgenjs media props
 *
 * Note: pptxgenjs video support is limited:
 * - No autoplay, loop, muted controls
 * - No opacity/transparency
 * - No flipH/flipV
 * - cover image via 'cover' property
 */
export function convertVideo(video: VideoElement): PptxGenJS.MediaProps {
  const translateX = video.transform?.translateX ?? 0
  const translateY = video.transform?.translateY ?? 0
  const scaleX = video.transform?.scaleX ?? 1
  const scaleY = video.transform?.scaleY ?? 1

  // Handle visibility - pptxgenjs doesn't have visibility
  // If not visible, return minimal placeholder
  if (video.visible === false) {
    return {
      type: 'video',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      path: '' // Empty path = no video
    }
  }

  const mediaProps: PptxGenJS.MediaProps = {
    type: 'video',
    x: pxToInch(video.x + translateX),
    y: pxToInch(video.y + translateY),
    w: pxToInch(video.width * scaleX),
    h: pxToInch(video.height * scaleY)
  }

  // Set source - use 'path' for both local files and URLs
  // Note: pptxgenjs uses 'link' for hyperlinks, not video sources
  if (isYouTubeVideo(video)) {
    mediaProps.type = 'online'
    mediaProps.link = convertYouTubeUrl(video.href)
  } else if (video.href.startsWith('http://') || video.href.startsWith('https://')) {
    mediaProps.path = video.href
    mediaProps.link = video.href
  } else if (video.href.startsWith('data:')) {
    // Data URI videos - pptxgenjs may not support these
    console.warn('Data URI videos may not be fully supported in PPTX')
    mediaProps.path = video.href
  } else {
    mediaProps.path = video.href
  }

  // Set video format/extension if known
  const videoFormat = video.format ?? inferVideoFormat(video.href)
  if (videoFormat) {
    // pptxgenjs may use this internally
    ;(mediaProps as any).extn = videoFormat
  }

  // Handle poster image (cover)
  // pptxgenjs only accepts base64 data URIs for `cover`.
  // Remote/local URLs should be ignored here rather than throwing at runtime.
  if (video.poster?.startsWith('data:')) {
    mediaProps.cover = video.poster
  }

  // Handle rotation - pptxgenjs MediaProps may not support rotate directly
  if (video.transform?.rotate !== undefined) {
    // Note: pptxgenjs may not support rotate on media
    console.warn(`Video rotation (${video.transform.rotate}) may not be supported in PPTX`)
  }

  // Note: PPTX video doesn't support:
  // - autoplay, loop, muted, controls (playback controls)
  // - opacity/transparency
  // - flipH/flipV
  // - startTime, endTime (trimming)
  // - volume
  // - playbackRate

  return mediaProps
}

/**
 * Infer video format from href
 */
function inferVideoFormat(href: string): string | undefined {
  const ext = href.split('.').pop()?.toLowerCase()
  if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext || '')) {
    return ext
  }
  return undefined
}
