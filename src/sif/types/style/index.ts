// Style types - unified exports

export * from './fill'
export * from './stroke'
export * from './gradient'
export * from './effect'

// Re-export common types used in styles
export type { Color, Opacity, Percentage, Angle, DashArray } from '../common'
export type { LineCap, LineJoin } from './stroke'
