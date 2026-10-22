import { buildStructuralColorCtrlPr } from './structural_color.js'

export function msqrt(element, targetParent, previousSibling, nextSibling, ancestors) {
  const targetElement = {
    name: 'm:e',
    type: 'tag',
    attribs: {},
    children: []
  }
  const radPrChildren = [
    {
      name: 'm:degHide',
      type: 'tag',
      attribs: {
        'm:val': 'on'
      },
      children: []
    }
  ]
  // Colour the radical sign (√) so the decoration matches the
  // runs inside the radicand. Without this, PowerPoint renders
  // the √ in its default theme colour while the content runs
  // carry the formula's own colour.
  const colorCtrlPr = buildStructuralColorCtrlPr(element, ancestors)
  if (colorCtrlPr) radPrChildren.push(colorCtrlPr)
  targetParent.children.push({
    name: 'm:rad',
    type: 'tag',
    attribs: {},
    children: [
      {
        name: 'm:radPr',
        type: 'tag',
        attribs: {},
        children: radPrChildren
      },
      {
        name: 'm:deg',
        type: 'tag',
        attribs: {},
        children: []
      },
      targetElement
    ]
  })
  return targetElement
}
