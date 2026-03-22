// SVG to SIF Converter - Main entry point for converting SVG to SIF format
import type { Element } from '../sif/types/elements/base'
import type { ShapeElement } from '../sif/types/elements/shape'
import type { TextElement, RichTextElement } from '../sif/types/elements/text'
import type { GroupElement } from '../sif/types/elements/group'
import type { LinearGradient, RadialGradient } from '../sif/types/style/gradient'
import type { FilterTemplate } from './converters/filter'
import type { VisualEffect } from '../sif/types/style/effect'
import type { LineElement } from '../sif/types/elements/line'
import type { ImageElement } from '../sif/types/elements/image'
import type { VideoElement } from '../sif/types/elements/video'
import type { AudioElement } from '../sif/types/elements/audio'
import { parseSVG, getSvgRoot, getDefs, getChildElements, getAttr, copyElementMetadata } from './parser'
import { convertRect, convertCircle, convertEllipse, convertPath, convertLine, convertPolygon, convertPolyline, convertMarkedLine } from './converters/shape'
import { convertText } from './converters/text'
import { createGroup, identityMatrix, multiplyMatrices, parseTransformToMatrix, type TransformMatrix } from './converters/group'
import { convertLinearGradient, convertRadialGradient, isLinearGradientDef } from './converters/gradient'
import { convertFilterDef, resolveFilterEffect } from './converters/filter'
import { convertImage, convertVideo, convertAudio } from './converters/media'

let elementIdCounter = 0

function generateId(prefix: string = 'element'): string {
  elementIdCounter++
  return `${prefix}_${elementIdCounter}`
}

export function resetIdCounter(): void {
  elementIdCounter = 0
}

export interface SvgToSifOptions {
  preserveGroups?: boolean
  includeDefs?: boolean
  defaultFontFamily?: string
  /** Base directory for resolving relative media paths (e.g., './image.png') */
  baseDir?: string
}

interface ConversionContext {
  transformMatrix: TransformMatrix
  inheritedStyles: Record<string, string>
  visible: boolean
  opacity: number
  gradientMap: Map<string, LinearGradient | RadialGradient>
  filterMap: Map<string, FilterTemplate>
  options: Required<SvgToSifOptions>
  activeFilterId?: string
  /** Base directory for resolving relative media paths */
  baseDir?: string
}

const PRESENTATION_ATTRS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'line-height',
  'letter-spacing',
  'visibility'
]

export function svgToSif(svgString: string, options?: SvgToSifOptions): Element[] {
  resetIdCounter()

  const opts: Required<SvgToSifOptions> = {
    preserveGroups: true,
    includeDefs: true,
    defaultFontFamily: 'sans-serif',
    baseDir: '',
    ...options
  }

  const parsed = parseSVG(svgString)
  const svgRoot = getSvgRoot(parsed)

  if (!svgRoot) {
    throw new Error('Invalid SVG: no <svg> root element found')
  }

  const defs = getDefs(svgRoot)
  const gradientMap = buildGradientMap(defs)
  const context: ConversionContext = {
    transformMatrix: identityMatrix(),
    inheritedStyles: {
      fill: '#000000',
      'font-family': opts.defaultFontFamily
    },
    visible: true,
    opacity: 1,
    gradientMap,
    filterMap: buildFilterMap(defs),
    options: opts,
    baseDir: opts.baseDir
  }

  const elements: Element[] = []
  for (const child of getChildElements(svgRoot)) {
    const converted = convertElement(child, context)
    if (!converted) continue

    if (!opts.preserveGroups && converted.type === 'group') {
      elements.push(...flattenGroupChildren(converted))
    } else {
      elements.push(converted)
    }
  }

  return elements
}

function buildGradientMap(defs: Map<string, Record<string, unknown>>): Map<string, LinearGradient | RadialGradient> {
  const gradientMap = new Map<string, LinearGradient | RadialGradient>()

  for (const [id, def] of defs) {
    if (!looksLikeGradient(def)) continue
    gradientMap.set(id, isLinearGradientDef(def) ? convertLinearGradient(def, id) : convertRadialGradient(def, id))
  }

  return gradientMap
}

function buildFilterMap(defs: Map<string, Record<string, unknown>>): Map<string, FilterTemplate> {
  const filterMap = new Map<string, FilterTemplate>()
  for (const [id, def] of defs) {
    if (!looksLikeFilter(def)) continue
    const filter = convertFilterDef(def)
    if (filter) {
      filterMap.set(id, filter)
    }
  }
  return filterMap
}

function convertElement(element: Record<string, unknown>, context: ConversionContext): Element | undefined {
  const { tagName, node } = unwrapElement(element)
  const prepared = applyContextToNode(node, context)
  const nextContext = createChildContext(prepared, context, tagName)

  switch (tagName) {
    case 'rect':
      return convertShape(() => convertRect(prepared, generateId('rect'), { gradientMap: context.gradientMap, transformMatrix: nextContext.transformMatrix }), prepared, nextContext)
    case 'circle':
      return convertShape(() => convertCircle(prepared, generateId('circle'), { gradientMap: context.gradientMap, transformMatrix: nextContext.transformMatrix }), prepared, nextContext)
    case 'ellipse':
      return convertShape(() => convertEllipse(prepared, generateId('ellipse'), { gradientMap: context.gradientMap, transformMatrix: nextContext.transformMatrix }), prepared, nextContext)
    case 'path':
      return convertShape(() => convertPath(prepared, generateId('path'), { gradientMap: context.gradientMap, transformMatrix: nextContext.transformMatrix }), prepared, nextContext)
    case 'line':
      return hasMarkers(prepared)
        ? convertSvgLineElement(prepared, nextContext)
        : convertShape(() => convertLine(prepared, generateId('line'), { gradientMap: context.gradientMap, transformMatrix: nextContext.transformMatrix }), prepared, nextContext)
    case 'polygon':
      return convertShape(() => convertPolygon(prepared, generateId('polygon'), { gradientMap: context.gradientMap, transformMatrix: nextContext.transformMatrix }), prepared, nextContext)
    case 'polyline':
      return convertShape(() => convertPolyline(prepared, generateId('polyline'), { gradientMap: context.gradientMap, transformMatrix: nextContext.transformMatrix }), prepared, nextContext)
    case 'text':
      return convertTextElement(prepared, nextContext)
    case 'image':
      return convertMediaElement(() => convertImage(prepared, generateId('image'), { transformMatrix: nextContext.transformMatrix, baseDir: context.baseDir }), prepared, nextContext)
    case 'video':
      return convertMediaElement(() => convertVideo(prepared, generateId('video'), { transformMatrix: nextContext.transformMatrix, baseDir: context.baseDir }), prepared, nextContext)
    case 'audio':
      return convertMediaElement(() => convertAudio(prepared, generateId('audio'), { transformMatrix: nextContext.transformMatrix, baseDir: context.baseDir }), prepared, nextContext)
    case 'g':
    case 'svg':
      return convertGroupElement(prepared, nextContext)
    default:
      return undefined
  }
}

function convertTextElement(node: Record<string, unknown>, context: ConversionContext): TextElement | RichTextElement {
  const converted = convertText(node, generateId('text'), {
    gradientMap: context.gradientMap,
    transformMatrix: context.transformMatrix
  })
  return applyEffect(applyElementContext(converted, context), node, context)
}

function convertSvgLineElement(node: Record<string, unknown>, context: ConversionContext): LineElement {
  const converted = convertMarkedLine(node, generateId('line'), {
    transformMatrix: context.transformMatrix
  })
  return applyEffect(applyElementContext(converted, context, node), node, context)
}

function convertGroupElement(node: Record<string, unknown>, context: ConversionContext): Element | undefined {
  const children = getChildElements(node)
    .map(child => convertElement(child, context))
    .filter(Boolean) as Element[]

  if (children.length === 0) {
    return undefined
  }

  if (!context.options.preserveGroups) {
    if (children.length === 1) return children[0]
    return {
      id: generateId('group'),
      type: 'group',
      children
    } as GroupElement
  }

  const group = createGroup(node, children, generateId('group'))
  group.visible = context.visible
  return group
}

function convertShape(factory: () => ShapeElement, node: Record<string, unknown>, context: ConversionContext): ShapeElement {
  const shape = factory()
  return applyEffect(applyElementContext(shape, context, node), node, context)
}

function convertMediaElement(factory: () => ImageElement | VideoElement | AudioElement, node: Record<string, unknown>, context: ConversionContext): ImageElement | VideoElement | AudioElement {
  const media = factory()
  return applyEffect(applyElementContext(media, context, node), node, context)
}

function applyElementContext<T extends Element>(element: T, context: ConversionContext, source?: Record<string, unknown>): T {
  if (element.type !== 'group') {
    element.opacity = context.opacity
  }

  element.visible = context.visible

  if (source) {
    const explicitVisibility = getAttr(source, 'visibility')
    if (explicitVisibility) {
      element.visible = explicitVisibility !== 'hidden' && explicitVisibility !== 'collapse'
    }
  }

  return element
}

function createChildContext(node: Record<string, unknown>, parent: ConversionContext, tagName?: string): ConversionContext {
  const ownMatrix = parseTransformToMatrix(getAttr(node, 'transform'))
  const viewportMatrix = tagName === 'svg' ? getNestedSvgViewportMatrix(node) : identityMatrix()
  const ownOpacity = parseNumeric(node, 'opacity', 1)
  const visibility = getAttr(node, 'visibility')

  return {
    ...parent,
    transformMatrix: multiplyMatrices(parent.transformMatrix, multiplyMatrices(ownMatrix, viewportMatrix)),
    inheritedStyles: collectInheritedStyles(node, parent.inheritedStyles),
    visible: parent.visible && visibility !== 'hidden' && visibility !== 'collapse',
    opacity: parent.opacity * ownOpacity
    ,
    activeFilterId: parseFilterId(getAttr(node, 'filter')) || parent.activeFilterId
  }
}

function applyContextToNode(node: Record<string, unknown>, context: ConversionContext): Record<string, unknown> {
  const result: Record<string, unknown> = { ...node }
  copyElementMetadata(node, result)
  applyInlineStyle(result)

  for (const name of PRESENTATION_ATTRS) {
    const key = `@_${name}`
    if (!(key in result) && context.inheritedStyles[name] !== undefined) {
      result[key] = context.inheritedStyles[name]
    }
  }

  if (!('@_font-family' in result) && context.options.defaultFontFamily) {
    result['@_font-family'] = context.options.defaultFontFamily
  }

  return result
}

function collectInheritedStyles(node: Record<string, unknown>, parent: Record<string, string>): Record<string, string> {
  const inherited = { ...parent }
  for (const name of PRESENTATION_ATTRS) {
    const value = getAttr(node, name)
    if (value !== undefined) {
      inherited[name] = value
    }
  }
  return inherited
}

function unwrapElement(element: Record<string, unknown>): { tagName: string; node: Record<string, unknown> } {
  for (const tag of ['rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline', 'text', 'image', 'video', 'audio', 'g', 'svg']) {
    if (tag in element && element[tag] && typeof element[tag] === 'object') {
      return {
        tagName: tag,
        node: element[tag] as Record<string, unknown>
      }
    }
  }

  return {
    tagName: 'unknown',
    node: element
  }
}

function flattenGroupChildren(group: GroupElement): Element[] {
  const result: Element[] = []
  for (const child of group.children) {
    if (child.type === 'group') {
      result.push(...flattenGroupChildren(child))
    } else {
      result.push(child)
    }
  }
  return result
}

function looksLikeGradient(def: Record<string, unknown>): boolean {
  return 'stop' in def || getAttr(def, 'x1') !== undefined || getAttr(def, 'cx') !== undefined || getAttr(def, 'r') !== undefined
}

function looksLikeFilter(def: Record<string, unknown>): boolean {
  return 'feGaussianBlur' in def || 'feOffset' in def || 'feMerge' in def || 'feComponentTransfer' in def
}

function parseNumeric(node: Record<string, unknown>, name: string, fallback: number): number {
  const value = getAttr(node, name)
  if (value === undefined) return fallback
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

function getNestedSvgViewportMatrix(node: Record<string, unknown>): TransformMatrix {
  const x = parseNumeric(node, 'x', 0)
  const y = parseNumeric(node, 'y', 0)
  const viewBox = parseViewBox(getAttr(node, 'viewBox'))

  if (!viewBox) {
    return [1, 0, 0, 1, x, y]
  }

  const width = parseNumeric(node, 'width', viewBox.width)
  const height = parseNumeric(node, 'height', viewBox.height)

  if (viewBox.width === 0 || viewBox.height === 0 || width === 0 || height === 0) {
    return [1, 0, 0, 1, x, y]
  }

  const scaleX = width / viewBox.width
  const scaleY = height / viewBox.height

  return multiplyMatrices(
    [1, 0, 0, 1, x, y],
    multiplyMatrices(
      [scaleX, 0, 0, scaleY, 0, 0],
      [1, 0, 0, 1, -viewBox.x, -viewBox.y]
    )
  )
}

function parseViewBox(value: string | undefined): { x: number; y: number; width: number; height: number } | undefined {
  if (!value?.trim()) return undefined

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(part => parseFloat(part))

  if (parts.length < 4 || parts.some(part => Number.isNaN(part))) {
    return undefined
  }

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3]
  }
}

function applyInlineStyle(node: Record<string, unknown>): void {
  const style = getAttr(node, 'style')
  if (!style) return

  for (const part of style.split(';')) {
    const [rawKey, rawValue] = part.split(':')
    if (!rawKey || !rawValue) continue
    const key = `@_${rawKey.trim()}`
    if (!(key in node)) {
      node[key] = rawValue.trim()
    }
  }
}

function parseFilterId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.match(/^url\(#([^)]+)\)$/)
  return match?.[1]
}

function hasMarkers(node: Record<string, unknown>): boolean {
  return getAttr(node, 'marker-start') !== undefined ||
    getAttr(node, 'marker-end') !== undefined ||
    getAttr(node, 'marker-mid') !== undefined
}

function applyEffect<T extends Element>(element: T, node: Record<string, unknown>, context: ConversionContext): T {
  const filterId = parseFilterId(getAttr(node, 'filter')) || context.activeFilterId
  if (!filterId) return element

  const template = context.filterMap.get(filterId)
  if (!template || element.type === 'group') return element

  const source = element.type === 'shape'
    ? { fill: element.fill, stroke: element.stroke }
    : element.type === 'text'
      ? { fill: element.fill }
      : {}

  const effect = resolveFilterEffect(template, source) as VisualEffect | undefined
  if (effect) {
    ;(element as T & { effect?: VisualEffect }).effect = effect
  }
  return element
}
