// Slide Converter - Converts SIF slides to pptxgenjs slides

import PptxGenJS from 'pptxgenjs'
import type { Slide, SlideBackground, SlideTransition } from '../../sif/types/document'
import type { Element } from '../../sif/types/elements/base'
import type { Fill, SolidFill } from '../../sif/types/style/fill'
import { convertFill } from './shape'
import type { ShapeElement } from '../../sif/types/elements/shape'
import type { TextElement } from '../../sif/types/elements/text'
import type { ImageElement } from '../../sif/types/elements/image'
import type { LineElement } from '../../sif/types/elements/line'
import type { GroupElement } from '../../sif/types/elements/group'
import type { VideoElement } from '../../sif/types/elements/video'
import type { AudioElement } from '../../sif/types/elements/audio'
import { convertShape } from './shape'
import { convertText } from './text'
import { convertImage } from './image'
import { convertLine } from './line'
import { convertGroup, type ConvertedGroupChild } from './group'
import { convertVideo } from './video'
import { convertAudio } from './audio'
import { hexToPptxColorWithAlpha, opacityToTransparency, pxToInch } from '../utils'

/**
 * Convert slide background to pptxgenjs format
 */
export function convertSlideBackground(background?: SlideBackground): PptxGenJS.BackgroundProps | undefined {
  if (!background) return undefined

  const result: PptxGenJS.BackgroundProps = {}

  if (background.fill) {
    if (background.fill.type === 'solid') {
      const solid = background.fill as SolidFill
      const { color, transparency } = hexToPptxColorWithAlpha(solid.color)
      result.color = color
      result.transparency = transparency ?? opacityToTransparency(solid.opacity) ?? 0
      result.type = 'solid'
    } else if (background.fill.type === 'gradient') {
      // Reuse convertFill from shape.ts for gradient conversion
      return convertFill(background.fill) as unknown as PptxGenJS.BackgroundProps
    }
  }

  return result
}

/**
 * Get elements sorted by zIndex
 */
export function getElementsInRenderOrder(elements: Element[]): Element[] {
  return [...elements].sort((a, b) => {
    const zA = a.zIndex ?? 0
    const zB = b.zIndex ?? 0
    return zA - zB
  })
}

/**
 * Convert element to pptxgenjs format
 */
export function convertElement(
  element: Element
): { type: 'shape' | 'text' | 'image' | 'line' | 'video' | 'audio'; data: any } | null {
  if (element.visible === false) {
    return null
  }

  switch (element.type) {
    case 'shape': {
      const converted = convertShape(element as ShapeElement)
      return { type: 'shape', data: converted }
    }
    case 'text': {
      const converted = convertText(element as TextElement)
      return { type: 'text', data: converted }
    }
    case 'image': {
      const converted = convertImage(element as ImageElement)
      return { type: 'image', data: converted }
    }
    case 'line': {
      const converted = convertLine(element as LineElement)
      return { type: 'line', data: converted }
    }
    case 'group': {
      return null
    }
    case 'video': {
      const converted = convertVideo(element as VideoElement)
      return { type: 'video', data: converted }
    }
    case 'audio': {
      const converted = convertAudio(element as AudioElement)
      return { type: 'audio' as const, data: converted }
    }
    default:
      // Handle icon and other unsupported types
      console.warn(`Unsupported element type: ${(element as any).type}`)
      return null
  }
}

/**
 * Convert group elements to pptxgenjs format
 */
export function convertGroupElements(
  group: GroupElement
): ConvertedGroupChild[] {
  return convertGroup(group)
}
