async function main() {
  const PptxGenJS = require('../../packages/pptxgenjs/dist/pptxgen.cjs.js')

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Codex'
  pptx.subject = 'Compare grouped vs non-grouped rendering'

  const slide = pptx.addSlide()
  slide.background = { color: 'F7F4EE' }

  const svgData = 'data:image/svg+xml;base64,' + Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100">
    <rect width="160" height="100" rx="18" fill="#EADFCB"/>
    <circle cx="40" cy="50" r="22" fill="#D35D47"/>
    <rect x="72" y="28" width="56" height="14" rx="7" fill="#2F4858"/>
    <rect x="72" y="50" width="36" height="14" rx="7" fill="#F2A65A"/>
  </svg>
  `).toString('base64')

  slide.addText('Group Rendering Comparison', {
    x: 0.5, y: 0.3, w: 4.5, h: 0.4,
    fontSize: 24, bold: true, color: '2F4858'
  })
  slide.addText('Left: normal elements. Right: same content inside group.', {
    x: 0.5, y: 0.72, w: 6.5, h: 0.3,
    fontSize: 11, color: '5C6B73'
  })

  slide.addText('Normal', {
    x: 0.8, y: 1.15, w: 2.2, h: 0.3,
    fontSize: 14, bold: true, color: '2F4858'
  })
  slide.addShape('roundRect', {
    x: 0.8, y: 1.5, w: 3.8, h: 4.2,
    fill: { color: 'FFFDF9' },
    line: { color: 'CBB89D', width: 1.5 },
    shadow: { type: 'outer', blur: 2, offset: 1, angle: 45, color: '8B7355', opacity: 0.25 }
  })
  slide.addText('Styled Text Box', {
    x: 1.05, y: 1.8, w: 2.8, h: 0.7,
    fontSize: 18, bold: true, color: '7A3E2B',
    margin: 0.08, fill: { color: 'F7E8D4' },
    line: { color: 'D9B382', width: 1 }
  })
  slide.addImage({
    data: svgData,
    x: 1.1, y: 2.8, w: 2.9, h: 1.8,
    transparency: 8,
    altText: 'inline svg card',
    shadow: { type: 'outer', blur: 2, offset: 1, angle: 45, color: '7F6A58', opacity: 0.2 }
  })
  slide.addShape('line', {
    x: 1.0, y: 5.0, w: 2.8, h: 0,
    line: { color: 'D35D47', width: 2, dashType: 'dash' }
  })

  slide.addText('Grouped', {
    x: 5.6, y: 1.15, w: 2.2, h: 0.3,
    fontSize: 14, bold: true, color: '2F4858'
  })
  const group = slide.addGroup()
  group.addShape('roundRect', {
    x: 5.6, y: 1.5, w: 3.8, h: 4.2,
    fill: { color: 'FFFDF9' },
    line: { color: 'CBB89D', width: 1.5 },
    shadow: { type: 'outer', blur: 2, offset: 1, angle: 45, color: '8B7355', opacity: 0.25 }
  })
  group.addText('Styled Text Box', {
    x: 5.85, y: 1.8, w: 2.8, h: 0.7,
    fontSize: 18, bold: true, color: '7A3E2B',
    margin: 0.08, fill: { color: 'F7E8D4' },
    line: { color: 'D9B382', width: 1 }
  })
  group.addImage({
    data: svgData,
    x: 5.9, y: 2.8, w: 2.9, h: 1.8,
    transparency: 8,
    altText: 'inline svg card',
    shadow: { type: 'outer', blur: 2, offset: 1, angle: 45, color: '7F6A58', opacity: 0.2 }
  })
  group.addShape('line', {
    x: 5.8, y: 5.0, w: 2.8, h: 0,
    line: { color: 'D35D47', width: 2, dashType: 'dash' }
  })

  await pptx.writeFile({ fileName: 'output/group-compare-basic.pptx' })
  console.log('Created output/group-compare-basic.pptx')
}

main().catch(err => console.error(err))
