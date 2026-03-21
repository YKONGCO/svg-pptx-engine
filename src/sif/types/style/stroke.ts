// Stroke types
import { Color, Opacity, DashArray } from '../common'
import { Gradient } from './gradient'

export type LineCap = 'round' | 'square' | 'butt'
export type LineJoin = 'round' | 'bevel' | 'miter'

/**
 * Solid color stroke
 */
export interface SolidStroke {
  type?: 'solid'
  color: Color
  width: number           // in pixels
  opacity?: Opacity
  lineCap?: LineCap
  lineJoin?: LineJoin
  dashArray?: DashArray   // e.g., "5,5"
  dashOffset?: number     // offset into the dash pattern
}

/**
 * Gradient stroke
 */
export interface GradientStroke {
  type: 'gradient'
  gradient: Gradient
  width: number           // in pixels
  opacity?: Opacity
  lineCap?: LineCap
  lineJoin?: LineJoin
  dashArray?: DashArray
  dashOffset?: number
}

/**
 * Stroke definition (supports solid or gradient)
 */
export interface Stroke {
  color?: Color
  type?: 'solid' | 'gradient'
  gradient?: Gradient
  width: number           // in pixels
  opacity?: Opacity
  lineCap?: LineCap
  lineJoin?: LineJoin
  dashArray?: DashArray   // e.g., "5,5"
  dashOffset?: number     // offset into the dash pattern
}
