/**
 * Build a `<m:ctrlPr><a:rPr><a:solidFill>…</a:solidFill></a:rPr></m:ctrlPr>`
 * node for the property element of a structural math element
 * (`<m:radPr>` for √, `<m:naryPr>` for ∫/∑/∏, `<m:fPr>` for the
 * fraction bar). This is what tells PowerPoint to colour the
 * decoration symbol itself — without it the √ / ∫ / ∑ / fraction
 * bar draws in the default theme colour while the content runs
 * (which DO carry the colour) draw in the requested one, so the
 * formula looks two-toned.
 *
 * Colour resolution walks the same chain as the runs:
 *   1. the element's own `mathcolor` attribute
 *   2. the first child element that already has a `mathcolor`
 *      (covers `<msqrt><mrow>…</mrow></msqrt>` etc.)
 *   3. any `<mstyle color="…">` ancestor
 *
 * Returns `null` when no colour is in scope, so the caller can
 * skip the `<m:ctrlPr>` entirely and keep the OMML output small.
 *
 * The inner `<a:solidFill><a:srgbClr>` is in the DrawingML
 * namespace on purpose: PowerPoint's inline-math renderer ignores
 * the MathML-namespaced colour elements.
 */
export function buildStructuralColorCtrlPr(element, ancestors) {
  const color = resolveStructuralColor(element, ancestors)
  if (!color) return null
  const hex = color.startsWith('#') ? color.slice(1) : color
  return {
    name: 'm:ctrlPr',
    type: 'tag',
    attribs: {},
    children: [
      {
        name: 'a:rPr',
        type: 'tag',
        attribs: {},
        children: [
          {
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
          },
          {
            // Pin Cambria Math so the radical / nary / fraction
            // glyph (√, ∫, ∑, the bar) renders with the same
            // math font as the content runs.
            name: 'a:latin',
            type: 'tag',
            attribs: {
              typeface: 'Cambria Math',
              panose: '02040503050406030204',
              charset: '0'
            },
            children: []
          }
        ]
      }
    ]
  }
}

function resolveStructuralColor(element, ancestors) {
  const own = element.attribs?.mathcolor
  if (own) return own
  // Look one level deep for a child that already carries mathcolor —
  // e.g. `<msqrt><mrow><mi mathcolor="…">x</mi>…</mrow></msqrt>`.
  const childColor = findChildMathColor(element)
  if (childColor) return childColor
  // Fall back to a <mstyle color="…"> ancestor. This is what
  // MathML uses to push a colour down to a whole group.
  for (const a of ancestors) {
    if (a?.name === 'mstyle' && a.attribs?.color) return a.attribs.color
  }
  return null
}

function findChildMathColor(element) {
  if (!element.children?.length) return null
  for (const child of element.children) {
    if (child.attribs?.mathcolor) return child.attribs.mathcolor
    const nested = findChildMathColor(child)
    if (nested) return nested
  }
  return null
}
