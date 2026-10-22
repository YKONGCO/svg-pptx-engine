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
import { convertRect, convertCircle, convertEllipse, convertPath, convertLine, convertPolygon, convertPolyline, convertMarkedLine, convertMarkedPolyline, computePathBounds, computePointsBounds } from './converters/shape'
import { convertText } from './converters/text'
import { convertForeignObject } from './converters/foreignObject'
import { createGroup, identityMatrix, multiplyMatrices, parseTransformToMatrix, applyMatrixToBounds, applyMatrixToShapeBounds, decomposeMatrix, type TransformMatrix } from './converters/group'
import { convertLinearGradient, convertRadialGradient, isLinearGradientDef } from './converters/gradient'
import { convertFilterDef, resolveFilterEffect } from './converters/filter'
import { convertImage, convertVideo, convertAudio } from './converters/media'
import { buildMarkerMap } from './converters/marker'
import { parsePathToPoints } from './utils/path-parser'
import { applyAnimationSnapshot, collectAnimations } from './converters/animation'
import { convertPattern, looksLikePattern, type PatternTemplate } from './converters/pattern'
import { convertClipPath, looksLikeClipPath, type ClipPathResource } from './converters/clip-path'
import { convertMask, looksLikeMask, type MaskResource } from './converters/mask'
import { pass } from '../layout'
import { DEFAULT_FONT_BRIDGE } from '../utils/font'

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
  /**
   * Phase 2: layout engine switch.
   *  - 'auto' (default) — run the layout pass; `<g layout="…">` containers
   *    reposition their children.
   *  - 'off' — skip the layout pass; every element keeps the coordinates
   *    the SVG attributes specified. Useful for v1.0 regression tests.
   *
   * Note: named `useLayout` to avoid clashing with PptxGeneratorOptions.layout
   * (which is a pptxgenjs slide-layout name).
   */
  useLayout?: 'auto' | 'off'
}

interface ConversionContext {
  transformMatrix: TransformMatrix
  inheritedStyles: Record<string, string>
  visible: boolean
  opacity: number
  gradientMap: Map<string, LinearGradient | RadialGradient>
  filterMap: Map<string, FilterTemplate>
  /** Phase 0.2A: id → PatternTemplate map for `<pattern>` defs. */
  patternMap: Map<string, PatternTemplate>
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
  return svgToSifWithDefs(svgString, options).elements
}

/**
 * Same as {@link svgToSif} but additionally returns the resolved
 * `<pattern>` / `<clipPath>` / `<mask>` def maps. The PPTX layer
 * needs the pattern tile geometry + children in order to rasterise
 * the tile to a PNG and use it as a repeating image fill; the
 * element-level `patternFillId` / `clipPathId` / `maskId` are just
 * pointers into these maps.
 */
export interface SvgToSifResult {
  elements: Element[]
  defs: {
    patterns: Map<string, PatternTemplate>
    clipPaths: Map<string, ClipPathResource>
    masks: Map<string, MaskResource>
  }
}

export function svgToSifWithDefs(svgString: string, options?: SvgToSifOptions): SvgToSifResult {
  resetIdCounter()

  const opts: Required<SvgToSifOptions> = {
    preserveGroups: true,
    includeDefs: true,
    defaultFontFamily: DEFAULT_FONT_BRIDGE.web,
    baseDir: '',
    useLayout: 'auto',
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
  // Pattern defs are resolved in a second pass once the base context
  // exists, because building a pattern requires recursively converting
  // its children with the same context the outer converter uses.
  const baseContext: ConversionContext = {
    transformMatrix: identityMatrix(),
    inheritedStyles: {
      fill: '#000000',
      'font-family': opts.defaultFontFamily
    },
    visible: true,
    opacity: 1,
    gradientMap,
    filterMap: buildFilterMap(defs),
    patternMap: new Map(),
    markerMap,
    defsMap: defs,
    options: opts,
    baseDir: opts.baseDir
  }
  const patternMap = buildPatternMap(defs, baseContext)
  baseContext.patternMap = patternMap
  const clipPathMap = buildClipPathMap(defs)
  const maskMap = buildMaskMap(defs, gradientMap)

  const elements: Element[] = []
  for (const child of getChildElements(svgRoot)) {
    const converted = convertElement(child, baseContext)
    if (!converted) continue

    if (!opts.preserveGroups && converted.type === 'group') {
      elements.push(...flattenGroupChildren(converted))
    } else {
      elements.push(converted)
    }
  }

  // Phase 2 (layout engine): by default we run the layout pass so
  // `<g layout="…">` containers reposition their children. Callers
  // can opt out with `options.useLayout = 'off'` to get the v1.0
  // "coordinate passthrough" behavior.
  const result = opts.useLayout !== 'off' ? pass(elements, { enabled: true, warnOnOverlap: false }) : elements
  return {
    elements: Array.isArray(result) ? result : result.elements,
    defs: { patterns: patternMap, clipPaths: clipPathMap, masks: maskMap }
  }
}

function buildGradientMap(defs: Map<string, Record<string, unknown>>): Map<string, LinearGradient | RadialGradient> {
  const gradientMap = new Map<string, LinearGradient | RadialGradient>()

  for (const [id, def] of defs) {
    if (!looksLikeGradient(def, defs)) continue
    // Phase 0.2B: pass the full defs map so the gradient converter can
    // chase `xlink:href` chains and inherit stops + endpoints from the
    // referenced parent gradient (SVG 2 §13.2).
    gradientMap.set(
      id,
      isLinearGradientDef(def)
        ? convertLinearGradient(def, id, { defsMap: defs })
        : convertRadialGradient(def, id, { defsMap: defs })
    )
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

/**
 * Build a `PatternTemplate` map for each `<pattern>` def. Each
 * pattern's children are recursively converted through `convertElement`
 * with the supplied context so they pick up the same defs, gradients
 * and filters the outer SVG does.
 */
function buildPatternMap(
  defs: Map<string, Record<string, unknown>>,
  context: ConversionContext
): Map<string, PatternTemplate> {
  const patternMap = new Map<string, PatternTemplate>()
  for (const [id, def] of defs) {
    if (!looksLikePattern(def)) continue
    const convertChild = (raw: Record<string, unknown>) => convertElement(raw, context)
    const pattern = convertPattern(def, id, convertChild)
    patternMap.set(id, pattern)
  }
  return patternMap
}

/**
 * Build a `ClipPathResource` map for each `<clipPath>` def. Currently
 * only single-rect clipPaths land in the map; anything more complex
 * is dropped (with a warn) so the rest of the document still renders.
 */
function buildClipPathMap(defs: Map<string, Record<string, unknown>>): Map<string, ClipPathResource> {
  const map = new Map<string, ClipPathResource>()
  for (const [id, def] of defs) {
    if (!looksLikeClipPath(def)) continue
    const resource = convertClipPath(def, id)
    if (resource) map.set(id, resource)
  }
  return map
}

function buildMaskMap(
  defs: Map<string, Record<string, unknown>>,
  gradientMap: Map<string, LinearGradient | RadialGradient>
): Map<string, MaskResource> {
  const map = new Map<string, MaskResource>()
  for (const [id, def] of defs) {
    if (!looksLikeMask(def)) continue
    const resource = convertMask(def, id, gradientMap)
    if (resource) map.set(id, resource)
  }
  return map
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
    case 'foreignObject': {
      // Phase 0.2B: render a `<foreignObject>` as a SIF RichTextElement.
      // The whitelist (`h1-h6 / p / span / b / i / u / em / strong / br`)
      // covers the common "labelled callout" case browsers handle natively.
      const richText = convertForeignObject(prepared, {
        generateId,
        transformMatrix: nextContext.transformMatrix,
      })
      if (!richText) return undefined
      return applyElementContext(richText, nextContext, prepared)
    }
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
  // Phase 1.3.2: hoist the group's clip-path / mask down to each
  // child *before* conversion, so the child-level absolute clip
  // rect can be resolved against the child's own transform matrix
  // (which is already applied by the time the child is
  // converted). Without this, a group with clip-path renders its
  // children unclipped because only the group itself carries the
  // id and the PPTX layer's `applyClipPathAndMask` runs per-child
  // — not per-group.
  const groupClipPathRef = parseResourceId(getAttr(node, 'clip-path'))
  const groupMaskRef = parseResourceId(getAttr(node, 'mask'))
  const childrenSource = getChildElements(node)
  if (groupClipPathRef || groupMaskRef) {
    for (const child of childrenSource) {
      if (!child || typeof child !== 'object') continue
      // Each child is shaped like `{ <tagName>: { '@_attr': ... } }`
      // — find the inner attribute record and stamp the parent's
      // clip-path / mask onto it (unless the child already carries
      // its own). Setting it on the outer wrapper is invisible to
      // `getAttr` because the parser keys attributes by `@_*`.
      const tagKey = Object.keys(child).find(k => !k.startsWith('@_') && k !== '#text' && k !== '#cdata-section')
      if (!tagKey) continue
      const inner = child[tagKey] as Record<string, unknown> | undefined
      if (!inner || typeof inner !== 'object') continue
      if (groupClipPathRef && !('@_clip-path' in inner)) {
        inner['@_clip-path'] = `url(#${groupClipPathRef})`
      }
      if (groupMaskRef && !('@_mask' in inner)) {
        inner['@_mask'] = `url(#${groupMaskRef})`
      }
    }
  }

  // Phase 3.x: when this group is a layout container (`<g
  // layout="…">`), the layout flow will reposition its children
  // based on flex / block / grid / inline rules. If we leave the
  // parent transform baked into the children (the normal SIF
  // design), the layout flow's `target - child.x` delta undoes
  // that translate — the layouts appear shifted by the parent
  // transform's negation. To avoid this, use a fresh transform
  // context for the children so the layout flow operates on
  // flex-local coordinates; the parent translate is captured on
  // the group itself and re-applied by `flattenToAbsolute`.
  const layoutAttr = getAttr(node, 'layout')
  const isLayoutGroup = layoutAttr === 'block' || layoutAttr === 'flex' ||
    layoutAttr === 'grid' || layoutAttr === 'inline' || layoutAttr === 'absolute'
  const childContext: ConversionContext = isLayoutGroup
    ? {
        ...context,
        // Reset the accumulated transform matrix for the layout
        // group's children. The layout group itself typically has
        // no SVG transform, but if it did, we'd re-apply it on
        // top of the (now reset) matrix so the children's
        // positions are still relative to the layout group's
        // own coordinate system. The parent translate is captured
        // on the group below.
        transformMatrix: parseTransformToMatrix(getAttr(node, 'transform'))
      }
    : context

  const children = childrenSource
    .map(child => convertElement(child, childContext))
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

  // Capture the parent transform onto a layout group so the layout
  // pass can re-apply it. The SIF design says groups don't carry
  // transforms, but this is a controlled deviation for layout
  // groups (see GroupElement.transform doc).
  if (isLayoutGroup) {
    const inheritedMatrix = context.transformMatrix
    const ownMatrix = parseTransformToMatrix(getAttr(node, 'transform'))
    const composed = multiplyMatrices(inheritedMatrix, ownMatrix)
    const decomposed = decomposeMatrix(composed)
    if (Math.abs(decomposed.translateX) > 1e-9 || Math.abs(decomposed.translateY) > 1e-9) {
      ;(group as GroupElement & { transform?: { translateX?: number; translateY?: number } }).transform = {
        translateX: decomposed.translateX,
        translateY: decomposed.translateY
      }
    }
  }

  // Phase 1.3: group-level clip-path / mask reference. Stamping
  // the id on the group itself is still useful for the layout
  // pass / round-tripping, even though the children already
  // inherited the same id during conversion above.
  if (groupClipPathRef) (group as GroupElement & { clipPathId?: string }).clipPathId = groupClipPathRef
  if (groupMaskRef) (group as GroupElement & { maskId?: string }).maskId = groupMaskRef

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
    const matrix = buildShapeOverrideMatrix(target, targetTag, useX, useY, useW, useH, node)
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
  useH: number | undefined,
  useNode?: Record<string, unknown>
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
  } else if (targetTag === 'path') {
    // Phase 0.2B: re-coordinate path bbox so the use's x/y/w/h overrides
    // place the path's bounding box at (useX, useY) with the requested
    // size. SVG 2 says w/h on `<use>` is symbol-only, but supporting it
    // for path matches author expectations for "stamp this glyph at
    // this size" patterns.
    //
    // v4: do NOT re-base the geometry onto (useX, useY) when the use
    // didn't supply x/y — a path's `M 30 80 Q 130 0 250 80` is already
    // at (30, 80) in its parent's coordinate system. Subtracting the
    // path's bbox.x here used to drag the curve 30px to the left of
    // where the textPath-character sampler placed the glyphs.
    const d = getAttr(target as Record<string, unknown>, 'd') || ''
    if (d) {
      const bounds = computePathBounds(parsePathToPoints(d))
      // Only re-base when the use *explicitly* sets x/y. Without an
      // explicit x/y, the geometry sits where the path says it sits.
      if (useNode && (getAttr(useNode, 'x') !== undefined || getAttr(useNode, 'y') !== undefined)) {
        originX = bounds.x
        originY = bounds.y
      }
      if (useW !== undefined && bounds.width > 0) scaleX = useW / bounds.width
      if (useH !== undefined && bounds.height > 0) scaleY = useH / bounds.height
    }
  } else if (targetTag === 'polygon' || targetTag === 'polyline') {
    const pts = getAttr(target as Record<string, unknown>, 'points') || ''
    if (pts) {
      const bounds = computePointsBounds(pts)
      if (useNode && (getAttr(useNode, 'x') !== undefined || getAttr(useNode, 'y') !== undefined)) {
        originX = bounds.x
        originY = bounds.y
      }
      if (useW !== undefined && bounds.width > 0) scaleX = useW / bounds.width
      if (useH !== undefined && bounds.height > 0) scaleY = useH / bounds.height
    }
  } else if (targetTag === 'line') {
    // Phase 0.2B v4: a `<line>`'s endpoints are absolute in the parent
    // coordinate system (same as path), so only re-base when the use
    // explicitly overrides x/y.
    const x1 = parseNumeric(target, 'x1', 0)
    const y1 = parseNumeric(target, 'y1', 0)
    const x2 = parseNumeric(target, 'x2', 0)
    const y2 = parseNumeric(target, 'y2', 0)
    if (useNode && (getAttr(useNode, 'x') !== undefined || getAttr(useNode, 'y') !== undefined)) {
      originX = Math.min(x1, x2)
      originY = Math.min(y1, y2)
    }
    const w = Math.abs(x2 - x1)
    const h = Math.abs(y2 - y1)
    if (useW !== undefined && w > 0) scaleX = useW / w
    if (useH !== undefined && h > 0) scaleY = useH / h
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

    // Phase 3.3.1: forward z-index so the layout pass can re-order
    // siblings. The attribute is parsed as a float; missing / NaN
    // values are left undefined.
    const zIndexRaw = parseFloat(getAttr(source, 'z-index') ?? '')
    if (Number.isFinite(zIndexRaw)) {
      (element as T & { zIndex?: number }).zIndex = zIndexRaw
    }

    // Phase 1.3: stamp clip-path / mask / pattern references onto the
    // element so the PPTX layer can apply them.
    const clipPathRef = parseResourceId(getAttr(source, 'clip-path'))
    if (clipPathRef) {
      (element as T & { clipPathId?: string }).clipPathId = clipPathRef
      // Phase 1.3.1: also stamp the resolved absolute clip rect. SVG
      // `<clipPath>` coords are in the *user space of the referencing
      // element* (which for a child of a transformed group is the
      // group's local space, not absolute screen space). We transform
      // the clip rect by the element's accumulated transform matrix
      // here so the PPTX layer can intersect it with the element's
      // absolute bounding box without re-deriving the geometry.
      const resolved = resolveAbsoluteClipRect(clipPathRef, context)
      if (resolved) {
        ;(element as T & { clipPathRect?: { x: number; y: number; width: number; height: number } }).clipPathRect = resolved
      }
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

/**
 * Phase 1.3.1: resolve a `<clipPath>` def's rect into absolute
 * screen-space coords by combining the rect's own `transform`
 * attribute (e.g. `rotate(45 cx cy)`) with the element's
 * accumulated transform matrix. Returns `undefined` if the def is
 * not a single-rect clipPath (the PPTX layer only supports
 * single-rect clip landing; everything else is deferred to the
 * "skip + warn" path).
 *
 * For rotated rects the result is the axis-aligned bounding box
 * of the rotated shape — a conservative approximation, since PPTX
 * cannot represent a rotated clip region natively. A `objectBoundingBox`
 * clipPath (coords in 0..1 of the host's bbox) is normalised to
 * the supplied element bounding box so the PPTX layer can crop
 * consistently.
 */
function resolveAbsoluteClipRect(
  clipPathId: string,
  context: ConversionContext
): { x: number; y: number; width: number; height: number } | undefined {
  const def = context.defsMap.get(clipPathId)
  if (!def || !looksLikeClipPath(def)) return undefined
  const resource = convertClipPath(def, clipPathId)
  if (!resource || resource.type !== 'rect') return undefined

  if (resource.clipPathUnits === 'objectBoundingBox') {
    // objectBoundingBox clips are interpreted in the host's
    // local 0..1 space; we have no host bbox here so we can only
    // fall back. Defer to the PPTX layer for the actual mapping.
    return undefined
  }

  // 1. Apply the clipPath rect's own `transform` attribute to the
  //    local rect to get the *element-user-space* rect (matches
  //    what the SVG renderer would see inside the clipPath).
  const rectDef = (def['rect'] as Record<string, unknown> | undefined)
  const rectTransform = rectDef ? parseTransformToMatrix(getAttr(rectDef, 'transform')) : identityMatrix()

  // Phase 5.1: PPTX's clipPath can only crop in axis-aligned
  // rectangles. A rotated/scaled rect would need either a
  // custom-geometry clip path or a rasterised mask, neither of
  // which the current landing supports. The AABB fallback would
  // either crop too much (rect partially outside its rotated
  // bounds) or too little (AABB larger than the original shape,
  // so the clip is a no-op). Either way, the user gets a
  // silently-mis-clipped shape that doesn't match the SVG.
  //
  // For now, detect any non-trivial rect transform and warn +
  // skip the clip so the un-clipped shape renders. The user
  // sees the warning in the build log and knows to either
  // flatten the rotation in the SVG or wait for a future
  // PPTX custom-geometry clip path.
  if (isNonTrivialTransform(rectTransform)) {
    if (typeof console !== 'undefined') {
      console.warn(`[svg-pptx] clipPath "${clipPathId}" has a rotated/scaled rect; clipping will be skipped.`)
    }
    return undefined
  }

  const inElementSpace = applyMatrixToBounds(
    resource.x,
    resource.y,
    resource.width,
    resource.height,
    rectTransform
  )

  // 2. Apply the element's accumulated transform matrix to map
  //    element-user-space → absolute screen space. This is what
  //    the PPTX layer needs in order to intersect the clip with
  //    the element's already-absolute bounding box.
  return applyMatrixToBounds(
    inElementSpace.x,
    inElementSpace.y,
    inElementSpace.width,
    inElementSpace.height,
    context.transformMatrix
  )
}

/**
 * Heuristic: does the matrix represent anything beyond translation?
 * TransformMatrix is [a, b, c, d, tx, ty] (2D affine). Pure
 * translation has `a = d = 1` and `b = c = 0`; anything else is
 * rotation / scale / skew, which we can't faithfully render as a
 * PPTX rect clip.
 */
function isNonTrivialTransform(matrix: TransformMatrix): boolean {
  return !(matrix[0] === 1 && matrix[1] === 0 && matrix[2] === 0 && matrix[3] === 1)
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
    'set', 'animate', 'animateTransform', 'animateMotion',
    // Phase 0.2B: HTML-in-SVG escape hatch
    'foreignObject'
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

function looksLikeGradient(def: Record<string, unknown>, defs?: Map<string, Record<string, unknown>>): boolean {
  if ('stop' in def) return true
  for (const attr of ['x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'fx', 'fy', 'fr', 'r', 'spreadMethod', 'gradientUnits', 'gradientTransform']) {
    if (getAttr(def, attr) !== undefined) return true
  }
  // Phase 0.2B: a child gradient may carry only `xlink:href` (no stops,
  // no own endpoints). Chase the href so we can still recognise it as a
  // gradient. Cycle-guarded.
  const href = getAttr(def, 'href') ?? getAttr(def, 'xlink:href')
  if (!href || !defs) return false
  const visited = new Set<string>()
  let cursor: Record<string, unknown> | undefined = defs.get(href.replace(/^#/, ''))
  while (cursor) {
    if ('stop' in cursor) return true
    for (const attr of ['x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'fx', 'fy', 'fr', 'r', 'spreadMethod', 'gradientUnits', 'gradientTransform']) {
      if (getAttr(cursor, attr) !== undefined) return true
    }
    const nextHref = getAttr(cursor, 'href') ?? getAttr(cursor, 'xlink:href')
    if (!nextHref) return false
    const cleaned = nextHref.replace(/^#/, '')
    if (visited.has(cleaned)) return false
    visited.add(cleaned)
    cursor = defs.get(cleaned)
  }
  return false
}

function looksLikeFilter(def: Record<string, unknown>): boolean {
  return 'feGaussianBlur' in def ||
    'feOffset' in def ||
    'feMerge' in def ||
    'feComponentTransfer' in def ||
    'feDropShadow' in def ||
    'feFlood' in def ||
    'feColorMatrix' in def
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
