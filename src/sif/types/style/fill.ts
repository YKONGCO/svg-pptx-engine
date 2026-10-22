// Fill types - solid, gradient, pattern, none
import { Gradient } from './gradient'
import { Color, Opacity } from '../common'

export type FillType = 'solid' | 'gradient' | 'pattern' | 'none'

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
 * Fill that references an SVG `<pattern>` (Phase 0.2). The
 * `patternId` is the SVG `id` of the `<pattern>` element, looked
 * up in the converter's defs map. The PPTX layer rasterises the
 * pattern tile to a small image and uses it as a repeating
 * image fill.
 */
export interface PatternFill {
  type: 'pattern'
  patternId: string
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
export type Fill = SolidFill | GradientFill | PatternFill | NoneFill
