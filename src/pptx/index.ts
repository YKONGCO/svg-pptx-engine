// PPTX Generator - Main entry point

export * from './generator'
export * from './utils'
export { convertShape, convertFill, convertStrokeDef, convertEffect, type ConvertedShape } from './converters/shape'
export * from './converters/text'
export * from './converters/image'
export * from './converters/line'
export * from './converters/group'
export * from './converters/video'
export * from './converters/audio'
export * from './converters/slide'
