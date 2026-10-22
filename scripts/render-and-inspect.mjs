import { svgToSifWithDefs } from '../src/svg/converter.ts'
import { generatePptx } from '../src/pptx/generator.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function render(svgPath, outName) {
  const svg = readFileSync(svgPath, 'utf8')
  const sif = svgToSifWithDefs(svg)
  const pptx = await generatePptx({
    elements: sif.elements,
    width: 1180,
    height: 460,
    defs: sif.defs
  })
  const out = join('output', outName)
  await pptx.writeFile({ fileName: out })
  console.log('Wrote', out)
}

await render('example/06-clip-and-mask/01-clip-rect.svg', '06-clip-and-mask/01-clip-rect.pptx')
await render('example/06-clip-and-mask/02-mask-alpha.svg', '06-clip-and-mask/02-mask-alpha.pptx')
await render('example/05-filters/05-filter-chain.svg', '05-filters/05-filter-chain.pptx')
