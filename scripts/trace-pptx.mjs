import { svgToSifWithDefs } from '../src/svg/converter.ts'
import { svgToPptx } from '../src/index.ts'
import { readFileSync } from 'node:fs'

const svg = readFileSync('example/06-clip-and-mask/01-clip-rect.svg', 'utf8')
const sif = svgToSifWithDefs(svg)
console.log('=== SIF top-level ===')
for (const el of sif.elements) {
  console.log(`  ${el.type} ${el.id ?? ''} x=${el.x ?? ''} y=${el.y ?? ''} transform=${JSON.stringify(el.transform)}`)
  if (el.type === 'group') {
    for (const c of el.children) {
      console.log(`    child ${c.type} ${c.id ?? ''} x=${c.x ?? ''} y=${c.y ?? ''} transform=${JSON.stringify(c.transform)}`)
      if (c.type === 'group') {
        for (const gc of c.children) {
          if (gc.type === 'shape') {
            console.log(`      shape ${gc.id ?? ''} x=${gc.x} y=${gc.y} w=${gc.width} h=${gc.height} clipPathId=${gc.clipPathId} clipPathRect=${JSON.stringify(gc.clipPathRect)} fill=${gc.fill?.color}`)
          }
        }
      }
    }
  }
}
console.log('clipPaths:', [...sif.defs.clipPaths.entries()].map(([k, v]) => ({ k, ...v })))
