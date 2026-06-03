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
import { convertRect, convertCircle, convertEllipse, convertPath, convertLine, convertPolygon, convertPolyline, convertMarkedLine, convertMarkedPolyline } from './converters/shape'
import { convertText } from './converters/text'
import { createGroup, identityMatrix, multiplyMatrices, parseTransformToMatrix, type TransformMatrix } from './converters/group'
import { convertLinearGradient, convertRadialGradient, isLinearGradientDef } from './converters/gradient'
import { convertFilterDef, resolveFilterEffect } from './converters/filter'
import { convertImage, convertVideo, convertAudio } from './converters/media'
import { buildMarkerMap } from './converters/marker'
import { applyAnimationSnapshot, collectAnimations } from './converters/animation'

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
  /** Phase 1.2: id → ArrowMarker map for `<marker>` definitions. */
  markerMap: Map<string, import('../sif/types/elements/line').ArrowMarker>
  /**
   * Flat id→element map for any defs entry (gradients, filters, symbols,
   * reusable shapes, groups, etc.). Read by `<use>` resolution.
   */
  defsMap: Map<string, Record<string, unknown>>
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
  const markerMap = buildMarkerMap(defs)
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
    markerMap,
    defsMap: defs,
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
      if (hasMarkers(prepared)) {
        return convertMarkedPolylineElement(prepared, nextContext)
      }
      return convertShape(() => convertPolyline(prepared, generateId('polyline'), { gradientMap: context.gradientMap, transformMatrix: nextContext.transformMatrix }), prepared, nextContext)
    case 'text':
      return convertTextElement(prepared, nextContext)
    case 'use':
      return convertUseElement(prepared, nextContext, context.defsMap)
    case 'symbol':
      // An unreferenced <symbol> renders nothing on its own; only
      // <use> instantiates its children.
      return undefined
    case 'clipPath':
    case 'mask':
    case 'pattern':
    case 'marker':
    case 'switch':
    case 'set':
    case 'animate':
    case 'animateTransform':
    case 'animateMotion':
      // These elements are either definition-only (clipPath/mask/pattern/marker)
      // or animation snapshots (set/animate*) and do not render content
      // on their own. They are indexed via defs and consumed by their
      // referencing attributes (clip-path, fill, marker-*, etc.) which
      // are handled in applyElementContext and the dedicated converters.
      return undefined
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
    transformMatrix: context.transformMatrix,
    defsMap: context.defsMap
  })
  return applyEffect(applyElementContext(converted, context), node, context)
}

function convertSvgLineElement(node: Record<string, unknown>, context: ConversionContext): LineElement {
  const converted = convertMarkedLine(node, generateId('line'), {
    transformMatrix: context.transformMatrix,
    markerMap: context.markerMap
  })
  const snapshot = applyAnimationSnapshot(converted, collectAnimations(node))
  return applyEffect(applyElementContext(snapshot, context, node), node, context)
}

function convertMarkedPolylineElement(node: Record<string, unknown>, context: ConversionContext): LineElement {
  const converted = convertMarkedPolyline(node, generateId('line'), {
    transformMatrix: context.transformMatrix,
    markerMap: context.markerMap
  })
  const snapshot = applyAnimationSnapshot(converted, collectAnimations(node))
  return applyEffect(applyElementContext(snapshot, context, node), node, context)
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

  // Phase 1.3: group-level clip-path / mask reference. The renderer
  // applies the mask to the group as a whole, so we stamp the id on
  // the group element itself rather than on each child.
  const clipPathRef = parseResourceId(getAttr(node, 'clip-path'))
  if (clipPathRef) (group as GroupElement & { clipPathId?: string }).clipPathId = clipPathRef
  const maskRef = parseResourceId(getAttr(node, 'mask'))
  if (maskRef) (group as GroupElement & { maskId?: string }).maskId = maskRef

  return group
}

/**
 * Resolve `<use href="#id" x y width height>` into absolute-coordinate
 * SIF children. Supports three target kinds:
 *
 *   - `<symbol>` / `<svg>`: treated as a nested viewport — the symbol's
 *     `viewBox` drives `getNestedSvgViewportMatrix` together with the
 *     use's `x/y/width/height`. (In SVG2, `width/height` on `<use>` only
 *     apply to symbol/svg references; we honour that here.)
 *   - `<g>`: translated by the use's `x/y`. Width/height are ignored.
 *   - shape (rect/circle/ellipse/path/line/polygon/polyline): the shape
 *     is converted with the use's `x/y/width/height` baked in via a
 *     translate+scale transform.
 *
 * Unresolved hrefs return `undefined` (silent drop, matching the
 * converter's existing behaviour for unsupported tags).
 */
function convertUseElement(
  node: Record<string, unknown>,
  context: ConversionContext,
  defsMap: Map<string, Record<string, unknown>>
): Element | undefined {
  const href = getUseHref(node)
  if (!href) return undefined

  const target = defsMap.get(href)
  if (!target) return undefined

  const useX = parseNumeric(node, 'x', 0)
  const useY = parseNumeric(node, 'y', 0)
  const hasW = getAttr(node, 'width') !== undefined
  const hasH = getAttr(node, 'height') !== undefined
  const useW = hasW ? parseNumeric(node, 'width', 0) : undefined
  const useH = hasH ? parseNumeric(node, 'height', 0) : undefined

  const targetTag = detectTargetTag(target)

  // Symbol / nested svg: full viewport (use's w/h scale the symbol viewBox)
  if (targetTag === 'symbol' || targetTag === 'svg') {
    const symbolViewBox = getAttr(target, 'viewBox')
    if (!symbolViewBox && !hasW && !hasH) {
      // No viewport info at all — fall back to plain translation.
      return convertGroupElement(target, withTranslate(context, useX, useY))
    }

    // Build a synthetic viewport node: inherit use's x/y/width/height,
    // and inject the target's viewBox so getNestedSvgViewportMatrix can
    // compute the right scaling.
    const syntheticNode: Record<string, unknown> = {
      '@_x': String(useX),
      '@_y': String(useY),
    }
    if (hasW) syntheticNode['@_width'] = String(useW)
    if (hasH) syntheticNode['@_height'] = String(useH)
    if (symbolViewBox) syntheticNode['@_viewBox'] = symbolViewBox

    const viewportMatrix = getNestedSvgViewportMatrix(syntheticNode)
    const nextContext: ConversionContext = {
      ...context,
      transformMatrix: multiplyMatrices(context.transformMatrix, viewportMatrix),
    }

    return convertGroupElement(target, nextContext)
  }

  // Group: translate by use's x/y (width/height ignored per SVG2)
  if (targetTag === 'g') {
    return convertGroupElement(target, withTranslate(context, useX, useY))
  }

  // Shape: translate + optional non-uniform scale.
  if (targetTag && SHAPE_TARGET_TAGS.has(targetTag)) {
    const matrix = buildShapeOverrideMatrix(target, targetTag, useX, useY, useW, useH)
    const nextContext: ConversionContext = {
      ...context,
      transformMatrix: multiplyMatrices(context.transformMatrix, matrix),
    }
    // Wrap the shape target in its own tag-keyed wrapper and re-dispatch.
    const wrapper: Record<string, unknown> = { [targetTag]: target }
    return convertElement(wrapper, nextContext)
  }

  return undefined
}

const SHAPE_TARGET_TAGS = new Set([
  'rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline'
])

function getUseHref(node: Record<string, unknown>): string | undefined {
  // Order: href (SVG2), xlink:href, namespaced xlink:href (some parsers
  // keep the namespace in the attribute key).
  const direct = getAttr(node, 'href')
  if (direct) return direct.replace(/^#/, '')

  const xlink = getAttr(node, 'xlink:href')
  if (xlink) return xlink.replace(/^#/, '')

  for (const key of Object.keys(node)) {
    if (key.endsWith('}href') || key === 'xlink\\:href') {
      const value = String(node[key])
      if (value.startsWith('#')) return value.slice(1)
      return value
    }
  }
  return undefined
}

function detectTargetTag(target: Record<string, unknown>): string | undefined {
  // `getDefs` flattens each def to its raw attribute + child map, so the
  // outer wrapper key is lost. Reconstruct the tag from the def's
  // attribute fingerprint (most specific first).
  if ('@_d' in target) return 'path'
  if ('@_cx' in target && '@_cy' in target) {
    return '@_r' in target ? 'circle' : 'ellipse'
  }
  if ('@_x1' in target && '@_x2' in target && '@_y1' in target && '@_y2' in target) {
    return 'line'
  }
  if ('@_points' in target) return 'polygon'
  if ('@_width' in target && '@_height' in target) {
    return '@_viewBox' in target ? 'svg' : 'rect'
  }
  if ('@_viewBox' in target) return 'symbol'

  // Fallback: any direct non-attribute child key (e.g. an inner <rect>
  // for a <g id="..."> wrapper).
  for (const key of Object.keys(target)) {
    if (key.startsWith('@_')) continue
    if (['rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline', 'g', 'svg', 'symbol', 'text', 'image'].includes(key)) {
      return key
    }
  }
  return undefined
}

function withTranslate(
  context: ConversionContext,
  tx: number,
  ty: number
): ConversionContext {
  if (tx === 0 && ty === 0) return context
  return {
    ...context,
    transformMatrix: multiplyMatrices(context.transformMatrix, [1, 0, 0, 1, tx, ty]),
  }
}

/**
 * Build a translate+scale matrix that, when applied to the target shape,
 * places the use's `x/y` and (if present) `width/height` overrides.
 *
 *   - For `rect`: original `x/y/width/height` → translate by (useX-origX,
 *     useY-origY); if useW/useH given, scale by (useW/width, useH/height).
 *   - For `circle`/`ellipse`: original `cx/cy/r|rx/ry` → translate by
 *     (useX-cx, useY-cy); if useW/useH given, scale radius accordingly.
 *   - For `path`/`line`/`polygon`/`polyline`: the geometry is
 *     re-coordinated by the same translate+(optional scale) matrix;
 *     the shape converters will then re-base the bbox onto the use's
 *     placement.
 */
function buildShapeOverrideMatrix(
  target: Record<string, unknown>,
  targetTag: string,
  useX: number,
  useY: number,
  useW: number | undefined,
  useH: number | undefined
): TransformMatrix {
  let originX = 0
  let originY = 0
  let scaleX = 1
  let scaleY = 1

  if (targetTag === 'rect') {
    originX = parseNumeric(target, 'x', 0)
    originY = parseNumeric(target, 'y', 0)
    if (useW !== undefined) {
      const w = parseNumeric(target, 'width', 0)
      if (w > 0) scaleX = useW / w
    }
    if (useH !== undefined) {
      const h = parseNumeric(target, 'height', 0)
      if (h > 0) scaleY = useH / h
    }
  } else if (targetTag === 'circle') {
    originX = parseNumeric(target, 'cx', 0)
    originY = parseNumeric(target, 'cy', 0)
    if (useW !== undefined || useH !== undefined) {
      const r = parseNumeric(target, 'r', 0)
      if (useW !== undefined && r > 0) scaleX = useW / (2 * r)
      if (useH !== undefined && r > 0) scaleY = useH / (2 * r)
    }
  } else if (targetTag === 'ellipse') {
    originX = parseNumeric(target, 'cx', 0)
    originY = parseNumeric(target, 'cy', 0)
    if (useW !== undefined) {
      const rx = parseNumeric(target, 'rx', 0)
      if (rx > 0) scaleX = useW / (2 * rx)
    }
    if (useH !== undefined) {
      const ry = parseNumeric(target, 'ry', 0)
      if (ry > 0) scaleY = useH / (2 * ry)
    }
  }

  // Result = T(useX, useY) * S(scaleX, scaleY) * T(-originX, -originY)
  return [
    scaleX, 0, 0, scaleY,
    useX - originX * scaleX,
    useY - originY * scaleY,
  ]
}

function convertShape(factory: () => ShapeElement, node: Record<string, unknown>, context: ConversionContext): ShapeElement {
  const shape = factory()
  // Phase 1.5: apply SMIL animation snapshot (`<set>`, `<animate>`,
  // `<animateTransform>`, `<animateMotion>`) to the shape *before*
  // the element context (opacity/visibility) is layered on, so the
  // end-state of an animation wins over the static presentation
  // attributes. The shape itself is not mutated.
  const snapshot = applyAnimationSnapshot(shape, collectAnimations(node))
  return applyEffect(applyElementContext(snapshot, context, node), node, context)
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

    // Phase 1.3: stamp clip-path / mask / pattern references onto the
    // element so the PPTX layer can apply them.
    const clipPathRef = parseResourceId(getAttr(source, 'clip-path'))
    if (clipPathRef) {
      (element as T & { clipPathId?: string }).clipPathId = clipPathRef
    }
    const maskRef = parseResourceId(getAttr(source, 'mask'))
    if (maskRef) {
      (element as T & { maskId?: string }).maskId = maskRef
    }
    const patternFillRef = parseResourceId(getAttr(source, 'fill'))
    if (patternFillRef && context.gradientMap && !context.gradientMap.has(patternFillRef)) {
      // Only mark as a pattern if it's not a known gradient id. The
      // PPTX layer falls back to the gradient map first; if missing,
      // it tries the pattern map.
      (element as T & { patternFillId?: string }).patternFillId = patternFillRef
    }
  }

  return element
}

/** Strip `url(#...)` from a resource reference attribute (clip-path, mask, fill, ...). */
function parseResourceId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.match(/^url\(#([^)]+)\)$/)
  return match ? match[1] : undefined
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
  for (const tag of [
    'rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline',
    'text', 'image', 'video', 'audio', 'g', 'svg',
    // Phase 1: defs references and animation snapshots
    'use', 'symbol', 'textPath', 'switch',
    'set', 'animate', 'animateTransform', 'animateMotion'
  ]) {
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
