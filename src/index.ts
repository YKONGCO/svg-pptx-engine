import { PROTOCOL_VERSION } from './sif/version'
import type { SlideDocument } from './sif/types/document'
import { svgToSif, type SvgToSifOptions } from './svg/converter'
import { getAttr, getSvgRoot, parseSVG } from './svg/parser'
import {
  PptxGenerator,
  createPptxGenerator,
  generatePptx,
  generatePptxFile,
  type PptxGeneratorOptions,
  type PptxWriteOptions
} from './pptx/generator'

export * from './sif'
export { svgToSif, type SvgToSifOptions, parseSVG, getSvgRoot, getAttr } from './svg'
export {
  PptxGenerator,
  createPptxGenerator,
  generatePptx,
  generatePptxFile,
  type PptxGeneratorOptions,
  type PptxWriteOptions
} from './pptx/generator'

export interface SvgToDocumentOptions extends SvgToSifOptions {
  slideId?: string
  title?: string
  author?: string
  subject?: string
}

export interface SvgToPptxOptions extends SvgToDocumentOptions, PptxGeneratorOptions, PptxWriteOptions {}

function getSvgDimensions(svgString: string): { width: number; height: number } {
  const parsed = parseSVG(svgString)
  const svgRoot = getSvgRoot(parsed)

  if (!svgRoot) {
    throw new Error('Invalid SVG: no <svg> root element found')
  }

  const viewBox = getAttr(svgRoot, 'viewBox')
  const width = parseDimension(getAttr(svgRoot, 'width'))
  const height = parseDimension(getAttr(svgRoot, 'height'))
  const viewBoxParts = viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map(part => parseFloat(part))

  return {
    width: width ?? (viewBoxParts && viewBoxParts.length >= 4 ? viewBoxParts[2] : 960),
    height: height ?? (viewBoxParts && viewBoxParts.length >= 4 ? viewBoxParts[3] : 540)
  }
}

function parseDimension(value: string | undefined): number | undefined {
  if (!value) return undefined

  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseSlideDocument(input: string | SlideDocument): SlideDocument {
  if (typeof input === 'string') {
    return JSON.parse(input) as SlideDocument
  }

  return input
}

export function svgToSlideDocument(svgString: string, options?: SvgToDocumentOptions): SlideDocument {
  const elements = svgToSif(svgString, options)
  const { width, height } = getSvgDimensions(svgString)

  return {
    version: PROTOCOL_VERSION,
    width,
    height,
    slides: [
      {
        id: options?.slideId ?? 'slide1',
        elements
      }
    ],
    meta: {
      title: options?.title ?? 'SVG Conversion',
      author: options?.author ?? 'svg-pptx-engine',
      subject: options?.subject
    }
  }
}

export function createSvgPptxGenerator(svgString: string, options?: SvgToPptxOptions) {
  const document = svgToSlideDocument(svgString, options)
  return createPptxGenerator(document, options)
}

export function svgToPptx(svgString: string, options?: SvgToPptxOptions): Promise<string | Uint8Array> {
  const document = svgToSlideDocument(svgString, options)
  return generatePptx(document, options)
}

export async function svgToPptxFile(
  svgString: string,
  fileName: string,
  options?: SvgToPptxOptions
): Promise<string> {
  const document = svgToSlideDocument(svgString, options)
  return generatePptxFile(document, fileName)
}

export function jsonToPptx(
  input: string | SlideDocument,
  options?: PptxGeneratorOptions & PptxWriteOptions
): Promise<string | Uint8Array> {
  return generatePptx(parseSlideDocument(input), options)
}

export async function jsonToPptxFile(
  input: string | SlideDocument,
  fileName: string,
  options?: PptxGeneratorOptions
): Promise<string> {
  const generator = createPptxGenerator(parseSlideDocument(input), options)
  generator.generate()
  return generator.writeFile({ fileName })
}
