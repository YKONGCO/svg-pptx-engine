// Group Converter - Converts SIF group elements to pptxgenjs shapes
//
// SIF Design Note: GroupElement is purely for logical grouping, NOT visual styling.
// - No position properties (x, y, width, height)
// - No visual properties (transform, opacity, effect)
// - Child coordinates are ALWAYS absolute (relative to canvas)
//
// When encountering <g transform="..."> in SVG, the transform should be merged
// into child coordinates during SVG → SIF conversion.

import type { GroupElement } from '../../sif/types/elements/group'
import type { Element } from '../../sif/types/elements/base'
import type { Transform } from '../../sif/types/common'
import type { ShapeElement } from '../../sif/types/elements/shape'
import type { TextElement } from '../../sif/types/elements/text'
import type { ImageElement } from '../../sif/types/elements/image'
import type { LineElement } from '../../sif/types/elements/line'
import type { VideoElement } from '../../sif/types/elements/video'
import type { AudioElement } from '../../sif/types/elements/audio'
import type { SlideResources } from '../../sif/types/document'
import { convertShape } from './shape'
import { convertTextOrFormula } from './text'
import { convertImage } from './image'
import { convertLine } from './line'
import { convertVideo } from './video'
import { convertAudio } from './audio'

/**
 * Result type for a converted element (can be shape, text, image, line, video, or nested group)
 */
export interface ConvertedGroupChild {
  type: 'shape' | 'text' | 'formula' | 'fragments' | 'image' | 'line' | 'video' | 'audio'
  data: any
  /**
   * The original SIF element the conversion was derived from.
   * Carried through so the post-processor can rebuild per-element
   * hints (cap, join, fillRule) without re-running the shape
   * converter. `undefined` for nested-group entries, which are
   * flattened on the way out and don't emit XML directly.
   */
  source?: Element
}

/**
 * Apply group transform to a non-group element (immutably - returns new element)
 * Note: SIF groups don't have transform by design - transforms are merged into child coordinates
 * during SVG → SIF conversion. This function is kept for potential future use.
 */
function applyGroupTransform<T extends Element>(
  element: T,
  _groupTransform: Transform
): T {
  // SIF design: transforms are merged into child coordinates during SVG→SIF conversion
  // So we don't apply transforms here - children already have absolute coordinates
  return element
}

/**
 * Convert a single SIF element to pptxgenjs group child format
 */
function convertElementToGroupChild(element: Element, resources?: SlideResources): ConvertedGroupChild | null {
  if (element.visible === false) {
    return null
  }

  switch (element.type) {
    case 'shape': {
      const converted = convertShape(element as ShapeElement, undefined, resources)
      return { type: 'shape', data: converted, source: element }
    }
    case 'text': {
      const converted = convertTextOrFormula(element as TextElement)
      return { type: converted.type as any, data: converted, source: element }
    }
    case 'image': {
      const converted = convertImage(element as ImageElement)
      return { type: 'image', data: converted, source: element }
    }
    case 'line': {
      const converted = convertLine(element as LineElement)
      return { type: 'line', data: converted, source: element }
    }
    case 'video': {
      const converted = convertVideo(element as VideoElement)
      return { type: 'video', data: converted, source: element }
    }
    case 'audio': {
      const converted = convertAudio(element as AudioElement)
      return { type: 'audio', data: converted, source: element }
    }
    case 'group':
      // Groups are handled recursively by flattenGroupElements
      return null
    default:
      console.warn(`Unsupported element type in group: ${(element as any).type}`)
      return null
  }
}

/**
 * Flatten group elements - recursively processes nested groups
 * Children are converted with GLOBAL coordinates (absolute position on canvas)
 */
export function flattenGroupElements(
  group: GroupElement,
  convertElementFn?: (element: Element) => any,
  resources?: SlideResources
): ConvertedGroupChild[] {
  // SIF uses global coordinates - children already have absolute positions
  return flattenWithOffset(group, 0, 0, convertElementFn, resources)
}

function flattenWithOffset(
  group: GroupElement,
  offsetX: number,
  offsetY: number,
  convertElementFn?: (element: Element) => any,
  resources?: SlideResources
): ConvertedGroupChild[] {
  const results: ConvertedGroupChild[] = []
  const sortedChildren = [...group.children].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))

  for (const child of sortedChildren) {
    if (child.type === 'group') {
      const childGroup = child as GroupElement
      results.push(...flattenWithOffset(childGroup, offsetX, offsetY, convertElementFn, resources))
    } else {
      // SIF groups don't have transforms - children already have absolute coordinates
      // No transformation needed here
      const globalElement = child

      const converted = convertElementFn
        ? convertElementFn(globalElement)
        : convertElementToGroupChild(globalElement, resources)

      if (converted) {
        results.push(converted as ConvertedGroupChild)
      }
    }
  }

  return results
}

/**
 * Check if group has background - SIF groups don't support background by design
 * Groups are purely logical containers without visual properties
 */
export function groupHasBackground(_group: GroupElement): boolean {
  return false
}

/**
 * Create background shape options for group - not supported in SIF
 * Groups are purely logical containers without visual properties
 */
export function createGroupBackground(_group: GroupElement): null {
  return null
}

/**
 * Convert a group element - returns children with their GLOBAL coordinates
 * Children coordinates are already converted to absolute positions by flattenGroupElements
 *
 * Note: SIF groups are purely logical - no visual properties like background, transform, etc.
 * If you need visual grouping, use a shape element instead.
 */
export function convertGroup(group: GroupElement, resources?: SlideResources): ConvertedGroupChild[] {
  // SIF groups don't have visual properties, so no background to add
  // Just flatten and return children
  return flattenGroupElements(group, undefined, resources)
}

/**
 * Get bounding box of a group (considering all children)
 * Since group has no position, returns computed bounding box from children
 *
 * Note: SIF groups don't have transform, so no scaling is applied
 */
export function getGroupBoundingBox(group: GroupElement): { x: number; y: number; width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  // processElement only called for non-group elements (shape/text/image/line/video)
  const processElement = (el: any) => {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  }

  for (const child of group.children) {
    if (child.type === 'group') {
      const childBox = getGroupBoundingBox(child as GroupElement)
      minX = Math.min(minX, childBox.x)
      minY = Math.min(minY, childBox.y)
      maxX = Math.max(maxX, childBox.x + childBox.width)
      maxY = Math.max(maxY, childBox.y + childBox.height)
    } else {
      processElement(child)
    }
  }

  // If no children, return empty bounds
  if (minX === Infinity) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}
