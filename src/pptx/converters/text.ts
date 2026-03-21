// Text Converter - Converts SIF text elements to pptxgenjs text

import PptxGenJS from 'pptxgenjs'
import type { TextElement, RichTextElement } from '../../sif/types/elements/text'
import type { Fill, SolidFill, GradientFill } from '../../sif/types/style/fill'
import {
  hexToPptxColor,
  opacityToTransparency,
  pxToInch,
  pxToPt,
  fontWeightToBool,
  fontStyleToBool,
  textAlignToPptx,
  verticalAlignToPptx
} from '../utils'

/**
 * Convert text fill to pptxgenjs color
 */
export function convertTextFill(fill: Fill): string {
  if (fill.type === 'solid') {
    const solid = fill as SolidFill
    return hexToPptxColor(solid.color)
  }

  if (fill.type === 'gradient') {
    const gradientFill = fill as GradientFill
    if (gradientFill.gradient.stops.length > 0) {
      return hexToPptxColor(gradientFill.gradient.stops[0].color)
    }
  }

  return '000000'
}

/**
 * Text conversion result
 */
export interface ConvertedText {
  text: string | PptxGenJS.TextProps[]
  options: PptxGenJS.TextPropsOptions
}

function convertTextRun(text: TextElement, run: RichTextElement['runs'][number]): PptxGenJS.TextProps {
  const options: PptxGenJS.TextPropsOptions = {
    fontFace: run.fontFamily || text.fontFamily,
    fontSize: pxToPt(run.fontSize || text.fontSize),
    bold: fontWeightToBool(run.fontWeight ?? text.fontWeight),
    italic: fontStyleToBool(run.fontStyle ?? text.fontStyle),
    color: run.fill ? convertTextFill(run.fill) : convertTextFill(text.fill)
  }

  if (run.decoration?.underline) {
    options.underline = { style: 'sng' }
  }

  if (run.decoration?.lineThrough) {
    options.strike = true
  }

  return {
    text: run.text,
    options
  }
}

/**
 * Convert text element to pptxgenjs text
 */
export function convertText(text: TextElement, hyperlink?: PptxGenJS.HyperlinkProps): ConvertedText {
  let x = text.x
  let align = textAlignToPptx(text.textAlign)

  if (text.textAnchor === 'middle' && text.width > 0) {
    align = 'center'
  } else if (text.textAnchor === 'end' && text.width > 0) {
    align = 'right'
  }

  const textOptions: PptxGenJS.TextPropsOptions = {
    fontFace: text.fontFamily,
    fontSize: pxToPt(text.fontSize),
    bold: fontWeightToBool(text.fontWeight),
    italic: fontStyleToBool(text.fontStyle),
    color: convertTextFill(text.fill),
    align,
    valign: verticalAlignToPptx(text.verticalAlign),
    // Position and size - critical for proper rendering
    x: pxToInch(x),
    y: pxToInch(text.y),
    w: pxToInch(text.width),
    h: pxToInch(text.height),
    // Remove default margin (PowerPoint defaults to "Normal" [3.5, 7.0, 3.5, 7.0] points)
    margin: 0
  }

  if (text.marginLeft !== undefined || text.marginRight !== undefined) {
    textOptions.margin = [0, pxToPt(text.marginRight ?? 0), 0, pxToPt(text.marginLeft ?? 0)]
  }

  // Line spacing - PPTX lineSpacingMultiple is a ratio (e.g., 1.5 for 150%)
  if (text.lineHeight) {
    textOptions.lineSpacingMultiple = text.lineHeight / text.fontSize
  }

  // Letter spacing - PPTX charSpacing is in points (pt)
  // SIF letterSpacing is in pixels (px), so convert: px * 0.75 = pt
  if (text.letterSpacing) {
    textOptions.charSpacing = pxToPt(text.letterSpacing)
  }

  // Text rotation - 90° and 270° are vertical text
  // Other rotations use the rotate property
  if (text.textRotation !== undefined) {
    if (text.textRotation === 90) {
      textOptions.vert = 'vert'
    } else if (text.textRotation === 270) {
      textOptions.vert = 'vert270'
    } else if (text.textRotation !== 0) {
      // Use rotate for other angles
      textOptions.rotate = text.textRotation
    }
  }

  // Handle decoration - underline and lineThrough
  if (text.decoration) {
    if (text.decoration.underline) {
      textOptions.underline = { style: 'sng' }
      if (text.decoration.underlineColor) {
        textOptions.underline.color = hexToPptxColor(text.decoration.underlineColor)
      }
    }
    if (text.decoration.lineThrough) {
      textOptions.strike = true
    }
    if (text.decoration.overline) {
      // PPTX doesn't support overline directly
      console.warn('Overline decoration is not supported in PPTX')
    }
  }

  // Apply opacity
  if (text.opacity !== undefined && text.opacity < 1) {
    const transparency = opacityToTransparency(text.opacity)
    if (transparency !== undefined) {
      textOptions.transparency = transparency
    }
  }

  // Handle rotation from transform
  if (text.transform?.rotate !== undefined) {
    textOptions.rotate = text.transform.rotate
  }

  if (hyperlink) {
    textOptions.hyperlink = hyperlink
  }

  // Indent using indentLevel
  if (text.indent) {
    textOptions.indentLevel = Math.floor(text.indent / 20) // Approximate conversion
  }

  const richText = (text as RichTextElement).runs
  const content = Array.isArray(richText) && richText.length > 0
    ? richText.map(run => convertTextRun(text, run))
    : text.text

  return {
    text: content,
    options: textOptions
  }
}

/**
 * Convert rich text element (with runs) to pptxgenjs text
 */
export function convertRichText(text: RichTextElement): ConvertedText[] {
  if (!text.runs || text.runs.length === 0) {
    return [convertText(text)]
  }

  const results: ConvertedText[] = []

  for (const run of text.runs) {
    const runOptions: PptxGenJS.TextPropsOptions = {
      fontFace: run.fontFamily || text.fontFamily,
      fontSize: pxToPt(run.fontSize || text.fontSize),
      bold: fontWeightToBool(run.fontWeight),
      italic: fontStyleToBool(run.fontStyle),
      color: run.fill ? convertTextFill(run.fill) : convertTextFill(text.fill)
    }

    if (run.decoration?.underline) {
      runOptions.underline = { style: 'sng' }
    }

    results.push({
      text: run.text,
      options: runOptions
    })
  }

  return results
}
