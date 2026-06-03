// Line element types
import { BaseElement } from './base'
import { Stroke } from '../style/stroke'

/**
 * Marker attribute on a SIF LineElement.
 *
 * Phase 1.2 emits structured ArrowMarker values from the SVG
 * converter, but JSON fixtures (and downstream consumers that build
 * SIF directly) may still emit the legacy bare-string form. We accept
 * both and normalize at the PPTX boundary.
 */
export type MarkerAttr = ArrowMarker | ArrowHeadType

/**
 * Line element (for simple lines, polylines, polygons)
 */
export interface LineElement extends BaseElement {
  type: 'line'

  // Line coordinates
  x1: number
  y1: number
  x2: number
  y2: number

  // Line stroke
  stroke: Stroke

  // Arrow markers (optional, see ArrowMarker).
  // Phase 1.2: typed as `MarkerAttr` to allow both the structured
  // ArrowMarker and the legacy bare-string form.
  markerStart?: MarkerAttr
  markerEnd?: MarkerAttr
  markerMid?: ArrowMarker
}

/**
 * Arrow head types
 */
export type ArrowHeadType = 'arrow' | 'diamond' | 'circle' | 'open' | 'none'

/**
 * Marker orientation along the path.
 *   - `auto`  : the marker is rotated to follow the path direction
 *   - `auto-start-reverse` : like `auto` but the start marker is mirrored
 *   - a number : fixed rotation in degrees
 */
export type MarkerOrient = 'auto' | 'auto-start-reverse' | number

/**
 * Arrow marker definition.
 *
 * This is the in-memory representation of an SVG `<marker>` element
 * (or a synthetic marker inferred from the marker-* attribute value
 * when the <marker> def is missing). It is consumed by the PPTX layer
 * to drive `beginArrowType` / `endArrowType` and the per-endpoint
 * marker shape override.
 */
export interface ArrowMarker {
  id: string
  type: ArrowHeadType
  /** Marker refX — anchor point inside the marker viewBox. */
  refX?: number
  /** Marker refY — anchor point inside the marker viewBox. */
  refY?: number
  /** Marker width in user units. */
  width?: number
  /** Marker height in user units. */
  height?: number
  /** Marker rotation behaviour along the path. */
  orient?: MarkerOrient
  /** Whether the marker is filled (vs. stroke-only). */
  fill?: boolean
  /** Marker color (defaults to the parent line's stroke color). */
  color?: string
}
