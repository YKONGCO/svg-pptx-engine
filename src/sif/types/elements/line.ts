// Line element types
import { BaseElement } from './base'
import { Stroke } from '../style/stroke'

/**
 * Line element (for simple lines)
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

  // Arrow markers (optional)
  markerStart?: string    // marker ID
  markerEnd?: string      // marker ID
}

/**
 * Arrow head types
 */
export type ArrowHeadType = 'arrow' | 'diamond' | 'circle' | 'open' | 'none'

/**
 * Arrow marker definition
 */
export interface ArrowMarker {
  id: string
  type: ArrowHeadType
  width?: number      // in EMUs
  height?: number     // in EMUs
  fill?: boolean     // whether to fill the marker
  color?: string      // marker color (defaults to stroke color)
}
