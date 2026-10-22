import { walker } from '../walker.js'
import { buildStructuralColorCtrlPr } from './structural_color.js'

export function mfrac(element, targetParent, previousSibling, nextSibling, ancestors) {
  if (element.children.length !== 2) {
    // treat as mrow
    return targetParent
  }

  const numerator = element.children[0]
  const denumerator = element.children[1]
  const numeratorTarget = {
    name: 'm:num',
    type: 'tag',
    attribs: {},
    children: []
  }
  const denumeratorTarget = {
    name: 'm:den',
    type: 'tag',
    attribs: {},
    children: []
  }
  ancestors = [...ancestors]
  ancestors.unshift(element)
  walker(numerator, numeratorTarget, false, false, ancestors)
  walker(denumerator, denumeratorTarget, false, false, ancestors)
  const lt = element.attribs?.linethickness
  const fracType = (lt === '0' || lt === '0px' || lt === '0em' || lt === '0pt') ? 'noBar' : 'bar'
  const fPrChildren = [
    {
      type: 'tag',
      name: 'm:type',
      attribs: {
        'm:val': fracType
      },
      children: []
    }
  ]
  // Colour the fraction bar so it matches the runs above and
  // below. Without this, the bar is drawn in the default theme
  // colour while the digits and operators are in the formula's
  // own colour, which looks two-toned.
  const colorCtrlPr = buildStructuralColorCtrlPr(element, ancestors)
  if (colorCtrlPr) fPrChildren.push(colorCtrlPr)
  targetParent.children.push({
    type: 'tag',
    name: 'm:f',
    attribs: {},
    children: [
      {
        type: 'tag',
        name: 'm:fPr',
        attribs: {},
        children: fPrChildren
      },
      numeratorTarget,
      denumeratorTarget
    ]
  })
  // Don't iterate over children in the usual way.
}
