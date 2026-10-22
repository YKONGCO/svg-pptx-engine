import { getStyle } from './text_style.js'

/**
 * Build an `<a:solidFill><a:srgbClr/></a:solidFill>` node for the
 * given CSS / hex colour string. The colour elements live in the
 * DrawingML namespace (`a:`), not the math namespace (`m:`) —
 * PowerPoint silently ignores `<m:solidFill>` / `<m:srgbClr>`
 * because the spec requires the DrawingML form. Accepts
 * `#RRGGBB` (with or without `#`) and the named X11 colours that
 * mml2omml normalises elsewhere (`red`, `blue`, etc.). Hex output
 * is emitted uppercase-free so PowerPoint accepts it. The slide
 * always declares `xmlns:a` so no extra namespace work is needed.
 */
function buildSolidFill(rawColor) {
  const color = String(rawColor).trim()
  let hex = color
  if (color.startsWith('#')) hex = color.slice(1)
  if (!/^[0-9A-Fa-f]{6}$/.test(hex) && !/^[0-9A-Fa-f]{3}$/.test(hex)) {
    // Fallback: leave the original string. PowerPoint will
    // resolve named colours it knows.
    hex = color.replace(/^#/, '')
  }
  return {
    name: 'a:solidFill',
    type: 'tag',
    attribs: {},
    children: [
      {
        name: 'a:srgbClr',
        type: 'tag',
        attribs: { val: hex },
        children: []
      }
    ]
  }
}

/**
 * Cambria Math is the canonical math font shipped with every
 * supported version of PowerPoint (and the default theme's
 * `+mj-lt` major-minor Latin). Pinning it explicitly on every
 * `<a:rPr>` keeps the rendered glyphs the same regardless of
 * which font the user happens to have installed — without this
 * the renderer may fall back to whatever the surrounding text
 * uses, which corrupts math glyphs (e.g. a Roman "x" instead of
 * the italic math "x", or a text-styled integral instead of the
 * math integral).
 */
function buildCambriaMathFace() {
  return {
    name: 'a:latin',
    type: 'tag',
    attribs: {
      typeface: 'Cambria Math',
      panose: '02040503050406030204',
      charset: '0'
    },
    children: []
  }
}

/**
 * Build the run-properties block that lives on every `<m:r>`.
 *
 * Why `<a:rPr>` (DrawingML) and not `<m:rPr>` (OMML)?
 * ----------------------------------------------------------
 * For **inline** math (the `<m:oMath>` placed inside `<a14:m>` in
 * a text body, which is the only form this project emits because
 * SVG formulas go into a textbox), PowerPoint's renderer only
 * honours the run properties when they sit in the DrawingML
 * namespace. `<m:rPr>` is silently dropped, so any colour set on
 * the run is ignored and the formula falls back to the default
 * black. By emitting `<a:rPr>` (with `b="1"` / `i="1"` attributes
 * for bold/italic) we get the same effect in PowerPoint as the
 * pure-OMML form has in Word.
 *
 * The block carries:
 *   - `<a:solidFill><a:srgbClr val="…"/>` when `style.color` is set
 *     (resolved from MathML's `mathcolor` attribute)
 *   - `<a:latin typeface="Cambria Math" …/>` so PowerPoint picks
 *     the right math font even when the surrounding text font is
 *     something else
 *   - `b="1"` / `i="1"` attributes for bold / italic variants
 *
 * Children that only exist in OMML — `<m:nor>`, `<m:sty>` — are
 * dropped: DrawingML has no equivalent and PowerPoint would warn
 * about unknown children inside `<a:rPr>`.
 */
function buildRunProperties(style) {
  const attribs = {}
  if (style.variant) {
    if (style.variant.includes('bold')) attribs.b = '1'
    if (style.variant.includes('italic')) attribs.i = '1'
  }
  const children = []
  if (style.color) {
    children.push(buildSolidFill(style.color))
  }
  children.push(buildCambriaMathFace())
  return {
    name: 'a:rPr',
    type: 'tag',
    attribs,
    children
  }
}

function textContainer(element, targetParent, previousSibling, nextSibling, ancestors, textType) {
  // isNary redirect is now handled in walker's child loop

  const hasMglyphChild = element.children?.find((element) => element.name === 'mglyph')
  const style = getStyle(element, ancestors, previousSibling?.style)
  element.style = style // Add it to element to make it comparable
  element.hasMglyphChild = hasMglyphChild
  const styleSame =
    Object.keys(style).every((key) => {
      const previousStyle = previousSibling?.style
      return previousStyle && style[key] === previousStyle[key]
    }) && previousSibling?.hasMglyphChild === hasMglyphChild
  const sameGroup = // Only group mtexts or mi, mn, mo with oneanother.
    textType === previousSibling?.name ||
    (['mi', 'mn', 'mo'].includes(textType) && ['mi', 'mn', 'mo'].includes(previousSibling?.name))
  let targetElement
  const lastChild = targetParent.children[targetParent.children.length - 1]
  if (sameGroup && styleSame && !hasMglyphChild && lastChild?.name === 'm:r') {
    targetElement = lastChild.children[lastChild.children.length - 1]
  } else {
    const rElement = {
      name: 'm:r',
      type: 'tag',
      attribs: {},
      children: []
    }

    // Always emit a run-properties block when there is anything
    // non-default to record: bold/italic variant, an explicit
    // colour, or a non-italic glyph-only/mtext run. We never
    // emit an empty `<a:rPr/>` because that would clutter the
    // output without changing PowerPoint's behaviour (the run
    // already inherits the default from its `<a:p>` parent).
    const hasColor = !!style.color
    const hasVariant = !!style.variant
    const needsRPr = hasColor
      || hasVariant
      || hasMglyphChild
      || textType === 'mtext'
      || (textType === 'ms' && style.fontstyle === '')

    if (needsRPr) {
      rElement.children.push(buildRunProperties(style))
    }

    targetElement = {
      name: 'm:t',
      type: 'tag',
      attribs: {
        'xml:space': 'preserve'
      },
      children: []
    }
    rElement.children.push(targetElement)
    targetParent.children.push(rElement)
  }
  return targetElement
}

export function mtext(element, targetParent, previousSibling, nextSibling, ancestors) {
  return textContainer(element, targetParent, previousSibling, nextSibling, ancestors, 'mtext')
}

export function mi(element, targetParent, previousSibling, nextSibling, ancestors) {
  return textContainer(element, targetParent, previousSibling, nextSibling, ancestors, 'mi')
}

export function mn(element, targetParent, previousSibling, nextSibling, ancestors) {
  return textContainer(element, targetParent, previousSibling, nextSibling, ancestors, 'mn')
}

export function mo(element, targetParent, previousSibling, nextSibling, ancestors) {
  return textContainer(element, targetParent, previousSibling, nextSibling, ancestors, 'mo')
}

export function ms(element, targetParent, previousSibling, nextSibling, ancestors) {
  return textContainer(element, targetParent, previousSibling, nextSibling, ancestors, 'ms')
}
