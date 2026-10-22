// Shape Converter - Converts SIF shapes to pptxgenjs shapes
//
// SIF to PPTX Conversion Notes:
// - SIF uses pixels (px), PPTX uses inches (96 DPI)
// - SIF uses opacity (0-1), PPTX uses transparency (0-100)
//   Formula: transparency = (1 - opacity) * 100
// - SIF shape coordinates are in the bounding box (x, y, width, height)
// - PPTX shape coordinates are in inches

import PptxGenJS from 'pptxgenjs'
import type {
  ShapeElement,
  ShapeType,
  CircleShape,
  EllipseShape,
  RectShape,
  LineShape,
  PathShape,
  PolygonShape,
  PolylineShape,
  PathPoint
} from '../../sif/types/elements/shape'
import type { Fill, SolidFill, GradientFill } from '../../sif/types/style/fill'
import type { Gradient, LinearGradient } from '../../sif/types/style/gradient'
import type { Stroke } from '../../sif/types/style/stroke'
import type { VisualEffect } from '../../sif/types/style/effect'
import type { Transform } from '../../sif/types/common'
import type { ClipPathResource, MaskResource, SlideResources } from '../../sif/types/document'
import { hexToPptxColorWithAlpha, opacityToTransparency, dashArrayToDashType, pxToInch, pxToPt } from '../utils'
import { convertPathPointsForPptx } from '../utils/path-to-pptx'
import { parsePathToPoints } from '../../svg/utils/path-parser'

/**
 * Shape conversion result - contains shape name and options
 */
export interface ConvertedShape {
  shapeName: PptxGenJS.SHAPE_NAME
  options: PptxGenJS.ShapeProps
}

function combineTransparency(baseTransparency?: number, extraOpacity?: number): number | undefined {
  if (baseTransparency === undefined && extraOpacity === undefined) return undefined

  const base = (baseTransparency ?? 0) / 100
  const extra = extraOpacity === undefined ? 0 : (1 - extraOpacity)
  return Math.min(100, Math.round((1 - (1 - base) * (1 - extra)) * 100))
}

function normalizeGradientStopPosition(offset?: number): number {
  if (offset === undefined) return 0
  return offset > 1 ? offset : offset * 100
}

/**
 * Convert a 6-digit hex colour to its ITU-R BT.601 luminance
 * (greyscale equivalent). Used by the `feColorMatrix
 * type="saturate" values="0"` fallback. Returns the colour
 * unchanged if it isn't a parseable 6-digit hex.
 */
function desaturateHexColor(hex: string): string {
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return hex
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  const grey = luma.toString(16).padStart(2, '0')
  return `${grey}${grey}${grey}`.toUpperCase()
}

/**
 * Rotate a 6-digit hex colour's hue by `degrees` (HSL space,
 * additive). Returns the colour unchanged if it isn't a parseable
 * 6-digit hex. Used by the `feColorMatrix type="hueRotate"`
 * fallback for solid fills — for gradients/patterns the colour
 * shift would need to be applied per-stop, which the Phase 0.2A
 * fallback does not do.
 */
function rotateHueHexColor(hex: string, degrees: number): string {
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return hex
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  h = (h + degrees) % 360
  if (h < 0) h += 360
  // HSL → RGB
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r1 = 0, g1 = 0, b1 = 0
  if (hp < 1) { r1 = c; g1 = x; b1 = 0 }
  else if (hp < 2) { r1 = x; g1 = c; b1 = 0 }
  else if (hp < 3) { r1 = 0; g1 = c; b1 = x }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = c }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = c }
  else { r1 = c; g1 = 0; b1 = x }
  const m = l - c / 2
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `${toHex(r1)}${toHex(g1)}${toHex(b1)}`.toUpperCase()
}

function resolveLinearGradientAngle(gradient: LinearGradient): number | undefined {
  if (
    gradient.x1 !== undefined &&
    gradient.y1 !== undefined &&
    gradient.x2 !== undefined &&
    gradient.y2 !== undefined
  ) {
    const dx = gradient.x2 - gradient.x1
    const dy = gradient.y2 - gradient.y1
    const degrees = Math.atan2(dy, dx) * (180 / Math.PI)
    return (degrees + 360) % 360
  }

  return gradient.angle
}

/**
 * Phase 0.2B: warn once per distinct spreadMethod value when the SVG
 * source uses something other than `pad`. PPTX has no native reflect /
 * repeat fill mode, so we fall back to the default `pad` behaviour and
 * surface the dropped mode so the caller can decide whether to bake the
 * tile into raster ahead of time.
 */
const SPREAD_METHOD_WARNED = new Set<string>()
function warnSpreadMethodFallback(method: string): void {
  if (SPREAD_METHOD_WARNED.has(method)) return
  SPREAD_METHOD_WARNED.add(method)
  if (typeof console !== 'undefined') {
    console.warn(`[svg-pptx] gradient spreadMethod="${method}" not supported by pptxgenjs; falling back to "pad".`)
  }
}

function parsePointString(points: string): Array<{ x: number; y: number }> {
  return points
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(','))
    .filter(parts => parts.length >= 2)
    .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
}

function pointsStringToPathPoints(shape: PolygonShape | PolylineShape): PathPoint[] {
  const parsed = parsePointString(shape.points)
  if (parsed.length === 0) return []

  const pathPoints: PathPoint[] = parsed.map((point, index) => ({
    x: point.x,
    y: point.y,
    type: index === 0 ? 'M' : 'L',
    ...(index === 0 ? { moveTo: true } : {})
  })) as PathPoint[]

  if (shape.shapeType === 'polygon') {
    pathPoints.push({ close: true, type: 'Z' })
  }

  return pathPoints
}

function normalizePathPointsToLocal(points: PathPoint[], offsetX: number, offsetY: number): PathPoint[] {
  return points.map(point => {
    if ('close' in point) {
      return point
    }

    if ('curve' in point) {
      if (point.curve.type === 'cubic') {
        return {
          ...point,
          x: point.x - offsetX,
          y: point.y - offsetY,
          curve: {
            ...point.curve,
            x1: point.curve.x1 - offsetX,
            y1: point.curve.y1 - offsetY,
            x2: point.curve.x2 - offsetX,
            y2: point.curve.y2 - offsetY
          }
        }
      }

      if (point.curve.type === 'quadratic') {
        return {
          ...point,
          x: point.x - offsetX,
          y: point.y - offsetY,
          curve: {
            ...point.curve,
            x1: point.curve.x1 - offsetX,
            y1: point.curve.y1 - offsetY
          }
        }
      }

      return {
        ...point,
        x: point.x - offsetX,
        y: point.y - offsetY
      }
    }

    return {
      ...point,
      x: point.x - offsetX,
      y: point.y - offsetY
    }
  }) as PathPoint[]
}

function getCustomGeometryPoints(shape: ShapeElement): PathPoint[] {
  if (shape.shapeType === 'path') {
    const pathShape = shape as PathShape
    if (pathShape.points && pathShape.points.length > 0) {
      return pathShape.points
    }
    if (pathShape.d) {
      return parsePathToPoints(pathShape.d)
    }
    return []
  }

  if (shape.shapeType === 'polygon' || shape.shapeType === 'polyline') {
    return pointsStringToPathPoints(shape as PolygonShape | PolylineShape)
  }

  return []
}

/**
 * Convert fill to pptxgenjs format
 */
export function convertFill(fill: Fill): PptxGenJS.ShapeFillProps {
  if (fill.type === 'none') {
    return { type: 'none' }
  }

  if (fill.type === 'solid') {
    const solid = fill as SolidFill
    const { color, transparency } = hexToPptxColorWithAlpha(solid.color)
    return {
      type: 'solid',
      color,
      transparency: transparency ?? opacityToTransparency(solid.opacity) ?? 0
    }
  }

  if (fill.type === 'gradient') {
    const gradientFill = fill as GradientFill
    const gradient = gradientFill.gradient as Gradient

    // Phase 0.2B: SVG `spreadMethod` other than `pad` is not natively
    // supported by pptxgenjs. We fall back to `pad` (the SVG default)
    // and warn once per session so callers know the resulting render
    // won't tile / mirror as it does in browsers.
    if (gradient.spreadMethod && gradient.spreadMethod !== 'pad') {
      warnSpreadMethodFallback(gradient.spreadMethod)
    }

    const stops = gradient.stops.map(stop => {
      const { color, transparency } = hexToPptxColorWithAlpha(stop.color)
      return {
        position: normalizeGradientStopPosition(stop.offset),
        color,
        transparency: combineTransparency(transparency, stop.opacity)
      }
    })

    if (gradient.type === 'radial') {
      // pptxgenjs has no `radialGradient` shape-fill type. We fall
      // back to a solid colour. The **first** stop is the centre
      // colour in SVG; using it gives a more natural approximation
      // than the edge colour (which is usually the darker stop and
      // collapses the whole fill to a near-black square).
      if (typeof console !== 'undefined') {
        console.warn('[svg-pptx] radial gradient collapsed to solid fill (centre stop); pptxgenjs has no native radial support.')
      }
      const fallbackStop = gradient.stops[0] ?? gradient.stops[gradient.stops.length - 1]
      const { color, transparency } = hexToPptxColorWithAlpha(fallbackStop.color)
      return {
        type: 'solid',
        color,
        transparency: combineTransparency(
          combineTransparency(transparency, fallbackStop.opacity),
          gradientFill.opacity
        ) ?? 0
      }
    }

    const angle = resolveLinearGradientAngle(gradient as LinearGradient)

    return {
      type: 'linearGradient',
      stops,
      angle,
      scaled: false,
      rotWithShape: true
    }
  }

  return { type: 'none' }
}

/**
 * Convert stroke to pptxgenjs format
 */
export function convertStrokeDef(stroke?: Stroke, extraOpacity?: number): PptxGenJS.ShapeLineProps | undefined {
  if (!stroke) return undefined

  if (stroke.type === 'gradient' && stroke.gradient) {
    if (stroke.gradient.type === 'linear') {
      return {
        type: 'linearGradient',
        width: pxToPt(stroke.width),
        dashType: dashArrayToDashType(stroke.dashArray),
        angle: resolveLinearGradientAngle(stroke.gradient),
        scaled: false,
        rotWithShape: true,
        stops: stroke.gradient.stops.map(stop => {
          const { color, transparency } = hexToPptxColorWithAlpha(stop.color)
          return {
            position: normalizeGradientStopPosition(stop.offset),
            color,
            transparency: combineTransparency(
              combineTransparency(
                combineTransparency(transparency, stop.opacity),
                stroke.opacity
              ),
              extraOpacity
            )
          }
        })
      }
    }

    const fallbackStop = stroke.gradient.stops[stroke.gradient.stops.length - 1] ?? stroke.gradient.stops[0]
    if (fallbackStop) {
      const { color, transparency } = hexToPptxColorWithAlpha(fallbackStop.color)
      return {
        type: 'solid',
        color,
        width: pxToPt(stroke.width),
        transparency: combineTransparency(
          combineTransparency(
            combineTransparency(transparency, fallbackStop.opacity),
            stroke.opacity
          ),
          extraOpacity
        ),
        dashType: dashArrayToDashType(stroke.dashArray)
      }
    }
    return undefined
  }

  // Solid stroke
  const { color, transparency } = hexToPptxColorWithAlpha(stroke.color || '#000000')

  return {
    type: 'solid',
    color,
    width: pxToPt(stroke.width),
    transparency: combineTransparency(
      combineTransparency(transparency, stroke.opacity),
      extraOpacity
    ),
    dashType: dashArrayToDashType(stroke.dashArray)
  }
}

/**
 * Convert effect to pptxgenjs shadow format
 */
export function convertEffect(effect?: VisualEffect): PptxGenJS.ShadowProps | undefined {
  if (!effect) return undefined

  if (effect.type === 'shadow') {
    const shadow = effect
    const { color } = hexToPptxColorWithAlpha(shadow.color)
    const rad = Math.atan2(shadow.offsetY, shadow.offsetX)
    const angleDeg = shadow.offsetX === 0 && shadow.offsetY === 0 ? 90 : rad * (180 / Math.PI)
    return {
      type: 'outer',
      color,
      blur: pxToPt(shadow.blur),
      offset: pxToPt(Math.sqrt(shadow.offsetX ** 2 + shadow.offsetY ** 2)),
      angle: angleDeg,
      opacity: shadow.opacity ?? 0.5
    }
  }

  if (effect.type === 'dropShadow') {
    const presets: Record<'subtle' | 'moderate' | 'intense', { blur: number; offset: number; opacity: number }> = {
      subtle: { blur: 4, offset: 2, opacity: 0.3 },
      moderate: { blur: 8, offset: 4, opacity: 0.4 },
      intense: { blur: 16, offset: 8, opacity: 0.5 }
    }
    const preset = presets[effect.preset]
    return {
      type: 'outer',
      color: '000000',
      blur: preset.blur,
      offset: preset.offset,
      opacity: preset.opacity
    }
  }

  if (effect.type === 'glow') {
    // PPTX shape `<a:outerGlow>` isn't surfaced by pptxgenjs; the
    // best approximation is a centred (0-offset) outer shadow with
    // the glow colour and a wider blur radius. This produces a
    // visible halo behind the shape — close to what an SVG
    // `feGaussianBlur(SourceAlpha) + feFlood + feComposite` chain
    // delivers, but solid instead of a colour-tinted alpha mask.
    const { color } = hexToPptxColorWithAlpha(effect.color)
    return {
      type: 'outer',
      color,
      blur: pxToPt(Math.max(effect.radius, 1)),
      offset: 0,
      angle: 0,
      opacity: effect.opacity ?? 0.5
    }
  }

  // `effect.type === 'blur'` has no native PPTX shape equivalent
  // (no `<a:blur>` on `<p:sp>`); the call site (convertShape) is
  // responsible for translating it into a coloured outer shadow
  // tinted with the host fill. We return `undefined` here so the
  // shape doesn't double-render the shadow as pure black.

  // `effect.type === 'colorMatrix'` (without an enclosing shadow)
  // has no native PPTX shape equivalent; the colour shift is
  // applied to the source fill at the call site when possible.
  // Fall through and accept the loss.

  return undefined
}

/**
 * Convert transform to pptxgenjs rotation
 */
export function convertTransform(transform?: Transform): number | undefined {
  if (!transform) return undefined
  return transform.rotate ?? transform.rotateZ
}

/**
 * Map SIF shape type to pptxgenjs shape name
 */
function getShapeName(shapeType: string): PptxGenJS.SHAPE_NAME {
  // Use string literals directly as pptxgenjs ShapeType values
  const mapping: Record<string, string> = {
    rect: 'rect',
    circle: 'ellipse',
    ellipse: 'ellipse',
    path: 'custGeom',
    line: 'line',
    polygon: 'custGeom',
    polyline: 'custGeom'
  }
  return (mapping[shapeType] || 'rect') as PptxGenJS.SHAPE_NAME
}

/**
 * Build the structured `PathPoint[]` for a rounded rectangle in
 * the shape's local coordinate space (origin = top-left corner of
 * the rect's bounding box).
 *
 * The four corners are quarter-ellipse arcs with the SVG-clamped
 * rx/ry. PowerPoint's `roundRect` shape only supports a uniform
 * `rectRadius` (it cannot represent `rx ≠ ry` elliptical corners),
 * so the caller's convert path falls back to `custGeom` whenever
 * rx and ry differ.
 *
 * Path layout:
 *
 *     (rx,0)──H──(w-rx,0)
 *     ╱                  ╲
 *   A                  A
 *   │                  │
 *   A                  A
 *     ╲                  ╱
 *     (0,h)──H──(w-rx,h)
 *
 * Each `A` is a quarter-ellipse arc.
 */
function buildRoundedRectPathPoints(
  width: number,
  height: number,
  rx: number,
  ry: number
): PathPoint[] {
  // SVG clamps rx ≤ width/2 and ry ≤ height/2 (the arcs would
  // otherwise be impossible — they'd need to overlap). Mirror that
  // here so the rendered rect never overshoots its bbox.
  const halfW = width / 2
  const halfH = height / 2
  const clampedRx = Math.max(0, Math.min(rx, halfW))
  const clampedRy = Math.max(0, Math.min(ry, halfH))

  // Degenerate: no rounding. Fall back to a closed line polygon
  // (4 points + Z) which is what a plain rect would render to.
  if (clampedRx === 0 && clampedRy === 0) {
    return [
      { x: 0, y: 0, type: 'M', moveTo: true },
      { x: width, y: 0, type: 'L' },
      { x: width, y: height, type: 'L' },
      { x: 0, y: height, type: 'L' },
      { close: true, type: 'Z' }
    ]
  }

  return [
    // Top edge: start at (rx, 0) — the start of the top-right arc.
    { x: clampedRx, y: 0, type: 'M', moveTo: true },
    { x: width - clampedRx, y: 0, type: 'L' },
    // Top-right corner: quarter arc to (w, ry). sweep=1, largeArc=0
    // (we want the short, clockwise sweep from top edge → right edge).
    {
      x: width,
      y: clampedRy,
      type: 'A',
      curve: { type: 'arc', rX: clampedRx, rY: clampedRy, rotation: 0, largeArc: false, sweep: true }
    },
    { x: width, y: height - clampedRy, type: 'L' },
    {
      x: width - clampedRx,
      y: height,
      type: 'A',
      curve: { type: 'arc', rX: clampedRx, rY: clampedRy, rotation: 0, largeArc: false, sweep: true }
    },
    { x: clampedRx, y: height, type: 'L' },
    {
      x: 0,
      y: height - clampedRy,
      type: 'A',
      curve: { type: 'arc', rX: clampedRx, rY: clampedRy, rotation: 0, largeArc: false, sweep: true }
    },
    { x: 0, y: clampedRy, type: 'L' },
    {
      x: clampedRx,
      y: 0,
      type: 'A',
      curve: { type: 'arc', rX: clampedRx, rY: clampedRy, rotation: 0, largeArc: false, sweep: true }
    },
    { close: true, type: 'Z' }
  ]
}

/**
 * Convert shape element to pptxgenjs shape.
 *
 * The optional `resources` map supplies clipPath / mask / pattern
 * defs that the SVG `<defs>` declared; the shape may reference
 * them by id via `clipPathId` / `maskId` / `patternFillId`.
 */
export function convertShape(
  shape: ShapeElement,
  hyperlink?: PptxGenJS.HyperlinkProps,
  resources?: SlideResources
): ConvertedShape {
  const shapeType = shape.shapeType as string
  const translateX = shape.transform?.translateX ?? 0
  const translateY = shape.transform?.translateY ?? 0
  const scaleX = shape.transform?.scaleX ?? 1
  const scaleY = shape.transform?.scaleY ?? 1

  const options: PptxGenJS.ShapeProps = {
    x: pxToInch(shape.x + translateX),
    y: pxToInch(shape.y + translateY),
    w: pxToInch(shape.width * scaleX),
    h: pxToInch(shape.height * scaleY),
    // pptxgenjs's `genXmlColorSelection` treats `type: 'none'` as
    // "no colour selection" and emits an empty string, which makes
    // PowerPoint fall back to a solid default fill. We want the
    // *absence* of fill to be explicit, so pass `undefined` when
    // the SIF fill is `none` — pptxgenjs then emits `<a:noFill/>`.
    fill: shape.fill.type === 'none' ? undefined : convertFill(shape.fill),
    line: convertStrokeDef(shape.stroke, shape.opacity)
  }

  // Phase 0.2A: apply clipPath / mask to the shape's bounding box
  // before we set the final x/y/w/h. We intersect with the clip
  // region (rect-only for now) and fold the mask opacity into the
  // element transparency.
  applyClipPathAndMask(shape, options, resources)

  // Handle rotation
  const rotation = convertTransform(shape.transform) ?? shape.rotation
  if (rotation !== undefined) {
    options.rotate = rotation
  }

  // Handle opacity - SIF opacity (0-1) affects the entire element's transparency
  // PPTX uses transparency (0-100) where 100 = fully transparent
  // Since we can't directly set element-level transparency in pptxgenjs shapes,
  // we apply it to fill and line with proper combination
  // Note: We create new objects instead of mutating (immutability principle)
  if (shape.opacity !== undefined && shape.opacity < 1) {
    const elementTransparency = opacityToTransparency(shape.opacity)
    if (elementTransparency !== undefined && elementTransparency > 0) {
      // Apply transparency to fill (create new object instead of mutating)
      if (options.fill && options.fill.type === 'solid') {
        const fill = options.fill as PptxGenJS.SolidShapeFillProps
        const fillTransparency = fill.transparency ?? 0
        const combinedTransparency = 1 - (1 - elementTransparency / 100) * (1 - fillTransparency / 100)
        options.fill = {
          ...fill,
          transparency: Math.min(100, Math.round(combinedTransparency * 100))
        }
      }
    }
  }

  // Add shadow if present
  if (shape.effect) {
    // Phase 5.1: a pure `blur` effect has no native PPTX shape
    // equivalent. The closest visual cue is a centred outer
    // shadow tinted with the host fill colour — the shape stays
    // sharp, but the soft halo behind it signals "fuzzy edge".
    // We build the shadow here (with fill access) instead of in
    // `convertEffect` because that helper doesn't see the source.

    // For a single gradient stop we get a reasonable tint; for
    // multi-stop gradients or patterns we'd want a more elaborate
    // approximation, but `resolveEffectFillColor` is a safe
    // conservative fallback.
    if (shape.effect.type === 'blur') {
      // Resolve a representative fill colour for the soft halo. Solid
      // fills pass through; gradients/patterns fall back to the first
      // stop's colour (the existing `convertFill` logic also reduces
      // gradients to the leading stop when shadow colour isn't
      // representable, so this is a consistent approximation).
      const blurColor = resolveEffectFillColor(shape.fill)
      if (blurColor) {
        const { color } = hexToPptxColorWithAlpha(blurColor)
        options.shadow = {
          type: 'outer',
          color,
          blur: pxToPt(Math.max(shape.effect.radius, 1)),
          offset: 0,
          angle: 0,
          opacity: 0.4
        }
      }
    } else {
      options.shadow = convertEffect(shape.effect)
    }

    // Phase 0.2A: feColorMatrix saturate=0 (greyscale) and
    // hueRotate=θ are common filters that pptxgenjs cannot
    // represent. For solid fills we approximate by transforming
    // the fill colour directly: desaturate to luma, or rotate the
    // hue in HSL space. For gradients/patterns the colour shift
    // would need to be applied per-stop, which the fallback does
    // not do (the shape's outermost stop is used as-is).
    if (shape.effect.type === 'colorMatrix' && options.fill && options.fill.type === 'solid') {
      const fill = options.fill as PptxGenJS.SolidShapeFillProps
      if (!fill.color) {
        // No colour to transform; fall through.
      } else if (shape.effect.matrixType === 'saturate') {
        const value = shape.effect.value ?? 1
        if (value === 0) {
          options.fill = { ...fill, color: desaturateHexColor(fill.color) }
        }
      } else if (shape.effect.matrixType === 'hueRotate') {
        const value = shape.effect.value ?? 0
        if (value !== 0) {
          options.fill = { ...fill, color: rotateHueHexColor(fill.color, value) }
        }
      }
    }

    // Phase 5.1: a shadow filter that *also* carries a colour matrix
    // (e.g. shadowHue) needs the matrix applied to the source fill
    // so the rendered shape colour matches what the SVG would
    // produce. The shadow itself still renders as a normal
    // outerShdw underneath; PPTX has no way to tint a shadow.
    if (
      shape.effect.type === 'shadow' &&
      shape.effect.applyColorMatrixToFill &&
      options.fill &&
      options.fill.type === 'solid'
    ) {
      const fill = options.fill as PptxGenJS.SolidShapeFillProps
      const matrix = shape.effect.applyColorMatrixToFill
      if (fill.color) {
        if (matrix.matrixType === 'saturate') {
          const value = matrix.value ?? 1
          if (value === 0) {
            options.fill = { ...fill, color: desaturateHexColor(fill.color) }
          }
        } else if (matrix.matrixType === 'hueRotate') {
          const value = matrix.value ?? 0
          if (value !== 0) {
            options.fill = { ...fill, color: rotateHueHexColor(fill.color, value) }
          }
        }
      }
    }
  }

  if (hyperlink) {
    options.hyperlink = hyperlink
  }

  // Get shape name and handle special cases
  let shapeName = getShapeName(shapeType)
  switch (shapeType) {
    case 'rect': {
      const rect = shape as any
      const rx = rect.rx as number | undefined
      const ry = rect.ry as number | undefined
      if (rx || ry) {
        // pptxgenjs's `roundRect` shape takes a *single* `rectRadius`
        // and applies it symmetrically to all four corners — it
        // cannot represent an SVG `<rect>` whose `rx !== ry` (an
        // "elliptical corner" like rx=40 ry=10). For the equal case
        // we use the roundRect shape; for the elliptical case we
        // build a custGeom path with proper quarter-ellipse arcs so
        // the corners don't collapse to a uniform semicircle.
        if (rx !== undefined && ry !== undefined && Math.abs(rx - ry) > 1e-3) {
          const points = buildRoundedRectPathPoints(
            rect.width,
            rect.height,
            rx,
            ry
          )
          options.points = convertPathPointsForPptx(points) as any
          shapeName = 'custGeom' as any
        } else {
          // rectRadius in pptxgenjs is the absolute corner radius in inches
          // rx/ry in SVG are in pixels, so convert using pxToInch
          options.rectRadius = pxToInch((rx ?? ry) as number)
          // Must use 'roundRect' shape when rx/ry is present for rectRadius to work
          shapeName = 'roundRect'
        }
      }
      break
    }
    case 'line': {
      const line = shape as any
      const x1 = (line.x1 + translateX) * scaleX
      const y1 = (line.y1 + translateY) * scaleY
      const x2 = (line.x2 + translateX) * scaleX
      const y2 = (line.y2 + translateY) * scaleY

      const minX = Math.min(x1, x2)
      const minY = Math.min(y1, y2)
      options.x = pxToInch(minX)
      options.y = pxToInch(minY)
      options.w = pxToInch(Math.abs(x2 - x1) || 1)
      options.h = pxToInch(Math.abs(y2 - y1) || 1)
      options.fill = { type: 'none' }
      options.points = convertPathPointsForPptx([
        { x: x1 - minX, y: y1 - minY, type: 'M', moveTo: true } as any,
        { x: x2 - minX, y: y2 - minY, type: 'L' } as any
      ]) as any
      shapeName = 'custGeom' as any
      break
    }
    case 'path': {
      const localPoints = normalizePathPointsToLocal(getCustomGeometryPoints(shape), shape.x, shape.y)
      if (localPoints.length > 0) {
        shapeName = 'custGeom' as any
        options.points = convertPathPointsForPptx(localPoints) as any
      }
      break
    }
    case 'polygon':
    case 'polyline': {
      const localPoints = normalizePathPointsToLocal(getCustomGeometryPoints(shape), shape.x, shape.y)
      if (localPoints.length > 0) {
        shapeName = 'custGeom' as any
        options.points = convertPathPointsForPptx(localPoints) as any
      }
      break
    }
  }

  return {
    shapeName,
    options
  }
}

/**
 * Check if a shape type is supported
 */
export function isShapeSupported(shapeType: ShapeType): boolean {
  const supported = ['rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline']
  return supported.includes(shapeType)
}

/**
 * Apply a `<clipPath>` and `<mask>` to a shape's bounding box. For
 * the Phase 0.2A landing we only support rect-only clipPath defs
 * and rect-only mask defs; complex clipPath/mask defs are skipped
 * at conversion time and never reach this function.
 *
 * The clipPath rect is intersected with the shape's bounding box
 * (a simple crop). The mask's alpha is folded into the element's
 * transparency via the existing `combineTransparency` helper.
 */
function applyClipPathAndMask(
  shape: ShapeElement,
  options: PptxGenJS.ShapeProps,
  resources?: SlideResources
): void {
  if (!resources) return

  // clipPath → crop the shape to the clipPath rect.
  if (shape.clipPathId) {
    // Phase 1.3.1: prefer the absolute clip rect stamped at SIF
    // conversion time. The raw `clipPath` from the resources map
    // is in the element's local user space; if the element sits
    // inside a transformed group the intersection computed from
    // it is wrong (the shape's absolute bbox never overlaps the
    // raw local-space rect). The pre-resolved `clipPathRect` is
    // already in absolute screen space and just needs intersecting
    // with the shape's absolute bbox.
    const useResolved = Boolean(shape.clipPathRect)
    const clipPath = useResolved ? undefined : resources.clipPaths?.[shape.clipPathId]
    const effectiveRect = shape.clipPathRect
      ? shape.clipPathRect
      : clipPath && clipPath.type === 'rect'
        ? { x: clipPath.x, y: clipPath.y, width: clipPath.width, height: clipPath.height }
        : undefined

    if (effectiveRect) {
      // options are in inches; clipPath is in pixels. We work in
      // pixels throughout to avoid rounding drift on small shapes.
      const xIn = typeof options.x === 'number' ? options.x : 0
      const yIn = typeof options.y === 'number' ? options.y : 0
      const wIn = typeof options.w === 'number' ? options.w : 0
      const hIn = typeof options.h === 'number' ? options.h : 0
      const shapeLeft = xIn * 96
      const shapeTop = yIn * 96
      const shapeRight = shapeLeft + wIn * 96
      const shapeBottom = shapeTop + hIn * 96
      const clipLeft = effectiveRect.x
      const clipTop = effectiveRect.y
      const clipRight = effectiveRect.x + effectiveRect.width
      const clipBottom = effectiveRect.y + effectiveRect.height

      const interLeft = Math.max(shapeLeft, clipLeft)
      const interTop = Math.max(shapeTop, clipTop)
      const interRight = Math.min(shapeRight, clipRight)
      const interBottom = Math.min(shapeBottom, clipBottom)

      if (interRight > interLeft && interBottom > interTop) {
        options.x = pxToInch(interLeft)
        options.y = pxToInch(interTop)
        options.w = pxToInch(interRight - interLeft)
        options.h = pxToInch(interBottom - interTop)
      } else {
        // Outside the clip region — collapse to zero size so the
        // shape effectively disappears.
        options.w = 0
        options.h = 0
      }
    }
  }

  // mask → fold the mask's alpha (rect opacity × luminance) into
  // element transparency. SVG mask semantics is per-pixel
  // `luminance(color) * opacity`; for a single-rect mask we
  // approximate luminance as 1 for white, 0 for black, and use
  // `opacity` directly for anything in between. For gradient
  // masks (`<rect fill="url(#fade)"/>` with a linearGradient) we
  // replace the host shape's solid fill with a matching gradient
  // whose alpha follows each stop's BT.601 luminance.
  if (shape.maskId) {
    const mask = resources.masks?.[shape.maskId]
    if (mask && mask.type === 'rect') {
      if (mask.gradient && options.fill && options.fill.type === 'solid') {
        applyGradientMaskToFill(options, mask.gradient)
      } else {
        const color = mask.color.toLowerCase()
        const luminance = color === '#000000' || color === 'black'
          ? 0
          : color === '#ffffff' || color === 'white'
            ? 1
            : 0.5
        const maskAlpha = luminance * mask.opacity
        if (maskAlpha < 1 && options.fill && options.fill.type === 'solid') {
          const fill = options.fill as PptxGenJS.SolidShapeFillProps
          const existingTransparency = (fill.transparency ?? 0) / 100
          const maskTransparency = 1 - maskAlpha
          const combined = 1 - (1 - existingTransparency) * (1 - maskTransparency)
          options.fill = {
            ...fill,
            transparency: Math.min(100, Math.round(combined * 100))
          }
        }
      }
    }
  }
}

/**
 * Replace a solid shape fill with a gradient whose stops carry the
 * original colour but alpha modulated by the mask's BT.601
 * luminance at that stop. Used for SVG `<rect fill="url(#fade)"/>`
 * masks — the resulting shape fades from solid colour at the
 * gradient start to fully transparent at the end.
 *
 * PPTX shape fills can only be linear gradients (not radial), so
 * for `<radialGradient>` masks we fall back to a linear
 * approximation along the gradient angle. Real radial vignettes
 * (centered fade-outs) need a future `<a:gradFill>` with radial
 * geometry.
 */
function applyGradientMaskToFill(
  options: PptxGenJS.ShapeProps,
  maskGradient: NonNullable<MaskResource['gradient']>
): void {
  const fill = options.fill as PptxGenJS.SolidShapeFillProps
  if (!fill.color) return
  const { color: baseColor } = hexToPptxColorWithAlpha(fill.color)
  const baseTransparency = fill.transparency ?? 0

  // BT.601 luminance: 0..1.
  const luminance = (hex: string): number => {
    const cleaned = hex.replace(/^#/, '').toLowerCase()
    if (cleaned.length !== 6) return 1
    const r = parseInt(cleaned.slice(0, 2), 16) / 255
    const g = parseInt(cleaned.slice(2, 4), 16) / 255
    const b = parseInt(cleaned.slice(4, 6), 16) / 255
    return 0.299 * r + 0.587 * g + 0.114 * b
  }

  const stops: PptxGenJS.GradientStop[] = maskGradient.stops.map(stop => {
    const lum = luminance(stop.color) * (stop.opacity ?? 1)
    const maskTransparency = 1 - lum
    const combined = 1 - (1 - baseTransparency / 100) * (1 - maskTransparency)
    return {
      position: Math.max(0, Math.min(100, Math.round(stop.offset * 100))),
      color: baseColor,
      transparency: Math.max(0, Math.min(100, Math.round(combined * 100)))
    }
  })

  const gradientFill: PptxGenJS.LinearGradientShapeFillProps = {
    type: 'linearGradient',
    stops,
    angle: maskGradient.angle,
    rotWithShape: true,
    scaled: false
  }
  options.fill = gradientFill
}

/**
 * Get unsupported shape types
 */
export function getUnsupportedShapeTypes(shapes: ShapeElement[]): ShapeType[] {
  return shapes
    .map(s => s.shapeType)
    .filter((type): type is ShapeType => !isShapeSupported(type))
}

/**
 * Pull a representative hex colour out of a SIF fill so the blur
 * workaround can paint a halo. For solid fills we get the literal
 * colour; for gradients we return the first stop's colour (the
 * leading stop is what `convertFill` reduces to anyway when a
 * shape's gradient can't be represented as a PPTX fill). For
 * `none` / `pattern` fills we return `undefined` and the caller
 * skips the halo — those cases have no obvious single-colour
 * approximation.
 */
function resolveEffectFillColor(fill: ShapeElement['fill']): string | undefined {
  if (fill.type === 'solid') {
    return fill.color
  }
  if (fill.type === 'gradient') {
    const firstStop = fill.gradient.stops[0]
    if (firstStop) {
      return firstStop.color
    }
  }
  return undefined
}
