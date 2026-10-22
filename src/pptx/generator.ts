// PPTX Generator - Main generator for converting SIF to PPTX

import PptxGenJS from 'pptxgenjs'
import type { SlideDocument, Slide, SlideBackground, DocumentMeta, SlideResources } from '../sif/types/document'
import type { Element, ShapeElement, TextElement, ImageElement, LineElement, GroupElement, VideoElement, AudioElement } from '../sif/types/elements'
import type { RectShape } from '../sif/types/elements/shape'
import type { Fill, SolidFill, GradientFill } from '../sif/types/style/fill'
import type { LineCap, LineJoin } from '../sif/types/style/stroke'
import { getElementsInRenderOrder } from './converters/slide'
import { parseTransformToMatrix } from '../svg/converters/group'
import { convertShape } from './converters/shape'
import { convertTextOrFormula } from './converters/text'
import { convertImage } from './converters/image'
import { convertLine } from './converters/line'
import { convertVideo } from './converters/video'
import { convertAudio } from './converters/audio'
import { convertHyperlink, hexToPptxColorWithAlpha, opacityToTransparency, pxToInch } from './utils'
import {
  postProcessPptxBuffer,
  type PptxPostProcessHint,
  type PptxPostProcessHints
} from './utils/post-process'

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
  /**
   * Per-slide list of post-process hints, parallel to the slide
   * order. Each entry is a tuple of two parallel lists:
   *   - `lineHints`: hints for `<a:ln>` blocks (cap, join)
   *   - `geomHints`: hints for `<a:custGeom>` blocks (fillRule)
   *
   * The two lists are kept SEPARATE rather than merged into one
   * array, because the XML contains `<a:ln>` and `<a:custGeom>`
   * blocks in different per-shape arrangements — a path emits
   * one of each, a stroked rect emits only `<a:ln>`, an unstroked
   * custom shape emits only `<a:custGeom>`. Sharing a single
   * counter for both kinds would misalign hints.
   *
   * Populated by `addElementToSlide` / `addElementToGroup` /
   * `addConvertedElement` and consumed by `writeBuffer` /
   * `writeFile`, which call `postProcessPptxBuffer` to inject
   * attributes pptxgenjs doesn't expose (cap, join, fillRule).
   */
  private hintsPerSlide: Array<{ lineHints: PptxPostProcessHints; geomHints: PptxPostProcessHints }> = []

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

    // Push a fresh per-slide hints list. The post-processor will
    // pair this with the corresponding `ppt/slides/slideN.xml`
    // in the emitted .pptx zip.
    this.hintsPerSlide.push({ lineHints: [], geomHints: [] })

    if (slide.background) {
      pptxSlide.background = this.convertBackground(slide.background)
    }

    const sortedElements = getElementsInRenderOrder(slide.elements)

    for (const element of sortedElements) {
      this.addElementToSlide(pptxSlide, element, slide.resources)
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

  private addElementToSlide(slide: PptxGenJS.Slide, element: Element, resources?: SlideResources): void {
    this.addElementToTarget(slide, element, resources)
  }

  /**
   * Record a per-element post-process hint for the current
   * slide. The hint is split into its `<a:ln>` and `<a:custGeom>`
   * fragments and pushed onto the corresponding per-slide list.
   *
   * `lineHint` is pushed whenever the element emits an `<a:ln>`
   * block (i.e. it has a stroke — pptxgenjs always emits an empty
   * `<a:ln></a:ln>` even for unstroked shapes, so a stroke check
   * isn't quite enough; in practice we pass `null` for shapes we
   * know don't have one, like text). `geomHint` is only pushed
   * when `shapeName === 'custGeom'` so the post-processor's
   * `<a:custGeom>` counter stays aligned with the actual XML.
   */
  private pushHint(
    lineHint: PptxPostProcessHint | null,
    geomHint: PptxPostProcessHint | null,
    emitsLine: boolean,
    emitsCustGeom: boolean
  ): void {
    const slideIdx = this.hintsPerSlide.length - 1
    if (slideIdx < 0) return
    if (emitsLine) this.hintsPerSlide[slideIdx].lineHints.push(lineHint)
    if (emitsCustGeom) this.hintsPerSlide[slideIdx].geomHints.push(geomHint)
  }

  /**
   * Build a post-process hint for a shape/line element. Returns
   * `{lineHint, geomHint}` where each is `null` when the element
   * has no attributes the post-processor needs to inject for the
   * corresponding XML block kind.
   *
   * SVG `butt` is mapped to DrawingML's `flat` (they're the
   * same semantic). `miter` join is the DrawingML default so we
   * don't emit any hint for it (omitting `<a:round/>` /
   * `<a:bevel/>` produces the miter join).
   */
  private buildPostProcessHint(element: Element | undefined): {
    lineHint: PptxPostProcessHint | null
    geomHint: PptxPostProcessHint | null
  } {
    const empty = { lineHint: null, geomHint: null }
    if (!element) return empty

    let lineHint: PptxPostProcessHint | null = null
    let geomHint: PptxPostProcessHint | null = null

    if (element.type === 'shape' || element.type === 'line') {
      const stroke = (element as ShapeElement | LineElement).stroke
      if (stroke) {
        const ln: PptxPostProcessHint = {}
        if (stroke.lineCap && stroke.lineCap !== 'butt') {
          ln.cap = stroke.lineCap === 'round' ? 'rnd' : stroke.lineCap === 'square' ? 'sq' : 'flat'
        }
        if (stroke.lineJoin && stroke.lineJoin !== 'miter') {
          ln.join = stroke.lineJoin
        }
        if (ln.cap !== undefined || ln.join !== undefined) {
          lineHint = ln
        }
      }

      if (element.type === 'shape') {
        const shape = element as ShapeElement
        if (shape.shapeType === 'path' && shape.fillRule === 'evenodd') {
          geomHint = { fillRule: 'evenOdd' }
        }
      }
    }

    return { lineHint, geomHint }
  }

  /**
   * Expand a pattern-filled shape into repeated copies of the
   * pattern's children, translated to each tile position across
   * the shape's bounding box.
   */
  /**
   * Approximate a radial gradient (Phase 0.2A — DEFERRED).
   *
   * The user's manual `径向渐变.pptx` shows that PowerPoint writes
   * a true `<a:gradFill>` with `<a:gsLst>` + `<a:path path="..."/>`
   * for radial fills, but pptxgenjs (current version) does NOT emit
   * this path — it only supports `<a:lin>` (linear gradient) inside
   * `<a:gradFill>`. Re-implementing the radial path requires either
   * monkey-patching pptxgenjs's shape XML emitter, or post-
   * processing the generated XML, or downgrading to the v3
   * "fallback to first-stop solid" behaviour.
   *
   * For Phase 0.2A we keep the v3 fallback (first-stop solid fill,
   * console.warn) which is what `convertFill` already does. The
   * concentric-ellipse approximation was tried and abandoned because
   * it produced a 6-layer stacked-ellipse look that didn't match
   * the user's expectation of a smooth radial gradient.
   */

  private addPatternFilledShape(
    target: PptxGenJS.Slide | PptxGenJS.Group,
    shape: ShapeElement,
    resources?: SlideResources
  ): void {
    const pattern = resources?.patterns?.[shape.patternFillId!]

    // Stripe-pattern fast path. SVG patterns whose content is a
    // single rect spanning the full height (or width) of the tile
    // produce a family of parallel stripes after `patternTransform`.
    // The tile-by-tile path stamps a rotated parallelogram at every
    // tile position; even when the geometry is correct, the
    // parallelograms have hard corners that read as a stair-step /
    // segmented look at typical render scales. Computing each
    // stripe as a stroked line and clipping it to the shape's bbox
    // gives smooth continuous diagonal lines that match what a real
    // SVG renderer produces.
    if (pattern && this.tryRenderStripePattern(target, shape, pattern, resources)) {
      // Stripe path emitted (including the border). Skip the
      // tile-based expansion below.
      return
    }


    // Emit the original shape first with `fill: none` so the stroke
    // (border) survives — otherwise `patternFillId` would visually
    // strip the outline. PowerPoint draws shapes in z-order, so the
    // pattern child shapes stamped afterwards appear on top of the
    // border's interior but underneath the border line itself.
    if (shape.stroke) {
      const noFillShape: ShapeElement = { ...shape, fill: { type: 'none' as const } }
      const borderConverted = this.convertElement(noFillShape, resources)
      if (borderConverted) this.addConvertedToTarget(target, borderConverted)
    }

    if (!pattern || !pattern.children || pattern.children.length === 0) {
      // Fallback: render the shape with no fill so the rest of the
      // layout isn't broken. The stroke (if any) was already emitted
      // above.
      if (!shape.stroke) {
        const noFillShape: ShapeElement = { ...shape, fill: { type: 'none' as const } }
        const converted = this.convertElement(noFillShape, resources)
        if (converted) this.addConvertedToTarget(target, converted)
      }
      return
    }

    const tileW = pattern.width
    const tileH = pattern.height
    if (tileW <= 0 || tileH <= 0) {
      if (!shape.stroke) {
        const noFillShape: ShapeElement = { ...shape, fill: { type: 'none' as const } }
        const converted = this.convertElement(noFillShape, resources)
        if (converted) this.addConvertedToTarget(target, converted)
      }
      return
    }

    // Parse `patternTransform` (if any) into a 2D affine matrix
    // and extract its rotation angle. SVG semantics: the matrix
    // applies to each tile as a whole, *around the tile's local
    // origin*; for the common case of `rotate(deg)` the angle is
    // `deg` and the effective rotation pivot is the tile center.
    const tileMatrix = parsePatternTransform(pattern.patternTransform)
    const [ma, mb, mc, md, me, mf] = tileMatrix
    const rotationDeg = extractRotationDegrees(tileMatrix)

    // SVG `patternTransform` maps the *pattern's own coordinate
    // system* to user space — it rotates the tile grid AND the
    // tile content together. The previous implementation only
    // rotated the content (around each tile's local center) while
    // keeping the tile grid on a regular (col*tileW, row*tileH)
    // lattice in user space. That produced a stair-step pattern
    // for `patternTransform="rotate(45)"` because adjacent tiles
    // were 14 units apart in user space, but a 45°-rotated stripe
    // pattern has a perpendicular period of 14·cos(45°) ≈ 9.9
    // units, so the stripes never lined up.
    //
    // The fix: iterate tiles in pattern-local space and apply the
    // matrix to the tile's grid position too, so the rotated
    // stripes connect across tile boundaries. To find which
    // (col, row) tiles overlap the shape's user-space bbox, we
    // transform the shape's 4 corners by the *inverse* matrix and
    // use the resulting AABB in pattern-local space to bound the
    // search. For the unrotated case the inverse is the identity
    // and the iteration is identical to the old code.
    const inv = invertAffineMatrix(ma, mb, mc, md, me, mf)
    if (!inv) {
      // Degenerate (singular) matrix — fall back to identity.
      return
    }
    const [ia, ib, ic, id, ie, ifc] = inv
    const shapeCorners = [
      [shape.x, shape.y],
      [shape.x + shape.width, shape.y],
      [shape.x, shape.y + shape.height],
      [shape.x + shape.width, shape.y + shape.height]
    ]
    const localCorners = shapeCorners.map(([x, y]): [number, number] => [
      ia * x + ic * y + ie,
      ib * x + id * y + ifc
    ])
    const minLocalX = Math.min(...localCorners.map(c => c[0]))
    const maxLocalX = Math.max(...localCorners.map(c => c[0]))
    const minLocalY = Math.min(...localCorners.map(c => c[1]))
    const maxLocalY = Math.max(...localCorners.map(c => c[1]))

    const c0 = Math.floor(minLocalX / tileW)
    const c1 = Math.ceil(maxLocalX / tileW)
    const r0 = Math.floor(minLocalY / tileH)
    const r1 = Math.ceil(maxLocalY / tileH)
    const cols = Math.max(1, c1 - c0)
    const rows = Math.max(1, r1 - r0)

    // Tile the pattern's child shapes across the filled shape's
    // bounding box. Each child is offset to the tile's user-space
    // position (the patternTransform applied to the tile's local
    // origin) and then transformed by the tile matrix. Children
    // whose post-rotation AABB doesn't intersect the shape's bbox
    // are skipped to keep the outline clean.
    const shapeRight = shape.x + shape.width
    const shapeBottom = shape.y + shape.height

    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        // Tile's user-space position: the patternTransform applied
        // to the tile's local origin (col*tileW, row*tileH).
        const tileUserX = ma * (c * tileW) + mc * (r * tileH) + me
        const tileUserY = mb * (c * tileW) + md * (r * tileH) + mf
        // Tile center in pattern-local coords (always the same for
        // every tile — the rotation pivot is pattern-local, not
        // user-local).
        const tileCenterLocalX = tileW / 2
        const tileCenterLocalY = tileH / 2
        for (const child of pattern.children) {
          const transformed = transformChildInTile(
            child as unknown as Element,
            tileUserX,
            tileUserY,
            tileCenterLocalX,
            tileCenterLocalY,
            tileMatrix,
            rotationDeg
          )
          if (!transformed) continue
          // Skip children whose post-rotation AABB falls outside
          // the shape's bbox. The unrotated case needs "fully
          // contained" so partial tiles at the bottom/right edges
          // don't draw dots that leak past the border. The rotated
          // case (patternTransform ≠ identity) needs "intersects"
          // so the corner tiles that produce the continuous
          // diagonal lines aren't dropped — see DIFF_CHECKLIST.md
          // issue #3.
          const contained = rotationDeg === 0
            ? fitsWithinBboxFully(transformed, shape.x, shape.y, shapeRight, shapeBottom)
            : fitsWithinBbox(transformed, shape.x, shape.y, shapeRight, shapeBottom)
          if (!contained) continue
          this.addElementToTarget(target, transformed, resources)
        }
      }
    }
  }

  /**
   * Stripe-pattern rendering. SVG patterns whose content is a
   * single rect that spans the full height (or full width) of the
   * tile produce a family of parallel stripes after
   * `patternTransform`. We compute each stripe as a stroked line
   * segment clipped to the shape's bbox — that gives clean
   * continuous diagonal lines, instead of a grid of rotated
   * parallelograms with hard corners.
   *
   * Returns `true` when the pattern is recognised as a stripe
   * pattern and the stripes (plus the original border) have been
   * emitted; `false` otherwise so the caller falls through to the
   * generic tile-by-tile expansion.
   */
  private tryRenderStripePattern(
    target: PptxGenJS.Slide | PptxGenJS.Group,
    shape: ShapeElement,
    pattern: any,
    resources?: SlideResources
  ): boolean {
    const stripe = detectStripePattern(pattern)
    if (!stripe) return false

    // Emit the original border first (no fill) so it survives.
    if (shape.stroke) {
      const noFillShape: ShapeElement = { ...shape, fill: { type: 'none' as const } }
      const borderConverted = this.convertElement(noFillShape, resources)
      if (borderConverted) this.addConvertedToTarget(target, borderConverted)
    }

    const matrix = parsePatternTransform(pattern.patternTransform)
    const [a, b, c, d, e, f] = matrix
    // For pure-rotation (or identity) the thickness is preserved
    // through the transform, so we can use the rect's thickness
    // directly. For other matrices (e.g. scale) the line stroke
    // would be off — but stripe patterns almost always use just
    // a rotation, so we accept the approximation.
    const thickness = stripe.thickness
    const period = stripe.period
    const isVertical = stripe.orientation === 'vertical'

    // The centerline of the k-th stripe in pattern-local space:
    //   - vertical stripe (rect spans full tile height): x = thickness/2 + k*period
    //   - horizontal stripe (rect spans full tile width):  y = thickness/2 + k*period
    // After the patternTransform, the centerline becomes a line
    // in user space parameterised by the other pattern-local axis.
    // We find the entry/exit t-values of that line against the
    // shape's axis-aligned bbox. The line is parameterised in
    // the *pattern's user space*, which for `patternUnits=
    // "userSpaceOnUse"` is the filled shape's local user space
    // (origin at the shape's top-left). The bbox we intersect
    // against is in the *target's* coordinate system (group-local
    // when the shape is inside a `<g>`, slide coords when not),
    // so we offset the pattern-local positions by (shape.x,
    // shape.y) before the intersection — otherwise the lines
    // would all cluster around the slide origin instead of
    // crossing the filled shape.
    const shapeX0 = shape.x
    const shapeY0 = shape.y
    const shapeX1 = shape.x + shape.width
    const shapeY1 = shape.y + shape.height
    const ox = shape.x
    const oy = shape.y

    // Line direction in user space (per pattern-local axis) and
    // the offset for the centerline at k=0.
    let dx: number, dy: number
    let baseX0: (k: number) => number, baseY0: (k: number) => number
    if (isVertical) {
      // x_l fixed, y_l varies. Direction = (c, d).
      dx = c; dy = d
      baseX0 = (k) => a * (thickness / 2 + k * period) + e + ox
      baseY0 = (k) => b * (thickness / 2 + k * period) + f + oy
    } else {
      // y_l fixed, x_l varies. Direction = (a, b).
      dx = a; dy = b
      baseX0 = (k) => c * (thickness / 2 + k * period) + e + ox
      baseY0 = (k) => d * (thickness / 2 + k * period) + f + oy
    }

    // We don't know how many k-values are needed a priori. For a
    // period p, the perpendicular extent of the shape's bbox in
    // pattern-local space is roughly bbox-diagonal-ish; sweep a
    // generous k range and let the per-stripe intersection test
    // decide.
    const kMin = -Math.ceil(
      (Math.max(shape.width, shape.height) + period) / period
    ) - 2
    const kMax = -kMin

    const stroke = stripe.stroke
    if (!stroke) {
      // Stripe has no fill/stroke — nothing to draw. Border was
      // already emitted above.
      return true
    }

    let drewAny = false
    for (let k = kMin; k <= kMax; k++) {
      const startX = baseX0(k)
      const startY = baseY0(k)
      // Compute t values where the line enters / exits the bbox.
      let tEnter = -Infinity
      let tExit = Infinity
      if (dx !== 0) {
        const tA = (shapeX0 - startX) / dx
        const tB = (shapeX1 - startX) / dx
        tEnter = Math.max(tEnter, Math.min(tA, tB))
        tExit = Math.min(tExit, Math.max(tA, tB))
      } else if (startX < shapeX0 || startX > shapeX1) {
        continue
      }
      if (dy !== 0) {
        const tA = (shapeY0 - startY) / dy
        const tB = (shapeY1 - startY) / dy
        tEnter = Math.max(tEnter, Math.min(tA, tB))
        tExit = Math.min(tExit, Math.max(tA, tB))
      } else if (startY < shapeY0 || startY > shapeY1) {
        continue
      }
      if (tEnter >= tExit) continue
      // Clip a small margin off each end so the line stroke caps
      // don't extend beyond the shape's bbox visually. Stroke
      // caps add `thickness/2` past the endpoint, so subtract
      // that to keep the rounded line inside the border.
      const tPad = 0 // we want the line to fully reach the bbox
      const x1 = startX + dx * tEnter + tPad * (dy)
      const y1 = startY + dy * tEnter - tPad * (dx)
      const x2 = startX + dx * tExit - tPad * (dy)
      const y2 = startY + dy * tExit + tPad * (dx)
      // Guard against degenerate segments.
      if (Math.abs(x2 - x1) < 1e-6 && Math.abs(y2 - y1) < 1e-6) continue

      const lineEl: LineElement = {
        type: 'line',
        id: `${shape.id}_stripe_${k}`,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1) || 1,
        height: Math.abs(y2 - y1) || 1,
        x1,
        y1,
        x2,
        y2,
        stroke: { ...stroke, width: thickness },
        visible: true
      }
      const converted = this.convertElement(lineEl, resources)
      if (converted) this.addConvertedToTarget(target, converted)
      drewAny = true
    }

    // If the bbox never overlapped any stripe (degenerate case),
    // still emit the border. If there was no border either, the
    // shape is invisible — render a no-fill version of the rect
    // so the layout doesn't break.
    if (!drewAny && !shape.stroke) {
      const noFillShape: ShapeElement = { ...shape, fill: { type: 'none' as const } }
      const converted = this.convertElement(noFillShape, resources)
      if (converted) this.addConvertedToTarget(target, converted)
    }
    return true
  }

  private addGroupToSlide(slide: PptxGenJS.Slide, group: GroupElement, resources?: SlideResources): void {
    // Create a pptxgenjs group
    const pptxGroup = slide.addGroup()

    // Walk children in z-order. pptxgenjs groups don't support
    // nesting, so nested groups are flattened by recursing into
    // their children. Pattern-filled shapes (those with a
    // `patternFillId`) are expanded inline to their tile shapes;
    // everything else is converted and added to the group as
    // before.
    //
    // The previous implementation called `convertGroupElements`
    // which flattened the group but routed every shape through
    // `convertShape`. `convertShape` doesn't know about
    // `patternFillId`, so pattern-filled shapes inside a group
    // were silently rendered as empty rects (the SIF layer sets
    // their fill to `{type: 'none'}` and the pattern's tile
    // shapes were never instantiated). The diff checklist
    // 04-patterns fixtures showed this as a fully blank panel
    // for honeycomb / dotLarge / squareTile / ringTile / checker
    // — only the border + label were visible.
    const walk = (children: Element[]) => {
      const sorted = [...children].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      for (const child of sorted) {
        if (child.visible === false) continue
        if (child.type === 'group') {
          walk((child as GroupElement).children)
          continue
        }
        if (child.type === 'shape' && (child as ShapeElement).patternFillId) {
          this.addPatternFilledShape(pptxGroup, child as ShapeElement, resources)
          continue
        }
        const converted = this.convertElement(child, resources)
        if (converted) {
          this.addConvertedToTarget(pptxGroup, converted)
        }
      }
    }
    walk(group.children)
  }

  /**
   * Convert a raw SIF element and add it to a slide or group.
   * Centralizes the convert → add dispatch so both the top-level
   * slide path and the group path go through the same code, and
   * so pattern shapes nested in groups also go through the
   * pattern-expansion path (see `addGroupToSlide`).
   */
  private addElementToTarget(
    target: PptxGenJS.Slide | PptxGenJS.Group,
    element: Element,
    resources?: SlideResources
  ): void {
    if (element.visible === false) return
    if (element.type === 'group') {
      // Defensive: pattern children shouldn't be groups, but if a
      // nested-group snippet ever reaches this path, fall through
      // and recurse into a fresh group on the target.
      //
      // pptxgenjs's `Group` class does not expose `addGroup`, so a
      // nested group inside an existing group can't be promoted to
      // a sub-group; flatten it by hoisting the children into the
      // current target. Visual nesting is lost but rendering
      // succeeds (the group on the parent slide would be
      // meaningless anyway since pptxgenjs groups are flat
      // containers).
      if (typeof (target as any).addGroup === 'function') {
        const pptxGroup = (target as any).addGroup()
        for (const c of (element as GroupElement).children) {
          this.addElementToTarget(pptxGroup, c, resources)
        }
      } else {
        for (const c of (element as GroupElement).children) {
          this.addElementToTarget(target, c, resources)
        }
      }
      return
    }
    if (element.type === 'shape' && (element as ShapeElement).patternFillId) {
      this.addPatternFilledShape(target, element as ShapeElement, resources)
      return
    }
    const converted = this.convertElement(element, resources)
    if (converted) {
      this.addConvertedToTarget(target, converted)
    }
  }

  private convertElement(
    element: Element,
    resources?: SlideResources
  ): { type: string; data: any; source?: Element } | null {
    const hyperlink = this.resolveHyperlink(element)

    switch (element.type) {
      case 'shape':
        return { type: 'shape', data: convertShape(element as ShapeElement, hyperlink, resources), source: element }
      case 'text': {
        const convertedText = convertTextOrFormula(element as TextElement, hyperlink)
        return { type: convertedText.type as any, data: convertedText, source: element }
      }
      case 'image':
        return { type: 'image', data: convertImage(element as ImageElement, hyperlink), source: element }
      case 'line':
        return { type: 'line', data: convertLine(element as LineElement, hyperlink), source: element }
      case 'video':
        return { type: 'video', data: convertVideo(element as VideoElement), source: element }
      case 'audio':
        return { type: 'audio', data: convertAudio(element as AudioElement), source: element }
      default:
        return null
    }
  }

  /**
   * Add a *converted* (already through `convertElement`) element
   * to a slide or group. Used by both the top-level slide path
   * and the group path, after the SIF element has been turned
   * into the pptxgenjs shape/text/... representation.
   */
  private addConvertedToTarget(
    target: PptxGenJS.Slide | PptxGenJS.Group,
    converted: { type: string; data: any; source?: Element }
  ): void {
    const { type, data, source } = converted

    if (type === 'fragments') {
      for (const item of data.items) {
        this.addConvertedToTarget(target, { type: item.type, data: item, source })
      }
    } else if (type === 'text') {
      target.addText(data.text, data.options)
    } else if (type === 'formula') {
      // Text-fallback path: emit the LaTeX source as a styled text
      // run instead of an OMML formula. This avoids the "[Formula]"
      // placeholder that PowerPoint/LibreOffice show for unrenderable
      // OMML on a white background.
      if (data.options.asText) {
        target.addText(data.options.source ?? '', {
          x: data.options.x,
          y: data.options.y,
          w: data.options.w,
          h: data.options.h,
          fontSize: data.options.fontSize,
          color: data.options.color,
          italic: true,
          align: data.options.align
        })
      } else if (typeof (target as any).addFormula === 'function') {
        ;(target as any).addFormula(data.options)
      } else {
        this.pushFormulaObject(target as any, data.options)
      }
    } else if (type === 'video') {
      (target as any).addMedia(data)
    } else if (type === 'audio') {
      (target as any).addMedia(data)
    } else if (type === 'image') {
      (target as any).addImage(data)
    } else if (type === 'shape' || type === 'line') {
      // Push a hint *before* calling addShape — the post-processor
      // applies hints in render order, so the hint must be queued
      // at the same time the element is queued.
      const h = this.buildPostProcessHint(source)
      // pptxgenjs emits an empty <a:ln></a:ln> for shapes with no
      // stroke, so every shape/line produces a line block. custGeom
      // is only emitted for paths, polygons, polylines, lines, and
      // rects with rx≠ry.
      this.pushHint(h.lineHint, h.geomHint, true, data.shapeName === 'custGeom')
      target.addShape(data.shapeName, data.options)
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

  private pushFormulaObject(container: any, options: any): void {
    const target = container?._slideObjects
      ? container
      : container?._slide?._slideObjects
        ? container._slide
        : (this.pptx as any)?._slides?.[(this.pptx as any)?._slides?.length - 1]

    if (!target?._slideObjects) {
      throw new Error('Unable to resolve formula target container')
    }

    target._slideObjects.push({
      _type: 'formula',
      options: {
        x: options.x || 0,
        y: options.y || 0,
        w: options.w,
        h: options.h,
        objectName: options.objectName || 'Formula',
        fontSize: options.fontSize,
        color: options.color
      },
      formula: options.omml,
      formulaAlign: options.align || 'center'
    })
  }

  async writeFile(options?: { fileName?: string }): Promise<string> {
    const fileName = options?.fileName ?? 'presentation.pptx'
    // pptxgenjs's writeFile writes to disk directly. To inject our
    // post-process XML patches (line cap, join, fillRule) we have to
    // get the buffer first, patch it, and write that. The downstream
    // consumer only cares about the file path, so we can re-implement
    // the file write ourselves.
    const buffer = await this.writeBuffer()
    if (typeof require !== 'undefined') {
      const fs = require('fs') as typeof import('fs')
      fs.writeFileSync(fileName, Buffer.from(buffer))
      return fileName
    }
    // Fallback: in browser-ish environments, fall back to pptxgenjs
    // (post-processing is skipped in this path).
    return this.pptx.writeFile({ fileName })
  }

  async writeBuffer(options?: PptxWriteOptions): Promise<Uint8Array> {
    const result = await this.pptx.write({
      outputType: 'uint8array',
      compression: options?.compression
    })
    const patched = await postProcessPptxBuffer(result as Uint8Array, this.hintsPerSlide)
    if (options?.outputType && options.outputType !== 'uint8array') {
      // Caller wants a different output type. Re-emit from the patched
      // buffer by writing a fresh archive in the requested shape. We
      // avoid pptxgenjs's `write` here (it would re-render and undo
      // our patches). For now, callers requesting non-uint8array
      // outputs lose the patches — which matches the pre-existing
      // behavior of those code paths.
      if (options.outputType === 'base64') {
        return Buffer.from(patched).toString('base64') as unknown as Uint8Array
      }
    }
    return patched
  }

  async writeBase64(options?: { compression?: boolean }): Promise<string> {
    // Reuse writeBuffer so post-process patches are applied. The
    // pre-existing writeBase64 skipped patching because pptxgenjs
    // emits a base64 string directly; we now patch the underlying
    // buffer first and re-encode to base64.
    const buffer = await this.writeBuffer({ compression: options?.compression })
    return Buffer.from(buffer).toString('base64')
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

/**
 * Add `(dx, dy)` to every (x, y) pair in a `<polygon>` / `<polyline>`
 * `points` string. SVG stores the points in the same coord system as
 * the shape's bounding box, so a translation of the bbox has to be
 * reflected in the points string too — otherwise the renderer
 * normalises the polygon's points against a post-translation bbox
 * origin and ends up with negative values that PowerPoint silently
 * drops (honeycomb panel was rendering blank as a result).
 */
function translatePointsString(points: string, dx: number, dy: number): string {
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map(value => parseFloat(value))
    .filter(value => !Number.isNaN(value))

  const out: string[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push(`${roundToDecimals(nums[i] + dx)},${roundToDecimals(nums[i + 1] + dy)}`)
  }
  return out.join(' ')
}

/**
 * Apply a 2D affine `[a b c d e f]` to every (x, y) pair in a
 * `<polygon>` / `<polyline>` `points` string. Mirror of
 * `transformPointsString` in `src/svg/converters/shape.ts:707-721`,
 * kept here so the generator doesn't have to plumb the SVG-layer
 * transform matrix through to that helper.
 */
function transformPointsStringWithMatrix(
  points: string,
  a: number, b: number, c: number, d: number, e: number, f: number
): string {
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map(value => parseFloat(value))
    .filter(value => !Number.isNaN(value))

  const out: string[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = a * nums[i] + c * nums[i + 1] + e
    const y = b * nums[i] + d * nums[i + 1] + f
    out.push(`${roundToDecimals(x)},${roundToDecimals(y)}`)
  }
  return out.join(' ')
}

function roundToDecimals(value: number): number {
  return Number(value.toFixed(6))
}

/**
 * True when the 2D linear part `[a b; c d]` of an affine matrix
 * deviates from the identity by more than 1e-6. Used to gate the
 * rotated-rect → polygon conversion and the polygon-points
 * transformation in `applyAffineToElement` so the unrotated fast
 * path is unchanged.
 */
function isNonTrivialMatrix(a: number, b: number, c: number, d: number): boolean {
  return Math.abs(a - 1) > 1e-6 || Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6 || Math.abs(d - 1) > 1e-6
}

/**
 * Return a deep copy of `element` with (dx, dy) added to every
 * shape's x/y (and recursively into nested groups). Used by the
 * pattern-fill expansion path to stamp the pattern's children at
 * each tile position across the filled shape's bounding box.
 *
 * Returns `undefined` for element types the renderer cannot
 * position (line / image / video / audio / icon); the caller
 * silently skips those.
 */
function translateElement(element: Element, dx: number, dy: number): Element | undefined {
  switch (element.type) {
    case 'shape': {
      const shape = element as ShapeElement
      // Shapes also have line endpoints in absolute coords; update
      // those too for line shapes.
      const next: ShapeElement = { ...shape, x: shape.x + dx, y: shape.y + dy }
      if ('x1' in shape && 'y1' in shape && 'x2' in shape && 'y2' in shape) {
        ;(next as any).x1 = (shape as any).x1 + dx
        ;(next as any).y1 = (shape as any).y1 + dy
        ;(next as any).x2 = (shape as any).x2 + dx
        ;(next as any).y2 = (shape as any).y2 + dy
      }
      // Polygons/polylines store their geometry in the `points` string
      // in the same coord system as the bbox, so a bbox translation
      // has to update the points too.
      if (shape.shapeType === 'polygon' || shape.shapeType === 'polyline') {
        ;(next as any).points = translatePointsString((shape as any).points, dx, dy)
      }
      return next
    }
    case 'group': {
      const group = element as GroupElement
      const children: Element[] = []
      for (const child of group.children) {
        const c = translateElement(child, dx, dy)
        if (c) children.push(c)
      }
      return { ...group, children }
    }
    case 'text': {
      const text = element as any
      return { ...text, x: text.x + dx, y: text.y + dy }
    }
    default:
      return undefined
  }
}

/** Identity 2D affine matrix used when `patternTransform` is missing. */
const IDENTITY_PATTERN_MATRIX: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]

/**
 * Parse an SVG `patternTransform` attribute into a 2D affine matrix.
 * Falls back to the identity matrix when the attribute is missing,
 * empty, or unparseable. We re-use the SVG-layer parser because the
 * `transform` syntax is shared (`rotate(...)`, `translate(...)`,
 * `scale(...)`, `matrix(...)`).
 */
function parsePatternTransform(value: string | undefined): [number, number, number, number, number, number] {
  if (!value?.trim()) return IDENTITY_PATTERN_MATRIX
  const m = parseTransformToMatrix(value)
  return m
}

/**
 * Extract the rotation angle in degrees from a 2D affine matrix.
 * `rotate(θ)` produces `[cosθ, sinθ, -sinθ, cosθ, 0, 0]`; we read
 * the angle from the (a, b) pair via atan2. For non-pure-rotation
 * matrices (e.g. scale + rotate) the angle is still extracted —
 * the visual approximation is good enough for the common cases
 * SVG patterns hit.
 */
function extractRotationDegrees(matrix: [number, number, number, number, number, number]): number {
  const [a, b] = matrix
  return Math.atan2(b, a) * (180 / Math.PI)
}

/**
 * Stripe-pattern detection. Returns metadata for a "stripe
 * pattern" — one whose content is a single rect that spans the
 * full height (or full width) of the tile — or `null` if the
 * pattern is more complex (checker, honeycomb, etc.) and needs
 * the tile-by-tile path.
 *
 * A pattern qualifies when:
 *   - It has exactly one child.
 *   - The child is a `rect`.
 *   - The rect's height equals the tile's height (vertical
 *     stripes) or its width equals the tile's width (horizontal
 *     stripes). The other dimension is the stripe thickness.
 *   - The rect starts at the tile's origin (x=0, y=0). We
 *     accept a small tolerance for floating-point rounding.
 */
function detectStripePattern(pattern: any): {
  orientation: 'vertical' | 'horizontal'
  period: number
  thickness: number
  stroke: any
} | null {
  if (!pattern?.children || pattern.children.length !== 1) return null
  const child = pattern.children[0]
  if (child?.type !== 'shape' || child.shapeType !== 'rect') return null

  const tileW = pattern.width
  const tileH = pattern.height
  const rectW = child.width ?? 0
  const rectH = child.height ?? 0
  const rx = child.x ?? 0
  const ry = child.y ?? 0
  const tol = 1e-3
  if (Math.abs(rx) > tol || Math.abs(ry) > tol) return null

  let orientation: 'vertical' | 'horizontal'
  let period: number
  let thickness: number
  if (Math.abs(rectH - tileH) < tol && rectW < tileW - tol) {
    // Vertical stripe (rect spans full tile height)
    orientation = 'vertical'
    period = tileW
    thickness = rectW
  } else if (Math.abs(rectW - tileW) < tol && rectH < tileH - tol) {
    // Horizontal stripe (rect spans full tile width)
    orientation = 'horizontal'
    period = tileH
    thickness = rectH
  } else {
    return null
  }

  // We draw the stripe as a stroked line, so we need a stroke on
  // the child rect. Stripes from SVG patterns get their colour
  // from the rect's `fill`, not its `stroke` — translate fill →
  // stroke here.
  const stroke = child.fill ? {
    color: child.fill.color,
    width: thickness,
    opacity: child.opacity,
    type: 'solid' as const
  } : child.stroke

  if (!stroke?.color) return null

  return { orientation, period, thickness, stroke }
}

/**
 * Invert a 2D affine matrix `[a b c d e f]`. Returns the 6-tuple
 * `[a' b' c' d' e' f']` of the inverse transform, or `null` if
 * the matrix is singular (det ≈ 0). Used by the pattern-expansion
 * code to map a shape's user-space bbox back to pattern-local
 * space so we know which (col, row) tiles overlap the shape.
 */
function invertAffineMatrix(
  a: number, b: number, c: number, d: number, e: number, f: number
): [number, number, number, number, number, number] | null {
  const det = a * d - b * c
  if (Math.abs(det) < 1e-9) return null
  const ia = d / det
  const ib = -b / det
  const ic = -c / det
  const id = a / det
  const ie = -(ia * e + ic * f)
  const ifc = -(ib * e + id * f)
  return [ia, ib, ic, id, ie, ifc]
}

/**
 * Apply a tile-level transform to a pattern child.
 *
 * SVG semantics: `patternTransform` is applied to the pattern's
 * own coordinate system *before* tiles are placed in the grid.
 * Concretely, for a child at pattern-local position (lx, ly):
 *   1. Translate by (-tileCenterLocalX, -tileCenterLocalY) so the
 *      tile center is at the pattern-local origin.
 *   2. Apply the affine matrix around that origin.
 *   3. Translate back by (tileCenterLocalX, tileCenterLocalY).
 *   4. Translate by the tile's grid position to place the tile
 *      in user space.
 *
 * This is what makes adjacent tiles flow continuously — the tile
 * is rotated as a whole, not each child individually. (Per-child
 * rotation breaks tile-edge continuity and produces a dotted look
 * like we had in v6.)
 */
function transformChildInTile(
  child: Element,
  tileLeft: number,
  tileTop: number,
  tileCenterLocalX: number,
  tileCenterLocalY: number,
  matrix: [number, number, number, number, number, number],
  rotationDeg: number
): Element | undefined {
  const [a, b, c, d, tx, ty] = matrix
  // Step 1+2: rotate around the pattern-local tile center.
  const centered = translateElement(child, -tileCenterLocalX, -tileCenterLocalY)
  if (!centered) return undefined
  const rotated = applyAffineToElement(centered, a, b, c, d, 0, 0)
  if (!rotated) return undefined
  // Step 3: translate back to pattern-local position.
  const inPattern = translateElement(rotated, tileCenterLocalX, tileCenterLocalY)
  if (!inPattern) return undefined
  // Step 4: translate by the tile's grid position to user space.
  const final = translateElement(inPattern, tileLeft + tx, tileTop + ty)
  if (!final) return undefined
  // Set the shape's `rotate` so the geometry itself rotates, not
  // just its position. We only do this for shapes (lines/groups
  // aren't supported by pptxgenjs's `rotate`).
  if (rotationDeg !== 0 && final.type === 'shape') {
    ;(final as any).rotation = (final as any).rotation ?? 0
    ;(final as any).rotation = ((final as any).rotation + rotationDeg) % 360
  }
  return final
}

/**
 * Apply a 2D affine transform `[a b c d e f]` to a child element's
 * coordinates. For shapes with x/y/width/height the corners are
 * transformed and the new bounding box is derived. For shapes
 * with center coords (circle, ellipse) the center is transformed
 * directly. Lines' endpoints are transformed. Groups are recursed.
 *
 * Two non-trivial cases get extra treatment:
 *   - **Rotated rect** → convert to a 4-point polygon. A rotated
 *     AABB-shaped rect rendered as `rect + rotate` produces a
 *     diamond, not a rotated rect; the diagonal-stripe fixtures
 *     showed the result as a stair-step / triangle-gap pattern.
 *     A 4-point polygon (the rotated corners) draws correctly and
 *     when tiled overlaps with its neighbours to form continuous
 *     stripes.
 *   - **Polygon / polyline** → also transform the `points` string,
 *     so the points and the bbox stay in the same coord system.
 *     Without this, the shape converter's `normalizePathPointsToLocal`
 *     subtracts the post-translation bbox origin from pattern-local
 *     points and produces negative EMU values that pptxgenjs's
 *     `< 100 means inches` heuristic then multiplies by 914,400
 *     again, causing PowerPoint to drop the shape (honeycomb blank).
 */
function applyAffineToElement(
  element: Element,
  a: number, b: number, c: number, d: number, e: number, f: number
): Element | undefined {
  const transform = (x: number, y: number) => ({ x: a * x + c * y + e, y: b * x + d * y + f })

  switch (element.type) {
    case 'shape': {
      const shape = element as ShapeElement

      // Rotated rect: replace with a 4-point polygon whose points
      // are the rotated corners and whose bbox is the AABB.
      if (shape.shapeType === 'rect' && isNonTrivialMatrix(a, b, c, d)) {
        const rect = shape as RectShape
        const corners = [
          transform(rect.x, rect.y),
          transform(rect.x + rect.width, rect.y),
          transform(rect.x + rect.width, rect.y + rect.height),
          transform(rect.x, rect.y + rect.height)
        ]
        const xs = corners.map(p => p.x)
        const ys = corners.map(p => p.y)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const maxX = Math.max(...xs)
        const maxY = Math.max(...ys)
        const localPoints = corners
          .map(p => `${roundToDecimals(p.x - minX)},${roundToDecimals(p.y - minY)}`)
          .join(' ')
        const next: any = {
          ...rect,
          shapeType: 'polygon',
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          points: localPoints,
          // Rotation is now baked into the geometry; the rect's
          // `rotation` attribute would double-apply it.
          rotation: undefined
        }
        delete next.rx
        delete next.ry
        return next
      }

      // Rect-like shape: transform its 4 corners and re-derive bbox.
      const corners = [
        transform(shape.x, shape.y),
        transform(shape.x + shape.width, shape.y),
        transform(shape.x, shape.y + shape.height),
        transform(shape.x + shape.width, shape.y + shape.height),
      ]
      const xs = corners.map(p => p.x)
      const ys = corners.map(p => p.y)
      const newX = Math.min(...xs)
      const newY = Math.min(...ys)
      const newW = Math.max(...xs) - newX
      const newH = Math.max(...ys) - newY
      const next: any = { ...shape, x: newX, y: newY, width: newW, height: newH }
      // For line shapes, transform the endpoints.
      if ('x1' in shape && 'y1' in shape && 'x2' in shape && 'y2' in shape) {
        const p1 = transform((shape as any).x1, (shape as any).y1)
        const p2 = transform((shape as any).x2, (shape as any).y2)
        next.x1 = p1.x; next.y1 = p1.y; next.x2 = p2.x; next.y2 = p2.y
      }
      // For circle/ellipse, transform the center.
      if ('cx' in shape && 'cy' in shape) {
        const center = transform((shape as any).cx, (shape as any).cy)
        next.cx = center.x
        next.cy = center.y
      }
      // For polygon/polyline, also transform the points string when
      // the matrix has a non-trivial rotation/scale component.
      if ((shape.shapeType === 'polygon' || shape.shapeType === 'polyline') && isNonTrivialMatrix(a, b, c, d)) {
        next.points = transformPointsStringWithMatrix((shape as any).points, a, b, c, d, e, f)
      }
      return next
    }
    case 'group': {
      const group = element as GroupElement
      const children: Element[] = []
      for (const childEl of group.children) {
        const cc = applyAffineToElement(childEl, a, b, c, d, e, f)
        if (cc) children.push(cc)
      }
      return { ...group, children }
    }
    case 'text': {
      const text = element as any
      const p = transform(text.x, text.y)
      return { ...text, x: p.x, y: p.y }
    }
    default:
      return undefined
  }
}

/**
 * Return true if the element's bounding box *intersects* the rectangle
 * `(x0, y0) – (x1, y1)`. Used by the pattern-fill expansion to skip
 * tiles that are completely outside the filled shape.
 *
 * The earlier version of this check was a strict "fully contained"
 * predicate, which made sense when pattern tiles were unrotated
 * (every tile either lay entirely inside the shape or not at all).
 * After adding `patternTransform="rotate(...)"` support, the rotated
 * tile content's AABB extends beyond the original 14×14 / 20×20 tile
 * bounds by design — adjacent tiles overlap to form continuous
 * diagonal stripes. A strict "fully contained" check then dropped
 * the corner tiles, leaving the triangle gaps visible in
 * `output/04-patterns/3.png`. Switching to "intersects" keeps those
 * corner tiles; each tile is still drawn as a separate `addShape`
 * call clipped to its own bbox by PowerPoint, so no visual overflow.
 */
function fitsWithinBbox(element: Element, x0: number, y0: number, x1: number, y1: number): boolean {
  if (element.type === 'shape') {
    const s = element as ShapeElement
    return s.x < x1 && s.y < y1 && s.x + s.width > x0 && s.y + s.height > y0
  }
  if (element.type === 'group') {
    return (element as GroupElement).children.some(c => fitsWithinBbox(c, x0, y0, x1, y1))
  }
  if (element.type === 'text') {
    const t = element as any
    return t.x < x1 && t.y < y1 && t.x + t.width > x0 && t.y + t.height > y0
  }
  return true
}

/**
 * Strict version: the element's bbox must be fully contained
 * inside `[x0, y0, x1, y1]`. Used for unrotated patterns where
 * tile contents are axis-aligned — a tile that straddles the
 * bottom or right edge would draw half the shape's child outside
 * the shape's bbox, leaking past the border.
 */
function fitsWithinBboxFully(element: Element, x0: number, y0: number, x1: number, y1: number): boolean {
  if (element.type === 'shape') {
    const s = element as ShapeElement
    return s.x >= x0 && s.y >= y0 && s.x + s.width <= x1 && s.y + s.height <= y1
  }
  if (element.type === 'group') {
    return (element as GroupElement).children.every(c => fitsWithinBboxFully(c, x0, y0, x1, y1))
  }
  if (element.type === 'text') {
    const t = element as any
    return t.x >= x0 && t.y >= y0 && t.x + t.width <= x1 && t.y + t.height <= y1
  }
  return true
}
