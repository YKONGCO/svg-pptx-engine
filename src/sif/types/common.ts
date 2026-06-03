// Common types - coordinates, dimensions, colors, transforms

/**
 * Layout directive for an element. Determines how the layout engine places
 * the element relative to its parent and siblings.
 *
 * - `block`: stacked vertically in document order (default)
 * - `inline`: laid out horizontally inside a text-like line, with line wrap
 * - `flex`: distributed along a main axis with flex sizing
 * - `grid`: placed in a 2D grid
 * - `absolute`: positioned by its own x/y, ignored by flow
 */
export type LayoutDirective = 'block' | 'inline' | 'flex' | 'grid' | 'absolute'

/**
 * 2D Point
 */
export interface Point {
  x: number
  y: number
}

/**
 * Size (width and height)
 */
export interface Size {
  width: number
  height: number
}

/**
 * Bounding box
 */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Color value (string)
 * 支持多种颜色格式：
 * - Hex: "#RGB" / "#RRGGBB" / "#RRGGBBAA"
 * - Named: "red", "blue", "transparent" 等 CSS 命名颜色
 * - rgb()/rgba(): "rgb(255,0,0)" / "rgba(255,0,0,0.5)"
 */
export type Color = string

/**
 * Transform properties
 */
export interface Transform {
  translateX?: number
  translateY?: number
  scaleX?: number
  scaleY?: number
  rotate?: number
  rotateX?: number  // rotation around X axis (3D)
  rotateY?: number  // rotation around Y axis (3D)
  rotateZ?: number  // rotation around Z axis
  matrix?: [number, number, number, number, number, number]  // 3x2 matrix: a, b, c, d, e, f
}

/**
 * Transform origin
 */
export interface TransformOrigin {
  x?: number  // percentage or absolute
  y?: number
}

/**
 * Length value in pixels (px)
 * SIF 使用统一的像素单位，所有长度值均为 number 类型
 * 上游解析器负责将其他单位（pt, em, %, cm, mm, in）转换为 px
 */
export type PxLength = number

/**
 * Angle in degrees
 */
export type Angle = number // 0-360

/**
 * Percentage value (0-1 or 0-100)
 */
export type Percentage = number

/**
 * Opacity value (0-1)
 */
export type Opacity = number // 0-1

/**
 * Line dash pattern
 */
export type DashArray = string // e.g., "5,5" or "5,5,2,2"

/**
 * Reference to a defined resource (gradient, filter, clipPath, etc.)
 */
export interface ResourceRef {
  type: 'gradient' | 'filter' | 'clipPath' | 'pattern'
  id: string
}

/**
 * Hyperlink definition
 */
export interface Hyperlink {
  // URL to navigate to
  href: string

  // Link target
  target?: '_self' | '_blank' | '_parent' | '_top'

  // Tooltip text
  tooltip?: string

  // Action type
  action?: 'navigate' | 'jump' | 'showMessage' | 'runMacro' | 'custom'

  // For slide jumps
  slideId?: string  // slide to jump to (for 'jump' action)

  // For custom actions
  customActionId?: string
}

/**
 * Hyperlink click action
 */
export type HyperlinkAction = 'navigate' | 'jump' | 'showMessage' | 'runMacro' | 'custom'

/**
 * Unique identifier
 */
export type ElementId = string

/**
 * Metadata for elements
 */
export interface ElementMeta {
  createdAt?: number
  updatedAt?: number
  source?: string  // source file or origin
  description?: string
  tags?: string[]
}

/**
 * Utility type for making all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
