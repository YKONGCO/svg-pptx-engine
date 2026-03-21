// Protocol constants - Standard slide sizes and default values

// Standard slide sizes (in pixels, assuming 96 DPI)
export const STANDARD_SLIDE_SIZES = {
  // 16:9 widescreen (default)
  WIDESCREEN: { width: 1280, height: 720 },
  // 4:3 standard
  STANDARD: { width: 1024, height: 768 },
  // Custom default
  DEFAULT: { width: 1280, height: 720 }
} as const

// Legacy alias for backward compatibility
export const LEGACY_SLIDE_SIZES = STANDARD_SLIDE_SIZES

// Default values
export const DEFAULTS = {
  // Slide
  SLIDE_WIDTH: STANDARD_SLIDE_SIZES.DEFAULT.width,
  SLIDE_HEIGHT: STANDARD_SLIDE_SIZES.DEFAULT.height,

  // Font
  FONT_FAMILY: 'Arial',
  FONT_SIZE: 16,
  FONT_WEIGHT: 'normal' as const,
  FONT_STYLE: 'normal' as const,

  // Stroke
  STROKE_WIDTH: 1,
  STROKE_COLOR: '#000000',

  // Fill
  FILL_COLOR: '#000000',
  FILL_OPACITY: 1,

  // Text
  TEXT_ALIGN: 'left' as const,
  TEXT_ANCHOR: 'start' as const,

  // Image
  IMAGE_PLACEHOLDER: 'data:image/png;base64,'
} as const

// Element type names
export const ELEMENT_TYPES = {
  SHAPE: 'shape',
  TEXT: 'text',
  IMAGE: 'image',
  LINE: 'line',
  GROUP: 'group',
  VIDEO: 'video',
  ICON: 'icon'
} as const

// Shape type names
export const SHAPE_TYPES = {
  RECT: 'rect',
  CIRCLE: 'circle',
  ELLIPSE: 'ellipse',
  PATH: 'path',
  LINE: 'line',
  POLYGON: 'polygon',
  POLYLINE: 'polyline'
} as const

// Fill types
export const FILL_TYPES = {
  SOLID: 'solid',
  GRADIENT: 'gradient',
  NONE: 'none'
} as const

// Gradient types
export const GRADIENT_TYPES = {
  LINEAR: 'linear',
  RADIAL: 'radial'
} as const

// Text alignment
export const TEXT_ALIGNMENTS = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right'
} as const

// Text anchor
export const TEXT_ANCHORS = {
  START: 'start',
  MIDDLE: 'middle',
  END: 'end'
} as const

// Font weights
export const FONT_WEIGHTS = {
  NORMAL: 'normal',
  BOLD: 'bold'
} as const

// Font styles
export const FONT_STYLES = {
  NORMAL: 'normal',
  ITALIC: 'italic'
} as const

// Line caps
export const LINE_CAPS = {
  ROUND: 'round',
  SQUARE: 'square',
  BUTT: 'butt'
} as const

// Line joins
export const LINE_JOINS = {
  ROUND: 'round',
  BEVEL: 'bevel',
  MITER: 'miter'
} as const
