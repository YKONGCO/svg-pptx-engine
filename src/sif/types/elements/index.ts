// Element types - unified exports

export * from './base'
export * from './shape'
export * from './text'
export * from './image'
export * from './line'
export * from './group'
export * from './video'
export * from './audio'
export * from './icon'

// Re-export Element union type
export type { Element, ElementType, BaseElement } from './base'
export type { ShapeElement, ShapeType, BaseShape, RectShape, CircleShape, EllipseShape, PathShape, LineShape, PolygonShape, PolylineShape } from './shape'
export type { TextElement, TextRun, RichTextElement, FontWeight, FontStyle, TextAlign, TextAnchor, TextDecoration, VerticalAlign, TextDecorationStyle } from './text'
export type { ImageElement, ImageFormat, ImageSrc } from './image'
export type { LineElement, ArrowHeadType, ArrowMarker } from './line'
export type { GroupElement } from './group'
export type { VideoElement, VideoFormat, VideoFit } from './video'
export type { AudioElement, AudioFormat, AudioPlaybackMode } from './audio'
export type { IconElement } from './icon'
