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
 * Union of all visual effect types (shadows, blur, glow)
 */
export type VisualEffect = ShadowEffect | BlurEffect | GlowEffect | DropShadowEffect | OuterGlowEffect
