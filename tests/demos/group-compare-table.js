async function main() {
  const PptxGenJS = require('../../packages/pptxgenjs/dist/pptxgen.cjs.js')

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Codex'
  pptx.subject = 'Compare grouped table rendering'

  const slide = pptx.addSlide()
  slide.background = { color: 'FCFAF5' }

  slide.addText('Group Table Comparison', {
    x: 0.5, y: 0.3, w: 4.5, h: 0.4,
    fontSize: 24, bold: true, color: '2E4057'
  })
  slide.addText('This file checks that table rendering inside group now uses the normal serialization path.', {
    x: 0.5, y: 0.72, w: 8.6, h: 0.3,
    fontSize: 11, color: '66717A'
  })

  const rows = [
  [
    { text: 'Quarter', options: { bold: true, color: 'FFFFFF', align: 'center', fill: '355C7D' } },
    { text: 'Revenue', options: { bold: true, color: 'FFFFFF', align: 'center', fill: '355C7D' } },
    { text: 'Notes', options: { bold: true, color: 'FFFFFF', align: 'center', fill: '355C7D' } },
  ],
  [
    'Q1',
    { text: '$1.2M', options: { align: 'right', color: '2E4057' } },
    { text: 'Launch complete', options: { fill: 'EAF4F4' } },
  ],
  [
    'Q2',
    { text: '$1.6M', options: { align: 'right', color: '2E4057' } },
    { text: 'Group path regression check', options: { fill: 'F9F4E8' } },
  ],
  ]

  slide.addText('Normal Table', {
    x: 0.6, y: 1.2, w: 2.2, h: 0.3,
    fontSize: 14, bold: true, color: '2E4057'
  })
  slide.addTable(rows, {
    x: 0.6, y: 1.55, w: 4.0,
    border: { type: 'solid', pt: 1, color: 'B9C4CC' },
    margin: 0.08,
    fontSize: 11,
    rowH: [0.42, 0.44, 0.44],
  })

  slide.addText('Grouped Table', {
    x: 5.3, y: 1.2, w: 2.2, h: 0.3,
    fontSize: 14, bold: true, color: '2E4057'
  })
  const tableGroup = slide.addGroup()
  tableGroup.addShape('roundRect', {
    x: 5.1, y: 1.45, w: 4.35, h: 2.2,
    fill: { color: 'FFFFFF' },
    line: { color: 'D5DADF', width: 1 },
    shadow: { type: 'outer', blur: 1, offset: 1, angle: 45, color: '91979D', opacity: 0.18 }
  })
  tableGroup.addTable(rows, {
    x: 5.28, y: 1.65, w: 3.98,
    border: { type: 'solid', pt: 1, color: 'B9C4CC' },
    margin: 0.08,
    fontSize: 11,
    rowH: [0.42, 0.44, 0.44],
  })
  tableGroup.addText('Footer inside group', {
    x: 5.28, y: 3.95, w: 2.5, h: 0.3,
    fontSize: 10, color: '7A8791'
  })

  const slide2 = pptx.addSlide()
  slide2.background = { color: 'F8F6F0' }
  slide2.addText('Group Table Offset Check', {
    x: 0.5, y: 0.3, w: 4.5, h: 0.4,
    fontSize: 24, bold: true, color: '2E4057'
  })

  const moved = slide2.addGroup()
  moved.addShape('roundRect', {
    x: 1.2, y: 1.2, w: 7.0, h: 3.0,
    fill: { color: 'FFFDF9' },
    line: { color: 'D5CDBF', width: 1 }
  })
  moved.addText('Everything below is inside one group', {
    x: 1.45, y: 1.45, w: 4.2, h: 0.3,
    fontSize: 14, bold: true, color: '5F4B32'
  })
  moved.addTable(rows, {
    x: 1.45, y: 1.9, w: 4.4,
    border: { type: 'solid', pt: 1, color: 'B9C4CC' },
    margin: 0.08,
    fontSize: 11,
    rowH: [0.42, 0.44, 0.44],
  })

  await pptx.writeFile({ fileName: 'output/group-compare-table.pptx' })
  console.log('Created output/group-compare-table.pptx')
}

main().catch(err => console.error(err))
