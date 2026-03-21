// Text element types
import { BaseElement } from './base'
import { Fill } from '../style/fill'

export type FontWeight = 'normal' | 'bold' | 'lighter' | 'bolder' | number
export type FontStyle = 'normal' | 'italic' | 'oblique'
export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type TextAnchor = 'start' | 'middle' | 'end'
export type TextDecoration = 'none' | 'underline' | 'line-through' | 'overline'
export type VerticalAlign = 'top' | 'middle' | 'bottom' | 'baseline'

/**
 * Text decoration styles
 */
export interface TextDecorationStyle {
  underline?: boolean
  lineThrough?: boolean
  overline?: boolean
  underlineColor?: string
  lineThroughColor?: string
  overlineColor?: string
}

/**
 * Text element
 */
export interface TextElement extends BaseElement {
  type: 'text'

  // Text content
  text: string

  // Font properties
  fontFamily: string
  fontSize: number        // in pixels
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  fontVariant?: 'normal' | 'small-caps'

  // Text color (uses fill)
  fill: Fill

  // Alignment
  textAlign?: TextAlign
  textAnchor?: TextAnchor         // text alignment anchor within the text box
  verticalAlign?: VerticalAlign   // vertical alignment within the text box
  lineHeight?: number             // line height in pixels
  letterSpacing?: number          // letter spacing in pixels

  // Decoration
  decoration?: TextDecorationStyle

  // Paragraph properties
  indent?: number                 // first line indent
  marginLeft?: number
  marginRight?: number

  // Text rotation
  textRotation?: number           // degrees
}

/**
 * Text run (part of a text element with different formatting)
 */
export interface TextRun {
  text: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  fill?: Fill
  decoration?: TextDecorationStyle
}

/**
 * Rich text element with multiple runs
 */
export interface RichTextElement extends BaseElement {
  type: 'text'
  text: string                     // Plain text fallback
  runs: TextRun[]                  // Formatted runs

  // Default font properties
  fontFamily: string
  fontSize: number
  fill: Fill

  // Alignment
  textAlign?: TextAlign
  textAnchor?: TextAnchor
  verticalAlign?: VerticalAlign
  lineHeight?: number
}
