import { svgToSifWithDefs } from '../src/svg/converter.ts'

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
console.log('=== panel 1 (clip-half) ===')
for (const el of sif1.elements) {
  console.log('  top-level:', el.type, el.id ?? '', 'transform=', JSON.stringify(el.transform))
  if (el.type === 'group') {
    for (const c of el.children) {
      console.log('    child:', c.type, c.id ?? '', 'transform=', JSON.stringify(c.transform))
      if (c.type === 'group') {
        for (const gc of c.children) {
          if (gc.type === 'shape') {
            console.log('      shape x=%s y=%s w=%s h=%s clipPathId=%s clipPathRect=%s',
              gc.x, gc.y, gc.width, gc.height, gc.clipPathId, JSON.stringify(gc.clipPathRect))
          }
        }
      }
    }
  }
}

console.log()
console.log('=== gradient mask (panel 5) ===')
const svg2 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 460" width="1180" height="460">
  <defs>
    <linearGradient id="mask-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="white"/>
      <stop offset="100%" stop-color="black"/>
    </linearGradient>
    <mask id="m-gradient">
      <rect x="0" y="0" width="240" height="160" fill="url(#mask-grad)"/>
    </mask>
  </defs>
  <rect x="0" y="0" width="1180" height="460" fill="#FAFAFA"/>
  <g transform="translate(20,270)">
    <rect x="20" y="40" width="520" height="100" fill="#2ECC71" mask="url(#m-gradient)"/>
  </g>
</svg>`
const sif2 = svgToSifWithDefs(svg2)
console.log('masks:', [...sif2.defs.masks.entries()].map(([k, v]) => ({ k, ...v })))
for (const el of sif2.elements) {
  if (el.type === 'shape' && el.maskId) {
    console.log('  shape maskId=%s fill=%s', el.maskId, JSON.stringify(el.fill))
  }
}
