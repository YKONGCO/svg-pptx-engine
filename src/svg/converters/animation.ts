// SVG SMIL animation snapshotting (Phase 1.5).
//
// SVG defines a small animation language (`<set>`, `<animate>`,
// `<animateTransform>`, `<animateMotion>`). PowerPoint has no
// equivalent for these elements, so we adopt the "snapshot the end
// state" strategy: any animation with `fill="freeze"` (or no
// explicit `fill`, since `freeze` is the only useful one for static
// output) is applied to its target element. Animations without
// `fill="freeze"` are dropped.
//
// Each converter for a graphic element (`<rect>`, `<circle>`, etc.)
// is responsible for collecting its `<set>` / `<animate>` /
// `<animateTransform>` / `<animateMotion>` children *before*
// building the SIF element, and calling `applyAnimationSnapshot` on
// the result. This keeps the SIF element immutable from the caller's
// perspective — we return a new object with the snapshot applied.

import type { BaseElement } from '../../sif/types/elements/base'
import type { ShapeElement } from '../../sif/types/elements/shape'
import type { TextElement } from '../../sif/types/elements/text'
import type { LineElement } from '../../sif/types/elements/line'
import type { Transform } from '../../sif/types/common'
import { parseColor, parseOpacity } from './color'
import { getAttr, getChildElements } from '../parser'

/**
 * A graphic element that participates in transform animation.
 * Group elements are intentionally excluded — they have no
 * `transform` field by design.
 */
type TransformableElement = (ShapeElement | TextElement | LineElement) & { transform?: Transform }

interface AnimationEntry {
  tag: 'set' | 'animate' | 'animateTransform' | 'animateMotion'
  attributeName?: string
  to?: string
  type?: string             // animateTransform: translate | rotate | scale
  path?: string             // animateMotion
  values?: string
  fill?: 'freeze' | 'remove'
}

/**
 * Collect the animation children of a graphic SVG element, in document
 * order, and return them as `AnimationEntry` records.
 */
export function collectAnimations(node: Record<string, unknown>): AnimationEntry[] {
  const entries: AnimationEntry[] = []
  for (const child of getChildElements(node)) {
    const tag = childTagName(child)
    if (tag !== 'set' && tag !== 'animate' && tag !== 'animateTransform' && tag !== 'animateMotion') {
      continue
    }
    const inner = (child as Record<string, unknown>)[tag] as Record<string, unknown> | undefined
    if (!inner) continue
    entries.push({
      tag,
      attributeName: getAttr(inner, 'attributeName'),
      to: getAttr(inner, 'to'),
      type: getAttr(inner, 'type'),
      path: getAttr(inner, 'path'),
      values: getAttr(inner, 'values'),
      fill: parseFill(getAttr(inner, 'fill'))
    })
  }
  return entries
}

function parseFill(value: string | undefined): 'freeze' | 'remove' | undefined {
  if (value === 'freeze') return 'freeze'
  if (value === 'remove') return 'remove'
  return undefined
}

function childTagName(child: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(child)) {
    if (key.startsWith('@_')) continue
    if (['set', 'animate', 'animateTransform', 'animateMotion'].includes(key)) {
      return key
    }
  }
  return undefined
}

/**
 * Apply the end-state snapshot of each animation to a SIF element.
 * Returns a new element (the input is not mutated). Animations with
 * `fill="remove"` (or no `fill`) are dropped.
 *
 * Supported attributes:
 *   - `x`, `y`, `width`, `height`, `cx`, `cy`, `r`, `rx`, `ry` — set
 *     to the `to` value as a number.
 *   - `fill` — parsed as a color and assigned to the SIF fill.
 *   - `transform` (via `animateTransform`) — sets translateX/Y,
 *     rotate, or scaleX/Y on the element's transform.
 *   - `path` (via `animateMotion`) — sets translateX/Y from the
 *     first M command's coordinates.
 */
export function applyAnimationSnapshot<T extends TransformableElement>(
  element: T,
  animations: AnimationEntry[]
): T {
  let result: T = element
  for (const anim of animations) {
    // Per SMIL spec, the default `fill` is `remove` (the animated value
    // is discarded after the animation ends). We only freeze the
    // end-state when `fill="freeze"` is explicitly set; `remove` and
    // an absent `fill` attribute are both treated as "do not bake".
    if (anim.fill !== 'freeze') continue
    if (anim.tag === 'set' || anim.tag === 'animate') {
      if (!anim.attributeName || anim.to === undefined) continue
      result = applyAttributeAnimation(result, anim.attributeName, anim.to)
    } else if (anim.tag === 'animateTransform') {
      if (!anim.to) continue
      result = applyTransformAnimation(result, anim.type ?? 'translate', anim.to)
    } else if (anim.tag === 'animateMotion') {
      if (!anim.path) continue
      result = applyMotionAnimation(result, anim.path)
    }
  }
  return result
}

// Suppress unused import warning for BaseElement which is kept for
// type-completeness documentation of the module surface.
void (null as unknown as BaseElement | undefined)

function applyAttributeAnimation<T extends TransformableElement>(element: T, name: string, rawValue: string): T {
  if (name === 'fill') {
    const color = parseColor(rawValue)
    if (color) {
      const opacity = parseOpacity(rawValue)
      return { ...element, fill: { type: 'solid', color, ...(opacity !== undefined ? { opacity } : {}) } } as unknown as T
    }
    return element
  }
  if (name === 'opacity') {
    const opacity = parseFloat(rawValue)
    if (Number.isFinite(opacity)) {
      return { ...element, opacity } as unknown as T
    }
    return element
  }
  const numeric = parseFloat(rawValue)
  if (!Number.isFinite(numeric)) return element
  if (['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry'].includes(name)) {
    return { ...element, [name]: numeric } as unknown as T
  }
  return element
}

function applyTransformAnimation<T extends TransformableElement>(element: T, type: string, to: string): T {
  const parts = to.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n))
  if (parts.length === 0) return element
  const transform: Transform = { ...(element.transform ?? {}) }
  if (type === 'translate') {
    transform.translateX = parts[0]
    transform.translateY = parts[1] ?? 0
  } else if (type === 'scale') {
    transform.scaleX = parts[0]
    transform.scaleY = parts[1] ?? parts[0]
  } else if (type === 'rotate') {
    transform.rotate = parts[0]
  }
  return { ...element, transform } as unknown as T
}

function applyMotionAnimation<T extends TransformableElement>(element: T, path: string): T {
  // Crude parser: take the first M (moveto) command and use its
  // coordinates as the translate offset. Path commands like
  // "M50,30 L100,80" give translate(50, 30).
  const match = path.match(/[Mm]\s*(-?[\d.]+)\s*[,\s]\s*(-?[\d.]+)/)
  if (!match) return element
  const x = parseFloat(match[1])
  const y = parseFloat(match[2])
  const transform: Transform = { ...(element.transform ?? {}), translateX: x, translateY: y }
  return { ...element, transform } as unknown as T
}
