// Gradient types - linear and radial
import { Color, Opacity, Angle, Percentage } from '../common'

export type GradientType = 'linear' | 'radial'

/** 2D affine matrix as 6-tuple: [a, b, c, d, tx, ty].
 *  Same shape as the converter's `TransformMatrix`. */
export type GradientTransform = [number, number, number, number, number, number]

/**
 * Phase 0.2B: SVG `spreadMethod` controls how the gradient is sampled
 * outside the 0-100% range:
 *   - 'pad'     — clamp to first / last stop (SVG default)
 *   - 'reflect' — mirror the stop range
 *   - 'repeat'  — tile the stop range
 *
 * PPTX has no native `reflect` / `repeat`; the renderer falls back to
 * `pad` and emits a warning the first time a non-pad value is dropped.
 */
export type GradientSpreadMethod = 'pad' | 'reflect' | 'repeat'

/**
 * Gradient stop (color at a specific position)
 */
export interface GradientStop {
  offset: Percentage      // 0-1
  color: Color
  opacity?: Opacity
}

/**
 * Linear gradient
 */
export interface LinearGradient {
  type: 'linear'
  stops: GradientStop[]
  angle?: Angle          // 0-360 degrees
  x1?: Percentage        // 0-1, start point (overrides angle)
  y1?: Percentage
  x2?: Percentage        // 0-1, end point
  y2?: Percentage
  /**
   * Optional 2D affine transform applied to the gradient direction
   * (see SVG `gradientTransform`). When present, the renderer should
   * apply this to the gradient vector `[x1,y1] → [x2,y2]` and the
   * focal point for radial gradients.
   */
  transform?: GradientTransform
  /** Phase 0.2B: SVG `spreadMethod`. Defaults to `pad`. */
  spreadMethod?: GradientSpreadMethod
}

/**
 * Radial gradient
 */
export interface RadialGradient {
  type: 'radial'
  stops: GradientStop[]
  x1?: Percentage        // 0-1, center point
  y1?: Percentage
  x2?: Percentage        // 0-1, end circle
  y2?: Percentage
  r1?: Percentage        // inner radius
  r2?: Percentage        // outer radius (0-1)
  transform?: GradientTransform
  /** Phase 0.2B: see {@link LinearGradient.spreadMethod}. */
  spreadMethod?: GradientSpreadMethod
}

/**
 * Union of gradient types
 */
export type Gradient = LinearGradient | RadialGradient
