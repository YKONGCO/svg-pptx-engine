// Media converters - convert SVG image, video, audio to SIF elements
import type { ImageElement, ImageFormat } from '../../sif/types/elements/image'
import type { VideoElement, VideoFormat } from '../../sif/types/elements/video'
import type { AudioElement, AudioFormat } from '../../sif/types/elements/audio'
import { parseOpacity } from './color'
import { getAttr } from '../parser'
import {
  applyMatrixToBounds,
  decomposeMatrix,
  identityMatrix,
  parseTransformToMatrix,
  type TransformMatrix
} from './group'

export interface MediaConversionOptions {
  transformMatrix?: TransformMatrix
}

export function convertImage(
  element: Record<string, unknown>,
  id: string,
  options?: MediaConversionOptions
): ImageElement {
  const matrix = resolveMatrix(element, options)
  const x = getNumberAttr(element, 'x', 0)
  const y = getNumberAttr(element, 'y', 0)
  const width = getNumberAttr(element, 'width', 0)
  const height = getNumberAttr(element, 'height', 0)
  const bounds = applyMatrixToBounds(x, y, width, height, matrix)

  const href = getAttr(element, 'href') || getAttr(element, 'xlink:href') || ''
  const preserveAspectRatio = parsePreserveAspectRatio(getAttr(element, 'preserveAspectRatio'))

  const imageElement: ImageElement = {
    id,
    type: 'image',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    href,
    preserveAspectRatio,
    flipH: isFlipH(matrix),
    flipV: isFlipV(matrix)
  }

  // Parse format from href extension
  const format = inferImageFormat(href)
  if (format) imageElement.format = format

  // Parse opacity
  const opacity = parseOpacity(getAttr(element, 'opacity'))
  if (opacity !== undefined) imageElement.opacity = opacity

  // Parse visibility
  const visibility = getAttr(element, 'visibility')
  if (visibility) imageElement.visible = visibility !== 'hidden' && visibility !== 'collapse'

  // Parse rotation
  const rotation = extractRotation(matrix)
  if (rotation !== undefined && rotation !== 0) {
    imageElement.transform = { rotate: rotation }
  }

  return imageElement
}

export function convertVideo(
  element: Record<string, unknown>,
  id: string,
  options?: MediaConversionOptions
): VideoElement {
  const matrix = resolveMatrix(element, options)
  const x = getNumberAttr(element, 'x', 0)
  const y = getNumberAttr(element, 'y', 0)
  const width = getNumberAttr(element, 'width', 0)
  const height = getNumberAttr(element, 'height', 0)
  const bounds = applyMatrixToBounds(x, y, width, height, matrix)

  const href = getAttr(element, 'href') || getAttr(element, 'xlink:href') || getAttr(element, 'src') || ''
  const poster = getAttr(element, 'poster') || undefined

  const videoElement: VideoElement = {
    id,
    type: 'video',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    href,
    poster,
    autoplay: getAttr(element, 'autoplay') !== undefined,
    loop: getAttr(element, 'loop') !== undefined,
    muted: getAttr(element, 'muted') !== undefined,
    controls: getAttr(element, 'controls') !== undefined
  }

  // Parse format from href extension
  const format = inferVideoFormat(href)
  if (format) videoElement.format = format

  // Parse volume
  const volume = parseVolume(getAttr(element, 'volume'))
  if (volume !== undefined) videoElement.volume = volume

  // Parse opacity
  const opacity = parseOpacity(getAttr(element, 'opacity'))
  if (opacity !== undefined) videoElement.opacity = opacity

  // Parse visibility
  const visibility = getAttr(element, 'visibility')
  if (visibility) videoElement.visible = visibility !== 'hidden' && visibility !== 'collapse'

  // Parse rotation
  const rotation = extractRotation(matrix)
  if (rotation !== undefined && rotation !== 0) {
    videoElement.transform = { rotate: rotation }
  }

  return videoElement
}

export function convertAudio(
  element: Record<string, unknown>,
  id: string,
  options?: MediaConversionOptions
): AudioElement {
  const href = getAttr(element, 'href') || getAttr(element, 'xlink:href') || getAttr(element, 'src') || ''

  // Audio elements typically don't have x, y, width, height in SVG
  // We give them a default position and size for SIF compatibility
  const audioElement: AudioElement = {
    id,
    type: 'audio',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    href,
    autoplay: getAttr(element, 'autoplay') !== undefined,
    loop: getAttr(element, 'loop') !== undefined,
    muted: getAttr(element, 'muted') !== undefined
  }

  // Parse format from href extension
  const format = inferAudioFormat(href)
  if (format) audioElement.format = format

  // Parse volume
  const volume = parseVolume(getAttr(element, 'volume'))
  if (volume !== undefined) audioElement.volume = volume

  // Parse opacity
  const opacity = parseOpacity(getAttr(element, 'opacity'))
  if (opacity !== undefined) audioElement.opacity = opacity

  // Parse visibility
  const visibility = getAttr(element, 'visibility')
  if (visibility) audioElement.visible = visibility !== 'hidden' && visibility !== 'collapse'

  return audioElement
}

function resolveMatrix(element: Record<string, unknown>, options?: MediaConversionOptions): TransformMatrix {
  if (options?.transformMatrix) {
    return options.transformMatrix
  }
  const transform = getAttr(element, 'transform')
  return transform ? parseTransformToMatrix(transform) : identityMatrix()
}

function extractRotation(matrix: TransformMatrix): number | undefined {
  const rotation = decomposeMatrix(matrix).rotation
  return Math.abs(rotation) > 1e-6 ? rotation : undefined
}

function isFlipH(matrix: TransformMatrix): boolean {
  const decomposed = decomposeMatrix(matrix)
  return decomposed.scaleX < 0
}

function isFlipV(matrix: TransformMatrix): boolean {
  const decomposed = decomposeMatrix(matrix)
  return decomposed.scaleY < 0
}

function parsePreserveAspectRatio(value: string | undefined): boolean {
  if (value === undefined) return true
  // "none" means don't preserve aspect ratio
  return value.toLowerCase() !== 'none'
}

function parseVolume(value: string | undefined): number | undefined {
  if (!value) return undefined
  const num = parseFloat(value)
  if (Number.isNaN(num)) return undefined
  // Volume should be 0-1
  return Math.max(0, Math.min(1, num))
}

function inferImageFormat(href: string): ImageFormat | undefined {
  const ext = getExtension(href).toLowerCase()
  const formatMap: Record<string, ImageFormat> = {
    png: 'png',
    jpg: 'jpg',
    jpeg: 'jpeg',
    gif: 'gif',
    svg: 'svg',
    webp: 'webp',
    bmp: 'bmp'
  }
  return formatMap[ext]
}

function inferVideoFormat(href: string): VideoFormat | undefined {
  const ext = getExtension(href).toLowerCase()
  const formatMap: Record<string, VideoFormat> = {
    mp4: 'mp4',
    webm: 'webm',
    ogg: 'ogg',
    mov: 'mov',
    avi: 'avi',
    mkv: 'mkv'
  }
  return formatMap[ext]
}

function inferAudioFormat(href: string): AudioFormat | undefined {
  const ext = getExtension(href).toLowerCase()
  const formatMap: Record<string, AudioFormat> = {
    mp3: 'mp3',
    wav: 'wav',
    ogg: 'ogg',
    aac: 'aac',
    m4a: 'm4a',
    flac: 'flac'
  }
  return formatMap[ext]
}

function getExtension(href: string): string {
  // Handle data URI
  if (href.startsWith('data:')) {
    const mimeMatch = href.match(/data:([^;]+)/)
    if (mimeMatch) {
      const mime = mimeMatch[1].toLowerCase()
      if (mime.includes('png')) return 'png'
      if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
      if (mime.includes('gif')) return 'gif'
      if (mime.includes('svg')) return 'svg'
      if (mime.includes('webp')) return 'webp'
      if (mime.includes('bmp')) return 'bmp'
      if (mime.includes('mp4')) return 'mp4'
      if (mime.includes('webm')) return 'webm'
      if (mime.includes('ogg')) return 'ogg'
      if (mime.includes('mp3')) return 'mp3'
      if (mime.includes('wav')) return 'wav'
    }
    return ''
  }

  // Handle URL with extension
  const parts = href.split('.')
  if (parts.length > 1) {
    return parts[parts.length - 1].split('?')[0]
  }
  return ''
}

function getNumberAttr(element: Record<string, unknown>, name: string, fallback: number = 0): number {
  const value = getAttr(element, name)
  if (value === undefined) return fallback
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? fallback : parsed
}
