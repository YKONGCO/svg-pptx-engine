// Effect types - shadows, blur, etc.
import { Color, Opacity } from '../common'

/**
 * Shadow effect
 */
export interface ShadowEffect {
  type: 'shadow'
  color: Color
  offsetX: number         // pixels
  offsetY: number         // pixels
  blur: number           // blur radius in pixels
  opacity?: Opacity
  spread?: number        // spread in pixels (optional)
  /**
   * Optional colour matrix to apply to the host fill before the
   * shadow is computed. Captured when an SVG filter chains an
   * offset/blur shadow with a sibling `feColorMatrix` (e.g. the
   * shadowHue fixture). PPTX can't represent the post-merge matrix
   * on a single shape, so the renderer transforms the source fill
   * colour and emits the shadow underneath as best it can.
   */
  applyColorMatrixToFill?: {
    matrixType: 'matrix' | 'saturate' | 'hueRotate' | 'luminanceToAlpha'
    values?: number[]
    value?: number
  }
}

/**
 * Blur effect
 */
export interface BlurEffect {
  type: 'blur'
  radius: number         // blur radius in pixels
}

/**
 * Glow effect
 */
export interface GlowEffect {
  type: 'glow'
  color: Color
  radius: number         // glow radius in pixels
  opacity?: Opacity
}

/**
 * Drop shadow (preset)
 */
export interface DropShadowEffect {
  type: 'dropShadow'
  preset: 'subtle' | 'moderate' | 'intense'
}

/**
 * Outer glow (preset)
 */
export interface OuterGlowEffect {
  type: 'outerGlow'
  preset: 'subtle' | 'moderate' | 'intense'
}

/**
 * Colour-matrix effect produced by an SVG `feColorMatrix` filter
 * primitive. The matrix is captured at the SVG layer; the PPTX
 * renderer may apply it as a tint overlay (for `saturate` /
 * `hueRotate`) or rasterise the filtered result.
 *
 *   - `matrixType='matrix'` + `values` (20 numbers, row-major 4×5)
 *   - `matrixType='saturate'` + `value` (0=greyscale, 1=identity)
 *   - `matrixType='hueRotate'` + `value` (degrees)
 *   - `matrixType='luminanceToAlpha'` (no payload; greyscale alpha)
 */
export interface ColorMatrixEffect {
  type: 'colorMatrix'
  matrixType: 'matrix' | 'saturate' | 'hueRotate' | 'luminanceToAlpha'
  values?: number[]
  value?: number
}

/**
 * Solid flood effect produced by an SVG `feFlood` primitive.
 * Mostly used inside composite filter chains; the renderer treats
 * it as a solid colour overlay with the given opacity.
 */
export interface FloodEffect {
  type: 'flood'
  color: Color
  opacity?: Opacity
}

/**
 * Union of all visual effect types (shadows, blur, glow, color)
 */
export type VisualEffect = ShadowEffect | BlurEffect | GlowEffect | DropShadowEffect | OuterGlowEffect | ColorMatrixEffect | FloodEffect
