// Fill types - solid, gradient, none
import { Gradient } from './gradient'
import { Color, Opacity } from '../common'

export type FillType = 'solid' | 'gradient' | 'none'

/**
 * Solid color fill
 */
export interface SolidFill {
  type: 'solid'
  color: Color
  opacity?: Opacity
}

/**
 * Fill that references a gradient
 */
export interface GradientFill {
  type: 'gradient'
  gradient: Gradient
  opacity?: Opacity
}

/**
 * No fill (transparent)
 */
export interface NoneFill {
  type: 'none'
}

/**
 * Union of all fill types
 */
export type Fill = SolidFill | GradientFill | NoneFill
