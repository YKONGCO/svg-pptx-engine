import { svgToSifWithDefs } from '../src/svg/converter.ts'
import { convertShape } from '../src/pptx/converters/shape.ts'

const svg1 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 460" width="1180" height="460">
  <defs>
    <clipPath id="clip-half">
      <rect x="0" y="0" width="120" height="160"/>
    </clipPath>
  </defs>
  <rect x="0" y="0" width="1180" height="460" fill="#FAFAFA"/>
  <g transform="translate(20,20)">
    <g clip-path="url(#clip-half)">
      <rect x="0" y="0" width="240" height="160" fill="#6B5B95"/>
    </g>
  </g>
</svg>`

const sif1 = svgToSifWithDefs(svg1)
const resources = {
  clipPaths: Object.fromEntries(sif1.defs.clipPaths),
  masks: Object.fromEntries(sif1.defs.masks),
  patterns: Object.fromEntries(sif1.defs.patterns),
}

for (const el of sif1.elements) {
  if (el.type === 'group') {
    for (const c of el.children) {
      if (c.type === 'group') {
        for (const gc of c.children) {
          if (gc.type === 'shape') {
            const r = convertShape(gc, undefined, resources)
            console.log('=== panel 1 purple rect pptx options ===')
            console.log('  x=%s y=%s w=%s h=%s', r.options.x, r.options.y, r.options.w, r.options.h)
            console.log('  x*96=%s y*96=%s w*96=%s h*96=%s', r.options.x*96, r.options.y*96, r.options.w*96, r.options.h*96)
          }
        }
      }
    }
  }
}
