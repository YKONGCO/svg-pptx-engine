// PPTX Generator - Main generator for converting SIF to PPTX

import PptxGenJS from 'pptxgenjs'
import type { SlideDocument, Slide, SlideBackground, DocumentMeta } from '../sif/types/document'
import type { Element, ShapeElement, TextElement, ImageElement, LineElement, GroupElement, VideoElement, AudioElement } from '../sif/types/elements'
import type { Fill, SolidFill, GradientFill } from '../sif/types/style/fill'
import { getElementsInRenderOrder } from './converters/slide'
import { convertShape } from './converters/shape'
import { convertText } from './converters/text'
import { convertImage } from './converters/image'
import { convertLine } from './converters/line'
import { convertGroupElements } from './converters/slide'
import { convertVideo } from './converters/video'
import { convertAudio } from './converters/audio'
import { convertHyperlink, hexToPptxColorWithAlpha, opacityToTransparency, pxToInch } from './utils'

export interface PptxGeneratorOptions {
  fileName?: string
  author?: string
  company?: string
  title?: string
  subject?: string
  revision?: string
  layout?: string
  rtlMode?: boolean
}

export interface PptxWriteOptions {
  outputType?: 'arraybuffer' | 'base64' | 'binarystring' | 'blob' | 'nodebuffer' | 'uint8array'
  compression?: boolean
}

/**
 * Main PPTX Generator class
 */
export class PptxGenerator {
  private pptx: PptxGenJS
  private document: SlideDocument

  constructor(document: SlideDocument, options?: PptxGeneratorOptions) {
    this.pptx = new PptxGenJS()
    this.document = document
    this.configureDocument(options)
  }

  private configureDocument(options?: PptxGeneratorOptions): void {
    const meta = this.document.meta

    this.pptx.author = options?.author ?? meta?.author ?? ''
    this.pptx.company = options?.company ?? ''
    this.pptx.title = options?.title ?? meta?.title ?? ''
    this.pptx.subject = options?.subject ?? meta?.subject ?? ''
    this.pptx.revision = options?.revision ?? '1'

    // Always define a custom layout matching the pixel dimensions (at 96 DPI)
    // This ensures consistency between slide size and element positions
    const slideWidthInch = pxToInch(this.document.width)
    const slideHeightInch = pxToInch(this.document.height)
    this.pptx.defineLayout({
      name: 'custom',
      width: slideWidthInch,
      height: slideHeightInch
    })
    this.pptx.layout = 'custom'

    this.pptx.rtlMode = options?.rtlMode ?? false
  }

  generate(): PptxGenJS {
    for (const slide of this.document.slides) {
      this.addSlide(slide)
    }
    return this.pptx
  }

  private addSlide(slide: Slide): void {
    const pptxSlide = this.pptx.addSlide()

    if (slide.background) {
      pptxSlide.background = this.convertBackground(slide.background)
    }

    const sortedElements = getElementsInRenderOrder(slide.elements)

    for (const element of sortedElements) {
      this.addElementToSlide(pptxSlide, element)
    }
  }

  private convertBackground(background: SlideBackground): PptxGenJS.BackgroundProps {
    const result: PptxGenJS.BackgroundProps = {}

    if (background.fill) {
      if (background.fill.type === 'solid') {
        const solid = background.fill as SolidFill
        const { color, transparency } = hexToPptxColorWithAlpha(solid.color)
        result.color = color
        result.transparency = transparency ?? opacityToTransparency(solid.opacity) ?? 0
        result.type = 'solid'
      } else if (background.fill.type === 'gradient') {
        const gradientFill = background.fill as GradientFill
        if (gradientFill.gradient.stops.length > 0) {
          const firstStop = gradientFill.gradient.stops[0]
          const { color } = hexToPptxColorWithAlpha(firstStop.color)
          result.color = color
        }
      }
    }

    return result
  }

  private addElementToSlide(slide: PptxGenJS.Slide, element: Element): void {
    if (element.visible === false) {
      return
    }

    if (element.type === 'group') {
      this.addGroupToSlide(slide, element as GroupElement)
      return
    }

    const converted = this.convertElement(element)
    if (converted) {
      this.addConvertedElement(slide, converted)
    }
  }

  private addGroupToSlide(slide: PptxGenJS.Slide, group: GroupElement): void {
    // Create a pptxgenjs group
    const pptxGroup = slide.addGroup()

    // Get all converted group children
    const convertedItems = convertGroupElements(group)

    // Add children to the group
    for (const item of convertedItems) {
      this.addElementToGroup(pptxGroup, item)
    }
  }

  private addElementToGroup(group: PptxGenJS.Group, converted: { type: string; data: any }): void {
    const { type, data } = converted

    if (type === 'text') {
      group.addText(data.text, data.options)
    } else if (type === 'image') {
      group.addImage(data)
    } else if (type === 'shape' || type === 'line') {
      group.addShape(data.shapeName, data.options)
    } else if (type === 'video') {
      group.addMedia(data)
    } else if (type === 'audio') {
      group.addMedia(data)
    } else if (type === 'group') {
      // pptxgenjs groups don't support nested groups, so flatten
      // Add all children from the nested group directly to the parent group
      for (const child of data as { type: string; data: any }[]) {
        this.addElementToGroup(group, child)
      }
    }
  }

  private convertElement(
    element: Element
  ): { type: string; data: any } | null {
    const hyperlink = this.resolveHyperlink(element)

    switch (element.type) {
      case 'shape':
        return { type: 'shape', data: convertShape(element as ShapeElement, hyperlink) }
      case 'text':
        return { type: 'text', data: convertText(element as TextElement, hyperlink) }
      case 'image':
        return { type: 'image', data: convertImage(element as ImageElement, hyperlink) }
      case 'line':
        return { type: 'line', data: convertLine(element as LineElement, hyperlink) }
      case 'video':
        return { type: 'video', data: convertVideo(element as VideoElement) }
      case 'audio':
        return { type: 'audio', data: convertAudio(element as AudioElement) }
      default:
        return null
    }
  }

  private addConvertedElement(slide: PptxGenJS.Slide, converted: { type: string; data: any }): void {
    const { type, data } = converted

    if (type === 'text') {
      slide.addText(data.text, data.options)
    } else if (type === 'video') {
      slide.addMedia(data)
    } else if (type === 'audio') {
      slide.addMedia(data)
    } else if (type === 'image') {
      slide.addImage(data)
    } else if (type === 'shape' || type === 'line') {
      slide.addShape(data.shapeName, data.options)
    }
  }

  private resolveHyperlink(element: Element): PptxGenJS.HyperlinkProps | undefined {
    if (!('hyperlink' in element) || !element.hyperlink) {
      return undefined
    }

    if (element.hyperlink.action === 'jump' && element.hyperlink.slideId) {
      const slideIndex = this.document.slides.findIndex(slide => slide.id === element.hyperlink?.slideId)
      if (slideIndex >= 0) {
        return convertHyperlink(element.hyperlink, slideIndex + 1)
      }
    }

    return convertHyperlink(element.hyperlink)
  }

  async writeFile(options?: { fileName?: string }): Promise<string> {
    const fileName = options?.fileName ?? 'presentation.pptx'
    return this.pptx.writeFile({ fileName })
  }

  async writeBuffer(options?: PptxWriteOptions): Promise<Uint8Array> {
    const result = await this.pptx.write({
      outputType: options?.outputType ?? 'uint8array',
      compression: options?.compression
    })
    return result as Uint8Array
  }

  async writeBase64(options?: { compression?: boolean }): Promise<string> {
    const result = await this.pptx.write({
      outputType: 'base64',
      compression: options?.compression
    })
    return result as string
  }

  getPptx(): PptxGenJS {
    return this.pptx
  }

  getDocument(): SlideDocument {
    return this.document
  }
}

export function generatePptx(
  document: SlideDocument,
  options?: PptxGeneratorOptions & PptxWriteOptions
): Promise<string | Uint8Array> {
  const generator = new PptxGenerator(document, options)
  generator.generate()

  if (options?.outputType === 'base64') {
    return generator.writeBase64(options)
  }

  return generator.writeBuffer(options) as Promise<string | Uint8Array>
}

export async function generatePptxFile(
  document: SlideDocument,
  fileName: string
): Promise<string> {
  const generator = new PptxGenerator(document)
  generator.generate()
  return generator.writeFile({ fileName })
}

export function createPptxGenerator(
  document: SlideDocument,
  options?: PptxGeneratorOptions
): PptxGenerator {
  return new PptxGenerator(document, options)
}
