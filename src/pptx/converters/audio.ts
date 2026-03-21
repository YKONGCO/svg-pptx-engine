// Audio Converter - Converts SIF audio elements to pptxgenjs media

import PptxGenJS from 'pptxgenjs'
import type { AudioElement } from '../../sif/types/elements/audio'
import { pxToInch } from '../utils'

/**
 * Convert audio element to pptxgenjs media props
 */
export function convertAudio(audio: AudioElement): PptxGenJS.MediaProps {
  const translateX = audio.transform?.translateX ?? 0
  const translateY = audio.transform?.translateY ?? 0
  const scaleX = audio.transform?.scaleX ?? 1
  const scaleY = audio.transform?.scaleY ?? 1
  const width = (audio.hideIcon ? 0.01 : audio.width) * scaleX
  const height = (audio.hideIcon ? 0.01 : audio.height) * scaleY

  const mediaProps: PptxGenJS.MediaProps = {
    type: 'audio',
    x: pxToInch(audio.x + translateX),
    y: pxToInch(audio.y + translateY),
    w: pxToInch(width),
    h: pxToInch(height),
    path: audio.href
  }

  const audioFormat = audio.format ?? inferAudioFormat(audio.href)
  if (audioFormat) {
    mediaProps.extn = audioFormat
  }

  return mediaProps
}

function inferAudioFormat(href: string): string | undefined {
  const ext = href.split('.').pop()?.toLowerCase()
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(ext || '')) {
    return ext
  }
  return undefined
}
