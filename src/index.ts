import { PROTOCOL_VERSION } from './sif/version'
import type { SlideDocument, SlideResources } from './sif/types/document'
import { svgToSif, svgToSifWithDefs, type SvgToSifOptions } from './svg/converter'
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
export {
  FONT_BRIDGE,
  DEFAULT_FONT_BRIDGE,
  DEFAULT_FONT_PRESETS,
  containsCjk,
  resolveFontBridge,
  resolvePptxFontFace,
  resolvePptxEastAsiaFont,
  resolvePptxLatinFont,
  resolveWebFontFamily,
  pickPptxFontForText,
  type FontBridge,
  type FontPreset
} from './utils/font'

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
  const { elements, defs } = svgToSifWithDefs(svgString, options)
  const { width, height } = getSvgDimensions(svgString)

  // Thread the resolved clipPath / mask / pattern defs into the
  // slide so the PPTX layer can look them up by id. Patterns are
  // kept as the full PatternTemplate (with children); the PPTX
  // layer rasterises them lazily when stamping a tile.
  const resources: SlideResources = {}
  if (defs.clipPaths.size > 0) {
    resources.clipPaths = Object.fromEntries(defs.clipPaths)
  }
  if (defs.masks.size > 0) {
    resources.masks = Object.fromEntries(defs.masks)
  }
  if (defs.patterns.size > 0) {
    // Patterns are passed through as a JSON-friendly shallow record
    // (the tile-children are SIF Elements; we re-attach them below).
    // The PPTX layer re-uses them directly.
    const patternRecord: Record<string, any> = {}
    for (const [id, template] of defs.patterns) {
      patternRecord[id] = template
    }
    resources.patterns = patternRecord as SlideResources['patterns']
  }

  const slide: SlideDocument['slides'][number] = {
    id: options?.slideId ?? 'slide1',
    elements
  }
  if (Object.keys(resources).length > 0) {
    slide.resources = resources
  }

  return {
    version: PROTOCOL_VERSION,
    width,
    height,
    slides: [slide],
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

// =============================================================================
// HTML → SIF → PPTX (Phase 4 / M0-M1+)
// =============================================================================

import { htmlToSif, htmlToSlideDocument, type HtmlToDocumentOptions, type HtmlToPptxOptions } from './html/converter'
import { parseHTML, type HtmlElement, type HtmlText, type HtmlNode, type ParsedHtmlDocument } from './html/parser'
import { htmlToStyleMap, type StyleMap, type ComputedStyle } from './html/css/pipeline'

export {
  htmlToSif,
  htmlToSlideDocument,
  type HtmlToDocumentOptions,
  type HtmlToPptxOptions,
}
export {
  parseHTML,
  type HtmlElement,
  type HtmlText,
  type HtmlNode,
  type ParsedHtmlDocument,
}
export { htmlToStyleMap, type StyleMap, type ComputedStyle }

/** Convert an HTML string to a PPTX buffer. */
export function htmlToPptx(
  html: string,
  options?: HtmlToPptxOptions
): Promise<string | Uint8Array> {
  const document = htmlToSlideDocument(html, options)
  return generatePptx(document, options)
}

/** Convert an HTML string to a .pptx file on disk. */
export async function htmlToPptxFile(
  html: string,
  fileName: string,
  options?: HtmlToPptxOptions
): Promise<string> {
  const document = htmlToSlideDocument(html, options)
  return generatePptxFile(document, fileName)
}
