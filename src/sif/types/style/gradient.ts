// Gradient types - linear and radial
import { Color, Opacity, Angle, Percentage } from '../common'

export type GradientType = 'linear' | 'radial'

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
}

/**
 * Union of gradient types
 */
export type Gradient = LinearGradient | RadialGradient
